import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Terminal from '@/components/terminal/Terminal';

vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    cols = 80;
    rows = 24;
    loadAddon = vi.fn();
    open = vi.fn();
    focus = vi.fn();
    write = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    dispose = vi.fn();
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

describe('Terminal', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    (globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverMock;
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
});