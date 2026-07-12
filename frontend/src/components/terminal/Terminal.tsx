import { useEffect, useRef } from 'react';
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

export interface TerminalProps {
  socket: Socket | null;
  className?: string;
  /** Intelligence layer: subscribe to raw terminal output without blocking the CLI */
  onOutput?: (data: string) => void;
}

export default function Terminal({ socket, className, onOutput }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputBufferRef = useRef('');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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

    const handleOutput = (data: string) => {
      term.write(data);
      onOutput?.(data);
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

      socket?.emit('terminal-input', data);
    };

    const dataDisposable = term.onData(handleTerminalInput);

    socket?.on('terminal-output', handleOutput);

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(container);

    const handleWindowResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      resizeObserver.disconnect();
      socket?.off('terminal-output', handleOutput);
      dataDisposable.dispose();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [socket, onOutput]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        backgroundColor: VS_CODE_THEME.background,
        overflow: 'hidden',
      }}
    />
  );
}
