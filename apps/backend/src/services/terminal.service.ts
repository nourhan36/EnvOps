import * as pty from "node-pty";
import { env } from "../config/env";
import {
  SandboxTerminalTarget,
  TerminalExitPayload,
} from "../types/terminal.types";

interface TerminalHooks {
  onData: (data: string) => void;
  onExit: (payload: TerminalExitPayload) => void;
}

interface ActiveTerminal {
  process: pty.IPty;
  dataDisposable: pty.IDisposable;
  exitDisposable: pty.IDisposable;
  target: SandboxTerminalTarget;
}

function stringEnvironment(): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }

  result.TERM = "xterm-256color";
  return result;
}

function kubectlGlobalArgs(): string[] {
  const args: string[] = [];

  if (env.kubectlContext) {
    args.push(`--context=${env.kubectlContext}`);
  }

  return args;
}

function buildExecArguments(target: SandboxTerminalTarget): string[] {
  const args = [
    ...kubectlGlobalArgs(),
    "exec",
    "--namespace",
    target.namespace,
    target.podName,
    "--stdin",
    "--tty",
  ];

  if (target.containerName) {
    args.push("--container", target.containerName);
  }

  args.push("--", target.shell);
  return args;
}

export class TerminalService {
  private readonly terminals = new Map<string, ActiveTerminal>();

  has(socketId: string): boolean {
    return this.terminals.has(socketId);
  }

  start(
    socketId: string,
    target: SandboxTerminalTarget,
    cols: number,
    rows: number,
    hooks: TerminalHooks,
  ): void {
    // One active terminal is allowed for each Socket.IO connection.
    // Starting a new terminal closes an older one for the same socket.
    this.close(socketId);

    const terminalProcess = pty.spawn(
      env.kubectlBin,
      buildExecArguments(target),
      {
        name: "xterm-256color",
        cols,
        rows,
        cwd: process.cwd(),
        env: stringEnvironment(),
      },
    );

    const dataDisposable = terminalProcess.onData((data) => {
      hooks.onData(data);
    });

    const exitDisposable = terminalProcess.onExit(({ exitCode, signal }) => {
      const active = this.terminals.get(socketId);

      if (active?.process === terminalProcess) {
        active.dataDisposable.dispose();
        active.exitDisposable.dispose();
        this.terminals.delete(socketId);
      }

      hooks.onExit({ exitCode, signal });
    });

    this.terminals.set(socketId, {
      process: terminalProcess,
      dataDisposable,
      exitDisposable,
      target,
    });
  }

  write(socketId: string, data: string): boolean {
    const terminal = this.terminals.get(socketId);

    if (!terminal) {
      return false;
    }

    terminal.process.write(data);
    return true;
  }

  resize(socketId: string, cols: number, rows: number): boolean {
    const terminal = this.terminals.get(socketId);

    if (!terminal) {
      return false;
    }

    terminal.process.resize(cols, rows);
    return true;
  }

  close(socketId: string): void {
    const terminal = this.terminals.get(socketId);

    if (!terminal) {
      return;
    }

    // Delete first so a late onExit callback cannot remove a newer terminal.
    this.terminals.delete(socketId);
    terminal.dataDisposable.dispose();
    terminal.exitDisposable.dispose();

    try {
      terminal.process.kill();
    } catch (error) {
      console.warn(`Failed to kill terminal for socket ${socketId}:`, error);
    }
  }

  closeAll(): void {
    for (const socketId of [...this.terminals.keys()]) {
      this.close(socketId);
    }
  }
}

export const terminalService = new TerminalService();
