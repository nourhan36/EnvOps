import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Terminal from '@/components/terminal/Terminal';
import { Terminal as MockXtermClass } from '@xterm/xterm';

vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    static instances: MockTerminal[] = [];
    cols = 80;
    rows = 24;
    loadAddon = vi.fn();
    open = vi.fn();
    focus = vi.fn();
    write = vi.fn();
    dispose = vi.fn();
    dataCallbacks: Array<(data: string) => void> = [];
    onData = vi.fn((cb: (data: string) => void) => {
      this.dataCallbacks.push(cb);
      return { dispose: vi.fn() };
    });

    constructor() {
      MockTerminal.instances.push(this);
    }

    type(data: string) {
      this.dataCallbacks.forEach((cb) => cb(data));
    }
  }

  return { Terminal: MockTerminal };
});

vi.mock('@xterm/addon-fit', () => {
  class MockFitAddon {
    fit = vi.fn();
  }

  return { FitAddon: MockFitAddon };
});

function createFakeSocket(connected = true) {
  const handlers = new Map<string, (payload?: unknown) => void>();
  const emit = vi.fn();

  return {
    connected,
    on: vi.fn((event: string, cb: (payload?: unknown) => void) => {
      handlers.set(event, cb);
    }),
    once: vi.fn((event: string, cb: (payload?: unknown) => void) => {
      handlers.set(event, cb);
    }),
    off: vi.fn((event: string) => {
      handlers.delete(event);
    }),
    emit,
    emitEvent: (event: string, payload?: unknown) => handlers.get(event)?.(payload),
  };
}

function getStartCalls(socket: ReturnType<typeof createFakeSocket>) {
  return socket.emit.mock.calls.filter(([event]) => event === 'terminal:start');
}

function getResizeCalls(socket: ReturnType<typeof createFakeSocket>) {
  return socket.emit.mock.calls.filter(([event]) => event === 'terminal:resize');
}

function getEmits(socket: ReturnType<typeof createFakeSocket>, event: string) {
  return socket.emit.mock.calls.filter(([name]) => name === event);
}

function currentTerm(): any {
  return (MockXtermClass as any).instances.at(-1);
}

function typeInto(term: any, data: string) {
  act(() => {
    term.type(data);
  });
}

describe('Terminal', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    (globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverMock;
    (MockXtermClass as any).instances.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts the terminal immediately when the socket is already connected', () => {
    const socket = createFakeSocket(true);
    render(<Terminal socket={socket as never} sandboxId="sandbox-42" />);

    const start = getStartCalls(socket);
    expect(start).toHaveLength(1);
    expect(start[0][1]).toEqual({ sandboxId: 'sandbox-42', cols: 80, rows: 24 });
  });

  it('starts the terminal when the socket connects later', () => {
    const socket = createFakeSocket(false);
    render(<Terminal socket={socket as never} sandboxId="sandbox-42" />);

    expect(getStartCalls(socket)).toHaveLength(0);

    act(() => socket.emitEvent('connect'));
    expect(getStartCalls(socket)).toHaveLength(1);
  });

  it('retries the start after the server rejects it', () => {
    const socket = createFakeSocket(false);
    render(<Terminal socket={socket as never} sandboxId="sandbox-42" />);

    act(() => socket.emitEvent('connect'));
    const firstAck = getStartCalls(socket)[0][2];

    act(() => firstAck({ ok: false, error: { code: 'SANDBOX_NOT_RUNNING', message: 'not running' } }));
    act(() => socket.emitEvent('connect'));

    expect(getStartCalls(socket)).toHaveLength(2);
  });

  it('does not emit a duplicate start after a successful acknowledgement', () => {
    const socket = createFakeSocket(false);
    render(<Terminal socket={socket as never} sandboxId="sandbox-42" />);

    act(() => socket.emitEvent('connect'));
    const ack = getStartCalls(socket)[0][2];

    act(() => ack({ ok: true }));
    act(() => socket.emitEvent('connect'));

    expect(getStartCalls(socket)).toHaveLength(1);
  });

  it('does not emit resize before the terminal has started', () => {
    const socket = createFakeSocket(true);
    render(<Terminal socket={socket as never} sandboxId="sandbox-42" />);

    act(() => window.dispatchEvent(new Event('resize')));

    expect(getResizeCalls(socket)).toHaveLength(0);
  });

  it('syncs the size when the terminal starts and emits resize afterwards', () => {
    const socket = createFakeSocket(true);
    render(<Terminal socket={socket as never} sandboxId="sandbox-42" />);

    act(() => socket.emitEvent('terminal:started', {}));
    expect(getResizeCalls(socket)).toHaveLength(1);
    expect(getResizeCalls(socket)[0][1]).toEqual({ cols: 80, rows: 24 });

    act(() => window.dispatchEvent(new Event('resize')));
    expect(getResizeCalls(socket)).toHaveLength(2);
    expect(getResizeCalls(socket)[1][1]).toEqual({ cols: 80, rows: 24 });
  });

  it('stops emitting resize once the terminal has exited', () => {
    const socket = createFakeSocket(true);
    render(<Terminal socket={socket as never} sandboxId="sandbox-42" />);

    act(() => socket.emitEvent('terminal:started', {}));
    const resizesBeforeExit = getResizeCalls(socket).length;

    act(() => socket.emitEvent('terminal:exit', { exitCode: 0 }));
    act(() => window.dispatchEvent(new Event('resize')));

    expect(getResizeCalls(socket)).toHaveLength(resizesBeforeExit);
  });
});

