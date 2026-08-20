import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalErrorCapture } from "./capture.service";

function makeCapture(debounceMs = 500) {
  const listener = vi.fn();
  const capture = new TerminalErrorCapture(
    "sandbox-1",
    listener,
    { cooldownMs: 0, debounceMs, maxOutputChars: 10_000, maxCommandCount: 20 },
  );
  return { listener, capture };
}

function typeCommand(capture: TerminalErrorCapture, command: string): void {
  for (const char of command) {
    capture.handleInput(char);
  }
  capture.handleInput("\r");
}

describe("TerminalErrorCapture", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the full accumulated output once the terminal goes quiet", () => {
    const { listener, capture } = makeCapture();

    typeCommand(capture, "npm install");
    capture.handleOutput("npm ERR! code ERESOLVE");
    capture.handleOutput("npm ERR! Could not resolve dependency tree");
    capture.handleOutput("npm ERR! Found: foo@1.0.0");

    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);

    expect(listener).toHaveBeenCalledTimes(1);
    const emitted = listener.mock.calls[0][0].failure;
    expect(emitted.command).toBe("npm install");
    expect(emitted.stderr).toContain("code ERESOLVE");
    expect(emitted.stderr).toContain("Could not resolve dependency tree");
    expect(emitted.stderr).toContain("Found: foo@1.0.0");
  });

  it("keystroke echoes extend the debounce window and do not re-report", () => {
    const { listener, capture } = makeCapture();

    typeCommand(capture, "npm install");
    capture.handleOutput("npm ERR! code ERESOLVE");
    vi.advanceTimersByTime(400);
    capture.handleOutput("n");
    vi.advanceTimersByTime(400);
    capture.handleOutput("p");

    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].failure.stderr).toContain("code ERESOLVE");
  });

  it("reports again once a new command has been typed", () => {
    const { listener, capture } = makeCapture();

    typeCommand(capture, "npm install");
    capture.handleOutput("npm ERR! code ERESOLVE");
    vi.advanceTimersByTime(500);
    expect(listener).toHaveBeenCalledTimes(1);

    typeCommand(capture, "npm install --force");
    capture.handleOutput("npm ERR! code ERESOLVE");
    vi.advanceTimersByTime(500);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not report a failure when no command was typed", () => {
    const { listener, capture } = makeCapture();

    capture.handleOutput("npm ERR! code ERESOLVE");
    vi.advanceTimersByTime(500);
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the latest failure for the explain button even after a repeat is suppressed", () => {
    const { capture } = makeCapture();

    typeCommand(capture, "npm install");
    capture.handleOutput("npm ERR! code ERESOLVE");
    vi.advanceTimersByTime(500);
    capture.handleOutput("npm ERR! Could not resolve dependency tree");
    vi.advanceTimersByTime(500);

    const last = capture.getLastFailure();
    expect(last?.command).toBe("npm install");
    expect(last?.stderr).toContain("Could not resolve dependency tree");
  });

  it("stops reporting after dispose", () => {
    const { listener, capture } = makeCapture();

    typeCommand(capture, "npm install");
    capture.handleOutput("npm ERR! code ERESOLVE");
    capture.dispose();
    vi.advanceTimersByTime(500);

    expect(listener).not.toHaveBeenCalled();
  });
});