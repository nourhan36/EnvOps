import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';

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

interface TerminalError {
  code: string;
  message: string;
}

interface TerminalAck {
  ok: boolean;
  error?: TerminalError;
}

export interface TerminalProps {
  socket: Socket | null;
  sandboxId: string;
  className?: string;
  /** Intelligence layer: subscribe to raw terminal output without blocking the CLI */
  onOutput?: (data: string) => void;
}

export default function Terminal({ socket, sandboxId, className, onOutput }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputBufferRef = useRef('');
  const startedRef = useRef(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);

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
      setTerminalError(null);
      term.write('\r\n\x1b[32mConnected to sandbox terminal.\x1b[0m\r\n');
    };

    const handleError = (payload: TerminalError) => {
      setTerminalError(payload.message);
      term.write(`\r\n\x1b[31m[${payload.code}] ${payload.message}\x1b[0m\r\n`);
    };

    const handleExit = (payload: { exitCode?: number; signal?: number }) => {
      term.write(
        `\r\n\x1b[33mTerminal closed (${payload.exitCode ?? payload.signal ?? 'exit'}).\x1b[0m\r\n`,
      );
    };

    const handleTerminalInput = (data: string) => {
      if (data === '\r') {
        const line = inputBufferRef.current.trim();
        if (line.startsWith(AI_COMMAND_PREFIX)) {
          socket?.emit('ai-command', { prompt: line.slice(AI_COMMAND_PREFIX.length) });
          inputBufferRef.current = '';
          return;
        }
        inputBufferRef.current = '';
      } else if (data === '\u007f') {
        inputBufferRef.current = inputBufferRef.current.slice(0, -1);
      } else if (data >= ' ') {
        inputBufferRef.current += data;
      }

      socket?.emit('terminal:input', { data });
    };

    const dataDisposable = term.onData(handleTerminalInput);

    socket?.on('terminal:output', handleOutput);
    socket?.on('terminal:started', handleStarted);
    socket?.on('terminal:error', handleError);
    socket?.on('terminal:exit', handleExit);

    if (socket?.connected) {
      startTerminal();
    } else {
      socket?.once('connect', startTerminal);
    }

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      socket?.emit('terminal:resize', { cols: term.cols, rows: term.rows });
    });
    resizeObserver.observe(container);

    const handleWindowResize = () => {
      fitAddon.fit();
      socket?.emit('terminal:resize', { cols: term.cols, rows: term.rows });
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      resizeObserver.disconnect();
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

  return (
    <div className={className} style={{ position: 'relative' }}>
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
