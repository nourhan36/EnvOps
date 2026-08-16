import { env } from "../config/env";
import {
  applyInputChunk,
  CommandLineBuffer,
  createCommandLineBuffer,
  detectErrorSignature,
  stripAnsi,
} from "../ai/error-detector";

export interface CapturedFailure {
  command: string;
  stderr: string;
  signature?: string;
  detectedAt: Date;
}

export interface CapturedFailureEvent {
  sandboxId: string;
  failure: CapturedFailure;
}

export interface CaptureOptions {
  cooldownMs: number;
  debounceMs: number;
  maxOutputChars: number;
  maxCommandCount: number;
}

type FailureListener = (event: CapturedFailureEvent) => void;

const DEFAULT_OPTIONS: CaptureOptions = {
  cooldownMs: env.aiErrorCooldownMs,
  debounceMs: env.aiErrorDebounceMs,
  maxOutputChars: env.aiErrorMaxCapturedChars,
  maxCommandCount: 20,
};

/**
 * Hooks the existing PTY stream for one sandbox:
 *  - `handleInput` reconstructs the typed command lines from raw keystrokes.
 *  - `handleOutput` accumulates ANSI-stripped output for the most recent
 *    command and runs the heuristic error detector.
 *
 * Note: because the PTY runs an interactive shell (kubectl exec -it -- /bin/sh),
 * stdout and stderr are merged and there is no per-command exit code. Detection
 * is therefore signature-based on the output text; `onExit` only fires when the
 * whole PTY process dies and is treated as a session-end signal, not a failure.
 */
export class TerminalErrorCapture {
  private readonly lineBuffer: CommandLineBuffer;
  private outputLines: string[] = [];
  private lastFailure: CapturedFailure | null = null;
  private lastTriggerAt = 0;
  private reportedForCommand: string | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private disposed = false;

  constructor(
    private readonly sandboxId: string,
    private readonly listener: FailureListener,
    private readonly options: CaptureOptions = DEFAULT_OPTIONS,
  ) {
    this.lineBuffer = createCommandLineBuffer(options.maxCommandCount);
  }

  handleInput(chunk: string): void {
    if (!chunk) {
      return;
    }

    const { completedLines, state } = applyInputChunk(this.lineBuffer, chunk);

    this.lineBuffer.current = state.current;
    this.lineBuffer.lines = state.lines;

    if (completedLines.length > 0) {
      // A new command starts: cancel any pending detection for the command
      // that just finished, clear the accumulated output, and allow a fresh
      // failure report for the next command.
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.outputLines = [];
      this.reportedForCommand = null;
    }
  }

  handleOutput(data: string): void {
    if (!data) {
      return;
    }

    const cleaned = stripAnsi(data);
    if (!cleaned.trim()) {
      return;
    }

    const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    for (const line of lines) {
      this.outputLines.push(line);
    }

    this.trimOutput();

    // Debounce detection: wait for the terminal to go quiet so the detector
    // evaluates the *full* error output, not just the first matching chunk.
    this.scheduleDetection();
  }

  private scheduleDetection(): void {
    if (this.disposed) {
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.runDetection();
    }, this.options.debounceMs);
  }

  private runDetection(): void {
    if (this.disposed) {
      return;
    }

    const currentCommand = this.lineBuffer.lines[this.lineBuffer.lines.length - 1];
    const output = this.outputLines.join("\n");

    if (!currentCommand || !output) {
      return;
    }

    const detection = detectErrorSignature(output);

    if (!detection.matched) {
      return;
    }

    const now = Date.now();

    const failure: CapturedFailure = {
      command: currentCommand,
      stderr: output,
      signature: detection.signature,
      detectedAt: new Date(),
    };

    // Always keep the latest failure so the explain button can answer it.
    this.lastFailure = failure;

    if (now - this.lastTriggerAt < this.options.cooldownMs) {
      return;
    }

    // Report only once per command execution; keystroke echoes while the
    // error is still on screen would otherwise keep re-triggering.
    if (this.reportedForCommand === currentCommand) {
      return;
    }

    this.lastTriggerAt = now;
    this.reportedForCommand = currentCommand;

    this.listener({
      sandboxId: this.sandboxId,
      failure,
    });
  }

  getLastFailure(): CapturedFailure | null {
    return this.lastFailure;
  }

  dispose(): void {
    this.disposed = true;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.outputLines = [];
    this.lineBuffer.current = "";
    this.lineBuffer.lines = [];
    this.lastFailure = null;
  }

  private trimOutput(): void {
    let total = 0;

    for (let i = this.outputLines.length - 1; i >= 0; i--) {
      total += Buffer.byteLength(this.outputLines[i], "utf8");

      if (total > this.options.maxOutputChars) {
        this.outputLines.splice(0, i + 1);
        break;
      }
    }
  }
}

interface SandboxCapture {
  capture: TerminalErrorCapture;
}

/**
 * Per-sandbox capture registry shared by the terminal socket (write side) and
 * the explain-error endpoint (read side). The current app uses a single
 * terminal socket per sandbox, so attaching to a sandbox that is already
 * attached replaces (and disposes) the previous capture.
 */
export class ErrorCaptureRegistry {
  private readonly captures = new Map<string, SandboxCapture>();

  attach(sandboxId: string, capture: TerminalErrorCapture): void {
    const existing = this.captures.get(sandboxId);
    existing?.capture.dispose();
    this.captures.set(sandboxId, { capture });
  }

  detach(sandboxId: string): void {
    const existing = this.captures.get(sandboxId);
    existing?.capture.dispose();
    this.captures.delete(sandboxId);
  }

  detachIf(sandboxId: string, capture: TerminalErrorCapture): void {
    const existing = this.captures.get(sandboxId);

    if (existing?.capture === capture) {
      capture.dispose();
      this.captures.delete(sandboxId);
    }
  }

  getLastFailure(sandboxId: string): CapturedFailure | null {
    return this.captures.get(sandboxId)?.capture.getLastFailure() ?? null;
  }

  size(): number {
    return this.captures.size;
  }
}

export const errorCaptureRegistry = new ErrorCaptureRegistry();