describe('Terminal /ai interception', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    (globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverMock;
    (MockXtermClass as any).instances.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderTerminal() {
    const socket = createFakeSocket(true);
    render(<Terminal socket={socket as never} sandboxId="sandbox-42" />);
    const term = currentTerm();
    expect(term).toBeTruthy();
    act(() => socket.emitEvent('terminal:started', {}));
    return { socket, term };
  }

  function ackLastTranslate(
    socket: ReturnType<typeof createFakeSocket>,
    response: unknown,
  ) {
    const calls = getEmits(socket, 'ai:translate');
    expect(calls.length).toBeGreaterThan(0);
    const acknowledge = calls.at(-1)![2];
    act(() => acknowledge(response));
  }

  it('holds /ai keystrokes locally without forwarding them to the PTY', () => {
    const { socket, term } = renderTerminal();

    typeInto(term, '/ai find the largest files');

    expect(getEmits(socket, 'terminal:input')).toHaveLength(0);
    // Local echo still happened (intent chars are dimmed).
    expect(term.write).toHaveBeenCalledWith('/');
    expect(term.write).toHaveBeenCalledWith('\x1b[2mf\x1b[0m');
  });

  it('flushes held keystrokes to the shell when the line diverges from /ai', () => {
    const { socket, term } = renderTerminal();

    typeInto(term, '/b');

    const inputs = getEmits(socket, 'terminal:input');
    expect(inputs).toHaveLength(1);
    expect(inputs[0][1]).toEqual({ data: '/b' });
    expect(getEmits(socket, 'ai:translate')).toHaveLength(0);
  });

  it('forwards ordinary commands straight through, Enter included', () => {
    const { socket } = renderTerminal();
    const term = currentTerm();

    typeInto(term, 'ls -la\r');

    const inputs = getEmits(socket, 'terminal:input');
    expect(inputs[inputs.length - 1][1]).toEqual({ data: 'ls -la\r' });
    expect(getEmits(socket, 'ai:translate')).toHaveLength(0);
  });

  it('emits ai:translate on Enter and never sends the newline to the shell', () => {
    const { socket } = renderTerminal();
    const term = currentTerm();

    typeInto(term, '/ai list running containers\r');

    const translates = getEmits(socket, 'ai:translate');
    expect(translates).toHaveLength(1);
    expect(translates[0][1]).toEqual({
      sandboxId: 'sandbox-42',
      intent: 'list running containers',
    });
    expect(getEmits(socket, 'terminal:input')).toHaveLength(0);
  });

  it('ignores empty /ai intents and resets with a fresh prompt instead', () => {
    const { socket } = renderTerminal();
    const term = currentTerm();

    typeInto(term, '/ai \r');

    expect(getEmits(socket, 'ai:translate')).toHaveLength(0);
    expect(getEmits(socket, 'terminal:input')[0][1]).toEqual({ data: '\x03' });
  });

  it('injects the translated command as shell keystrokes without executing it', () => {
    const { socket, term } = renderTerminal();

    typeInto(term, '/ai biggest logs\r');
    ackLastTranslate(socket, {
      ok: true,
      translation: {
        command: 'du -ah /var/log | sort -rh | head',
        is_destructive: false,
        explanation: 'Shows the largest log files.',
      },
    });

    expect(term.write).toHaveBeenCalledWith(
      expect.stringContaining('# Shows the largest log files.'),
    );
    // The command is fed to the shell (which echoes it onto the prompt line)
    // but never auto-executed: no carriage return may be sent.
    expect(getEmits(socket, 'terminal:input')).toHaveLength(1);
    expect(getEmits(socket, 'terminal:input')[0][1]).toEqual({
      data: 'du -ah /var/log | sort -rh | head',
    });
  });

  it('strips control characters (newline smuggling) from injected commands', () => {
    const { socket } = renderTerminal();
    const term = currentTerm();

    typeInto(term, '/ai clean up\r');
    ackLastTranslate(socket, {
      ok: true,
      translation: {
        command: 'rm -rf ./build\necho pwned',
        is_destructive: false,
        explanation: 'Cleans build output.',
      },
    });

    const inputs = getEmits(socket, 'terminal:input');
    expect(inputs[0][1]).toEqual({ data: 'rm -rf ./buildecho pwned' });
    expect(inputs.some(([, payload]) => String((payload as any)?.data).includes('\n'))).toBe(false);
  });

  it('renders translation errors inline without touching the shell', () => {
    const { socket, term } = renderTerminal();

    typeInto(term, '/ai do a thing\r');
    ackLastTranslate(socket, {
      ok: false,
      error: { code: 'AI_RATE_LIMITED', message: 'Limit of 10/minute reached.' },
    });

    expect(term.write).toHaveBeenCalledWith(
      '\x1b[31m[AI_RATE_LIMITED] Limit of 10/minute reached.\x1b[0m\r\n',
    );
    expect(getEmits(socket, 'terminal:input')).toHaveLength(0);
  });

  it('cancels a pending request on Ctrl+C and discards late responses', () => {
    const { socket, term } = renderTerminal();

    typeInto(term, '/ai slow request\r');
    expect(getEmits(socket, 'ai:translate')).toHaveLength(1);

    typeInto(term, '\x03');
    expect(getEmits(socket, 'terminal:input')[0][1]).toEqual({ data: '\x03' });

    const writesBeforeAck = term.write.mock.calls.length;
    ackLastTranslate(socket, {
      ok: true,
      translation: {
        command: 'should-not-appear',
        is_destructive: false,
        explanation: 'stale',
      },
    });

    expect(term.write).not.toHaveBeenCalledWith('should-not-appear');
    expect(term.write.mock.calls.length).toBeGreaterThanOrEqual(writesBeforeAck);
  });

  it('forwards escape sequences only while in normal mode', () => {
    const { socket, term } = renderTerminal();

    typeInto(term, '\x1b[A');
    expect(getEmits(socket, 'terminal:input')[0][1]).toEqual({ data: '\x1b[A' });

    typeInto(term, '/ai ');
    const inputsAfterLock = getEmits(socket, 'terminal:input').length;
    typeInto(term, '\x1b[C');
    expect(getEmits(socket, 'terminal:input')).toHaveLength(inputsAfterLock);
  });
});

