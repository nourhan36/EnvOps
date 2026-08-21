import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';
import DestructiveCommandBanner from './DestructiveCommandBanner';

const VS_CODE_THEME = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#aeafad',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5',
} as const;

const AI_COMMAND_PREFIX = '/ai ';
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;
// ANSI: 2 = dim/faint, 22 = normal intensity, 90 = bright black, 31 = red.
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

interface TerminalError {
  code: string;
  message: string;
}

interface TerminalAck {
  ok: boolean;
  error?: TerminalError;
}

export interface AiTranslation {
  command: string;
  is_destructive: boolean;
  explanation: string;
}

export type AiTranslateAck =
  | { ok: true; translation: AiTranslation }
  | { ok: false; error: TerminalError };

export interface TerminalProps {
  socket: Socket | null;
  sandboxId: string;
  className?: string;
  /** Intelligence layer: subscribe to raw terminal output without blocking the CLI */
  onOutput?: (data: string) => void;
}

/**
 * Defense in depth for auto-execution: the backend already rejects commands
 * containing newlines/control characters, but nothing is ever trusted from
 * the wire onto the cursor line without stripping them locally too. Any
 * surviving \r/\n would execute the pasted command immediately.
 */
function sanitizeInjectedCommand(command: string): string {
  return command.replace(/[\u0000-\u001f\u007f]/g, '');
}

