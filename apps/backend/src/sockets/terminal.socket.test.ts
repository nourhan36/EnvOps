import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/terminal.service", () => ({
  terminalService: {
    start: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock("../services/sandbox-terminal-target.service", () => ({
  resolveSandboxTerminalTarget: vi.fn(),
  TerminalTargetError: class TerminalTargetError extends Error {},
}));

vi.mock("../error-interceptor/capture.service", () => ({
  errorCaptureRegistry: {
    attach: vi.fn(),
    detachIf: vi.fn(),
  },
  TerminalErrorCapture: class TerminalErrorCapture {
    handleOutput = vi.fn();
    handleInput = vi.fn();
  },
}));

import { registerTerminalSocketHandlers } from "./terminal.socket";
import { terminalService } from "../services/terminal.service";
import { resolveSandboxTerminalTarget } from "../services/sandbox-terminal-target.service";

function createFakeSocket() {
  const handlers = new Map<string, (...args: any[]) => void>();

  const socket: any = {
    id: "socket-1",
    data: { userEmail: "demo@envops.dev" },
    connected: true,
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      handlers.set(event, cb);
    }),
    once: vi.fn(),
    emit: vi.fn(),
    emitEvent: (event: string, ...args: any[]) => handlers.get(event)?.(...args),
  };

  return socket;
}

describe("terminal socket resize handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores a resize that arrives before the terminal is started", () => {
    const socket = createFakeSocket();
    vi.mocked(terminalService.resize).mockReturnValue(false);

    registerTerminalSocketHandlers(socket);
    socket.emitEvent("terminal:resize", { cols: 80, rows: 24 });

    expect(terminalService.resize).toHaveBeenCalledWith("socket-1", 80, 24);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("resizes an active terminal without emitting an error", () => {
    const socket = createFakeSocket();
    vi.mocked(terminalService.resize).mockReturnValue(true);

    registerTerminalSocketHandlers(socket);
    socket.emitEvent("terminal:resize", { cols: 120, rows: 30 });

    expect(terminalService.resize).toHaveBeenCalledWith("socket-1", 120, 30);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("clamps extreme resize values before resizing", () => {
    const socket = createFakeSocket();
    vi.mocked(terminalService.resize).mockReturnValue(true);

    registerTerminalSocketHandlers(socket);
    socket.emitEvent("terminal:resize", { cols: 10_000, rows: 0 });

    expect(terminalService.resize).toHaveBeenCalledWith("socket-1", 500, 1);
  });

  it("still rejects invalid resize payloads", () => {
    const socket = createFakeSocket();

    registerTerminalSocketHandlers(socket);
    socket.emitEvent("terminal:resize", { cols: "wide", rows: 24 });

    expect(socket.emit).toHaveBeenCalledWith(
      "terminal:error",
      expect.objectContaining({ code: "INVALID_PAYLOAD" }),
    );
  });
});

describe("terminal socket start coalescing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("coalesces a duplicate start while one is in flight", async () => {
    const socket = createFakeSocket();

    let resolveTarget!: (value: any) => void;
    const targetPromise = new Promise<any>((resolve) => {
      resolveTarget = resolve;
    });
    vi.mocked(resolveSandboxTerminalTarget).mockReturnValue(targetPromise);

    registerTerminalSocketHandlers(socket);

    let ack1: any;
    let ack2: any;
    socket.emitEvent(
      "terminal:start",
      { sandboxId: "sandbox-42", cols: 80, rows: 24 },
      (response: any) => (ack1 = response),
    );
    socket.emitEvent(
      "terminal:start",
      { sandboxId: "sandbox-42", cols: 80, rows: 24 },
      (response: any) => (ack2 = response),
    );

    // First start still in flight: no error should have been emitted.
    expect(socket.emit).not.toHaveBeenCalledWith("terminal:error", expect.anything());

    resolveTarget({
      sandboxId: "sandbox-42",
      namespace: "sandbox-ns",
      podName: "sandbox-terminal",
      containerName: "sandbox-container",
      shell: "/bin/sh",
    });

    await vi.waitFor(() => {
      expect(ack1?.ok).toBe(true);
      expect(ack2?.ok).toBe(true);
    });

    const startedEmits = socket.emit.mock.calls.filter(
      ([event]) => event === "terminal:started",
    );
    expect(startedEmits).toHaveLength(1);
    expect(terminalService.start).toHaveBeenCalledTimes(1);
    expect(socket.emit).not.toHaveBeenCalledWith("terminal:error", expect.anything());
  });

  it("propagates a failed start to the coalesced duplicate", async () => {
    const socket = createFakeSocket();

    let rejectTarget!: (reason?: any) => void;
    const targetPromise = new Promise<any>((_, reject) => {
      rejectTarget = reject;
    });
    vi.mocked(resolveSandboxTerminalTarget).mockReturnValue(targetPromise);

    registerTerminalSocketHandlers(socket);

    let ack1: any;
    let ack2: any;
    socket.emitEvent(
      "terminal:start",
      { sandboxId: "sandbox-42", cols: 80, rows: 24 },
      (response: any) => (ack1 = response),
    );
    socket.emitEvent(
      "terminal:start",
      { sandboxId: "sandbox-42", cols: 80, rows: 24 },
      (response: any) => (ack2 = response),
    );

    rejectTarget(new Error("pod not found"));

    await vi.waitFor(() => {
      expect(ack1?.ok).toBe(false);
      expect(ack2?.ok).toBe(false);
    });

    expect(terminalService.start).not.toHaveBeenCalled();
  });
});