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
  TerminalTargetError: class TerminalTargetError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "TerminalTargetError";
    }
  },
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

vi.mock("../services/command-translate.service", () => ({
  commandTranslateService: {
    translate: vi.fn(),
  },
}));

import { registerTerminalSocketHandlers } from "./terminal.socket";
import { terminalService } from "../services/terminal.service";
import { resolveSandboxTerminalTarget } from "../services/sandbox-terminal-target.service";
import { commandTranslateService } from "../services/command-translate.service";

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

describe("ai:translate handler", () => {
  const READY_TRANSLATION = {
    status: "ready",
    model: "deepseek.test",
    translation: {
      command: "du -ah /var/log | sort -rh | head -n 10",
      is_destructive: false,
      explanation: "Lists the largest files.",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveSandboxTerminalTarget).mockResolvedValue({
      sandboxId: "sandbox-42",
      namespace: "sandbox-ns",
      podName: "sandbox-terminal",
      containerName: "sandbox-container",
      shell: "/bin/sh",
    } as any);
  });

  function emitTranslate(
    socket: ReturnType<typeof createFakeSocket>,
    payload: unknown,
  ): Promise<any> {
    return new Promise((resolve) => {
      socket.emitEvent("ai:translate", payload, (response: any) =>
        resolve(response),
      );
    });
  }

  it("acks a successful translation", async () => {
    const socket = createFakeSocket();
    vi.mocked(commandTranslateService.translate).mockResolvedValue(
      READY_TRANSLATION as any,
    );

    registerTerminalSocketHandlers(socket);
    const ack = await emitTranslate(socket, {
      sandboxId: "sandbox-42",
      intent: "find big log files",
    });

    expect(ack).toEqual({ ok: true, translation: READY_TRANSLATION.translation });
    // Ownership is proven against the sandbox, not trusted from the client.
    expect(resolveSandboxTerminalTarget).toHaveBeenCalledWith(
      "sandbox-42",
      "demo@envops.dev",
    );
  });

  it("rejects malformed payloads", async () => {
    const socket = createFakeSocket();
    registerTerminalSocketHandlers(socket);

    expect((await emitTranslate(socket, { intent: "x" })).error?.code).toBe("INVALID_PAYLOAD");
    expect(
      (await emitTranslate(socket, { sandboxId: "s-1", intent: "   " })).error?.code,
    ).toBe("INVALID_PAYLOAD");
    expect((await emitTranslate(socket, null)).error?.code).toBe("INVALID_PAYLOAD");
    expect(commandTranslateService.translate).not.toHaveBeenCalled();
  });

  it("rejects over-long intents without consuming the LLM", async () => {
    const socket = createFakeSocket();
    registerTerminalSocketHandlers(socket);

    const ack = await emitTranslate(socket, {
      sandboxId: "sandbox-42",
      intent: "a".repeat(501),
    });

    expect(ack.error?.code).toBe("INTENT_TOO_LONG");
    expect(commandTranslateService.translate).not.toHaveBeenCalled();
  });

  it("allows only one in-flight translation per connection", async () => {
    const socket = createFakeSocket();
    let release!: (value: any) => void;
    vi.mocked(commandTranslateService.translate).mockReturnValue(
      new Promise<any>((resolve) => {
        release = resolve;
      }),
    );

    registerTerminalSocketHandlers(socket);

    let firstAck: any;
    let secondAck: any;
    socket.emitEvent(
      "ai:translate",
      { sandboxId: "sandbox-42", intent: "first" },
      (response: any) => (firstAck = response),
    );
    socket.emitEvent(
      "ai:translate",
      { sandboxId: "sandbox-42", intent: "second" },
      (response: any) => (secondAck = response),
    );

    expect(secondAck?.error?.code).toBe("AI_RATE_LIMITED");

    release(READY_TRANSLATION);
    await vi.waitFor(() => expect(firstAck?.ok).toBe(true));

    // The slot is freed after completion.
    const thirdAck = await new Promise<any>((resolve) => {
      socket.emitEvent(
        "ai:translate",
        { sandboxId: "sandbox-42", intent: "third" },
        resolve,
      );
    });
    expect(thirdAck.ok).toBe(true);
  });

  it("maps a failed translation to AI_TRANSLATION_FAILED", async () => {
    const socket = createFakeSocket();
    vi.mocked(commandTranslateService.translate).mockResolvedValue({
      status: "failed",
      reason: "bad_response",
      issues: ["The model returned an empty response."],
      retryable: true,
    } as any);

    registerTerminalSocketHandlers(socket);
    const ack = await emitTranslate(socket, {
      sandboxId: "sandbox-42",
      intent: "list files",
    });

    expect(ack.error?.code).toBe("AI_TRANSLATION_FAILED");
    expect(ack.error?.message).toContain("empty response");
  });

  it("blocks unsafe commands even when the model returns them", async () => {
    const socket = createFakeSocket();
    vi.mocked(commandTranslateService.translate).mockResolvedValue({
      status: "ready",
      model: "m",
      translation: {
        command: ":(){ :|:& };:",
        is_destructive: false,
        explanation: "fork bomb",
      },
    } as any);

    registerTerminalSocketHandlers(socket);
    const ack = await emitTranslate(socket, {
      sandboxId: "sandbox-42",
      intent: "do the thing",
    });

    expect(ack.error?.code).toBe("AI_UNSAFE_COMMAND");
  });

  it("propagates sandbox ownership errors", async () => {
    const socket = createFakeSocket();
    const { TerminalTargetError } = await import(
      "../services/sandbox-terminal-target.service"
    );
    vi.mocked(resolveSandboxTerminalTarget).mockRejectedValue(
      new TerminalTargetError("SANDBOX_NOT_FOUND", "No such sandbox."),
    );

    registerTerminalSocketHandlers(socket);
    const ack = await emitTranslate(socket, {
      sandboxId: "someone-elses-sandbox",
      intent: "list files",
    });

    expect(ack.error?.code).toBe("SANDBOX_NOT_FOUND");
    expect(commandTranslateService.translate).not.toHaveBeenCalled();
  });
});