export default function Terminal({ socket, sandboxId, className, onOutput }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputBufferRef = useRef('');
  const startedRef = useRef(false);
  const readyRef = useRef(false);
  /**
   * "/ai" interception state machine. As soon as a fresh line starts with "/"
   * we stop forwarding keystrokes to the PTY (so the shell never buffers the
   * intent) and hold them as a local echo. Completing the "/ai " prefix locks
   * AI mode; diverging (e.g. "/bin") rewinds the local echo and hands the
   * held keystrokes back to the shell.
   */
  type AiMode = 'normal' | 'observing' | 'locked';
  const aiModeRef = useRef<AiMode>('normal');
  const aiPendingRef = useRef(false);
  const aiGenerationRef = useRef(0);
  const spinnerTimerRef = useRef<number | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [destructive, setDestructive] = useState<AiTranslation | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    startedRef.current = false;

    const term = new XTerm({
      theme: VS_CODE_THEME,
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(container);
    fitAddon.fit();
    term.focus();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    const startTerminal = () => {
      if (startedRef.current || !socket) return;
      startedRef.current = true;
      socket.emit('terminal:start', {
        sandboxId,
        cols: term.cols,
        rows: term.rows,
      }, (response: TerminalAck) => {
        if (response && !response.ok) {
          startedRef.current = false;
        }
      });
    };

    const handleOutput = (payload: { data: string }) => {
      term.write(payload.data);
      onOutput?.(payload.data);
    };

    const handleStarted = () => {
      readyRef.current = true;
      setTerminalError(null);
      term.write('\r\n\x1b[32mConnected to sandbox terminal.\x1b[0m\r\n');
      // The backend registers the PTY before emitting terminal:started, so the
      // current size is safe to sync now - this covers resizes that happened
      // while the start was in flight.
      fitAddon.fit();
      socket?.emit('terminal:resize', { cols: term.cols, rows: term.rows });
    };

    const handleError = (payload: TerminalError) => {
      setTerminalError(payload.message);
      term.write(`\r\n\x1b[31m[${payload.code}] ${payload.message}\x1b[0m\r\n`);
    };

    const handleExit = (payload: { exitCode?: number; signal?: number }) => {
      readyRef.current = false;
      term.write(
        `\r\n\x1b[33mTerminal closed (${payload.exitCode ?? payload.signal ?? 'exit'}).\x1b[0m\r\n`,
      );
    };

    // ---------- /ai translation UX ----------

    const stopSpinner = () => {
      if (spinnerTimerRef.current !== null) {
        window.clearInterval(spinnerTimerRef.current);
        spinnerTimerRef.current = null;
      }
    };

    const eraseCurrentLine = () => {
      term.write('\r\x1b[2K');
    };

    /**
     * Cancels an in-flight or locked /ai interaction: erases our locally
     * echoed text, bumps the generation so late responses are discarded, and
     * sends Ctrl+C so the shell redraws a fresh prompt.
     */
    const cancelAiInteraction = () => {
      aiGenerationRef.current += 1;
      aiPendingRef.current = false;
      stopSpinner();
      eraseCurrentLine();
      aiModeRef.current = 'normal';
      inputBufferRef.current = '';
      socket?.emit('terminal:input', { data: '\x03' });
      term.focus();
    };

    const startSpinner = () => {
      let frame = 0;
      spinnerTimerRef.current = window.setInterval(() => {
        eraseCurrentLine();
        term.write(`${DIM}${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]} translating…${RESET}`);
        frame += 1;
      }, SPINNER_INTERVAL_MS);
    };

    const submitAiIntent = (intent: string) => {
      if (!socket || aiPendingRef.current) return;

      const generation = ++aiGenerationRef.current;
      aiPendingRef.current = true;
      setDestructive(null);
      startSpinner();

      socket.emit('ai:translate', { sandboxId, intent }, (response: AiTranslateAck) => {
        // A cancel/newer request superseded this response.
        if (aiGenerationRef.current !== generation) return;

        aiPendingRef.current = false;
        stopSpinner();
        eraseCurrentLine();

        if (response.ok) {
          const { command, is_destructive, explanation } = response.translation;
          term.write(`${DIM}# ${explanation}${RESET}\r\n`);

          if (!readyRef.current) {
            // No live PTY to type into - surface the command read-only.
            term.write(`\x1b[33m[ai] terminal inactive, command:\x1b[0m ${sanitizeInjectedCommand(command)}\r\n`);
          } else {
            // Feed the command to the shell as synthetic keystrokes WITHOUT a
            // trailing newline: the shell echoes it onto the real prompt line,
            // the user can edit it, and execution stays strictly
            // user-initiated (Enter / Run button). Painting it locally with
            // term.write would leave the shell's buffer empty - Enter would
            // submit an empty line and "nothing happens".
            socket?.emit('terminal:input', { data: sanitizeInjectedCommand(command) });
            if (is_destructive) {
              setDestructive(response.translation);
            }
          }
        } else {
          term.write(`\x1b[31m[${response.error.code}] ${response.error.message}\x1b[0m\r\n`);
        }
        term.focus();
      });
    };

    // Keystrokes destined for the PTY, batched per onData chunk.
    let forwardChunk = '';

    const flushForward = () => {
      if (forwardChunk) {
        socket?.emit('terminal:input', { data: forwardChunk });
        forwardChunk = '';
      }
    };

    /**
     * Rewinds exactly the characters we echoed locally while holding the
     * line, so the shell can re-echo them after we flush - no double text.
     */
    const rewindLocalEcho = (count: number) => {
      for (let i = 0; i < count; i++) {
        term.write('\b \b');
      }
    };

    const exitObservingToNormal = () => {
      aiModeRef.current = 'normal';
      inputBufferRef.current = '';
    };

    const handleCharacter = (ch: string): void => {
      // Translation request already submitted: only Ctrl+C gets through.
      if (aiPendingRef.current) {
        if (ch === '\x03') {
          cancelAiInteraction();
        }
        return;
      }

      // ----- locked: full "/ai " prefix typed, everything is local -----
      if (aiModeRef.current === 'locked') {
        if (ch === '\r') {
          const intent = inputBufferRef.current
            .slice(AI_COMMAND_PREFIX.length)
            .trim();
          inputBufferRef.current = '';
          aiModeRef.current = 'normal';
          if (!intent) {
            cancelAiInteraction();
            return;
          }
          submitAiIntent(intent);
          return;
        }
        if (ch === '\x03' || ch === '\x1b') {
          cancelAiInteraction();
          return;
        }
        if (ch === '\u007f') {
          if (inputBufferRef.current.length > AI_COMMAND_PREFIX.length) {
            inputBufferRef.current = inputBufferRef.current.slice(0, -1);
            term.write('\b \b');
          }
          return;
        }
        if (ch >= ' ') {
          inputBufferRef.current += ch;
          term.write(`${DIM}${ch}${RESET}`);
        }
        return;
      }

      // ----- observing: a "/" line is being held to see if it becomes /ai -----
      if (aiModeRef.current === 'observing') {
        if (ch === '\u007f') {
          // Nothing was ever sent to the shell, so a backspace only needs to
          // undo our local hold - no PTY traffic required.
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          term.write('\b \b');
          if (inputBufferRef.current === '') {
            aiModeRef.current = 'normal';
          }
          return;
        }

        const next = inputBufferRef.current + ch;

        if (next === AI_COMMAND_PREFIX) {
          aiModeRef.current = 'locked';
          inputBufferRef.current = next;
          // The held prefix was echoed plainly; keep it and dim from here on.
          term.write(`${DIM} ${RESET}`);
          return;
        }

        if (AI_COMMAND_PREFIX.startsWith(next)) {
          inputBufferRef.current = next;
          term.write(ch);
          return;
        }

        // Diverged (e.g. "/bin") - rewind our echo, then let the shell
        // receive and re-echo the held keystrokes as ordinary input.
        rewindLocalEcho(inputBufferRef.current.length);
        exitObservingToNormal();
        forwardChunk += next;
        return;
      }

      // ----- normal: pass-through with eager /ai detection -----
      if (ch === '\r') {
        inputBufferRef.current = '';
        setDestructive(null);
      } else if (ch === '\x03' || ch === '\x15') {
        // Ctrl+C or Ctrl+U: the shell drops its pending line; mirror that.
        inputBufferRef.current = '';
      } else if (ch === '\u007f') {
        inputBufferRef.current = inputBufferRef.current.slice(0, -1);
      } else if (ch >= ' ') {
        inputBufferRef.current += ch;
      }

      if (
        ch === '/' &&
        inputBufferRef.current === '/'
      ) {
        aiModeRef.current = 'observing';
        term.write(ch);
        return;
      }

      forwardChunk += ch;
    };

    const handleTerminalInput = (data: string) => {
      // Multi-byte escape sequences (arrows etc.) arrive atomically in one
      // onData callback. In observing/locked mode they would desync our
      // linear buffer, so only normal mode forwards them untouched.
      if (data.length > 1 && data.charCodeAt(0) === 27) {
        if (aiModeRef.current !== 'normal' || aiPendingRef.current) {
          return;
        }
        socket?.emit('terminal:input', { data });
        return;
      }

      for (const ch of data) {
        handleCharacter(ch);
      }
      flushForward();
    };

    const dataDisposable = term.onData(handleTerminalInput);

    socket?.on('terminal:output', handleOutput);
    socket?.on('terminal:started', handleStarted);
    socket?.on('terminal:error', handleError);
    socket?.on('terminal:exit', handleExit);

    socket?.on('connect', startTerminal);

    if (socket?.connected) {
      startTerminal();
    }

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (readyRef.current) {
        socket?.emit('terminal:resize', { cols: term.cols, rows: term.rows });
      }
    });
    resizeObserver.observe(container);

    const handleWindowResize = () => {
      fitAddon.fit();
      if (readyRef.current) {
        socket?.emit('terminal:resize', { cols: term.cols, rows: term.rows });
      }
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      resizeObserver.disconnect();
      readyRef.current = false;
      aiGenerationRef.current += 1;
      stopSpinner();
      socket?.emit('terminal:stop');
      socket?.off('connect', startTerminal);
      socket?.off('terminal:output', handleOutput);
      socket?.off('terminal:started', handleStarted);
      socket?.off('terminal:error', handleError);
      socket?.off('terminal:exit', handleExit);
      dataDisposable.dispose();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [socket, sandboxId, onOutput]);

  const runDestructiveCommand = () => {
    const term = terminalRef.current;
    if (!term || !destructive) return;
    // The single explicit auto-execution path: the user clicked "Run".
    // Input goes through the PTY channel (term.write only touches the
    // display); the PTY echoes the Enter back so the newline renders too.
    socket?.emit('terminal:input', { data: '\r' });
    term.focus();
    setDestructive(null);
  };

  const discardDestructiveCommand = () => {
    const term = terminalRef.current;
    if (!term) return;
    // The injected command lives in the shell's input buffer (it was fed in
    // as synthetic keystrokes), so Ctrl+U is what clears it - the tty driver
    // erases the echoed characters visually as well.
    socket?.emit('terminal:input', { data: '\x15' });
    term.focus();
    setDestructive(null);
  };

  return (
    <div className={className} style={{ position: 'relative' }}>
      {destructive && (
        <DestructiveCommandBanner
          command={sanitizeInjectedCommand(destructive.command)}
          explanation={destructive.explanation}
          onRun={runDestructiveCommand}
          onDiscard={discardDestructiveCommand}
        />
      )}
      {terminalError && (
        <div className="absolute left-0 right-0 top-0 z-10 border-b border-status-danger/30 bg-status-danger/15 px-3 py-1.5 text-xs text-status-danger">
          {terminalError}
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 0,
          backgroundColor: VS_CODE_THEME.background,
          overflow: 'hidden',
        }}
      />
    </div>
  );
}