describe('Terminal destructive command banner', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    (globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverMock;
    (MockXtermClass as any).instances.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderWithDestructive() {
    const socket = createFakeSocket(true);
    render(<Terminal socket={socket as never} sandboxId="sandbox-42" />);
    const term = currentTerm();
    act(() => socket.emitEvent('terminal:started', {}));
    typeInto(term, '/ai delete the build folder\r');
    act(() => {
      getEmits(socket, 'ai:translate').at(-1)![2]({
        ok: true,
        translation: {
          command: 'rm -rf ./build',
          is_destructive: true,
          explanation: 'Deletes the build directory.',
        },
      });
    });
    return { socket, term };
  }

  it('shows the banner and executes only via the Run button', () => {
    const { socket } = renderWithDestructive();

    expect(screen.getByRole('alertdialog')).toHaveTextContent('rm -rf ./build');

    fireEvent.click(screen.getByRole('button', { name: /run anyway/i }));

    const executions = getEmits(socket, 'terminal:input').filter(
      ([, payload]) => (payload as any)?.data === '\r',
    );
    expect(executions).toHaveLength(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('discards the injected command without emitting an execution', () => {
    const { socket } = renderWithDestructive();

    fireEvent.click(screen.getByRole('button', { name: /discard/i }));

    const executions = getEmits(socket, 'terminal:input').filter(
      ([, payload]) => (payload as any)?.data === '\r',
    );
    expect(executions).toHaveLength(0);
    // Ctrl+U clears the shell's input buffer (the command was injected there).
    const kills = getEmits(socket, 'terminal:input').filter(
      ([, payload]) => (payload as any)?.data === '\x15',
    );
    expect(kills).toHaveLength(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});