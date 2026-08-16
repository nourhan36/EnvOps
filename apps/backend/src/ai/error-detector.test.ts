import { describe, expect, it } from "vitest";
import {
  applyInputChunk,
  createCommandLineBuffer,
  detectErrorSignature,
  stripAnsi,
} from "./error-detector";

describe("stripAnsi", () => {
  it("removes common ANSI color sequences", () => {
    expect(stripAnsi("\x1b[31merror\x1b[0m")).toBe("error");
  });

  it("leaves plain text untouched", () => {
    expect(stripAnsi("npm ERR! code ERESOLVE")).toBe("npm ERR! code ERESOLVE");
  });
});

describe("detectErrorSignature", () => {
  it.each([
    ["npm ERR! code ERESOLVE", "npm error"],
    ["bash: foo: command not found", "command not found"],
    ["fatal: not a git repository", "fatal error"],
    ["Error: Cannot find module 'lodash'", "module not found"],
    ["Traceback (most recent call last):", "python traceback"],
    ["connect ECONNREFUSED 127.0.0.1:5432", "connection refused"],
    ["Error: listen EADDRINUSE: address already in use :::3000", "address already in use"],
    ["passwd: Cannot determine your user name.", "generic error"],
    ["git: 'foo' is not a git command", "generic error"],
    ["curl: (7) Failed to connect to localhost port 5432", "generic error"],
    ["dpkg: error processing package foo", "generic error"],
  ])("detects %s", (output, signature) => {
    const result = detectErrorSignature(output);
    expect(result.matched).toBe(true);
    expect(result.signature).toBe(signature);
  });

  it("ignores normal output", () => {
    const output = ["/workspace # ls -la", "total 12", "drwxr-xr-x 1 root root 4096 ."].join("\n");
    expect(detectErrorSignature(output).matched).toBe(false);
  });
});

describe("applyInputChunk", () => {
  it("reconstructs a command line from keystrokes", () => {
    let state = createCommandLineBuffer();

    for (const char of "npm install") {
      ({ state } = applyInputChunk(state, char));
    }

    expect(state.current).toBe("npm install");

    const { completedLines, state: afterEnter } = applyInputChunk(state, "\r");
    expect(completedLines).toEqual(["npm install"]);
    expect(afterEnter.current).toBe("");
    expect(afterEnter.lines).toEqual(["npm install"]);
  });

  it("handles backspace", () => {
    let state = createCommandLineBuffer();

    for (const char of "npm instal") {
      ({ state } = applyInputChunk(state, char));
    }

    ({ state } = applyInputChunk(state, "\u007f"));
    ({ state } = applyInputChunk(state, "l"));
    ({ state } = applyInputChunk(state, "l"));
    ({ state } = applyInputChunk(state, "\r"));

    expect(state.lines).toEqual(["npm install"]);
  });

  it("cancels the draft on Ctrl-C", () => {
    let state = createCommandLineBuffer();
    ({ state } = applyInputChunk(state, "abc"));
    expect(state.current).toBe("abc");

    ({ state } = applyInputChunk(state, "\u0003"));
    expect(state.current).toBe("");
  });

  it("ignores escape sequences (arrow keys)", () => {
    let state = createCommandLineBuffer();
    ({ state } = applyInputChunk(state, "ls\x1b[A"));
    expect(state.current).toBe("ls");
  });

  it("caps stored lines", () => {
    let state = createCommandLineBuffer(2);
    ({ state } = applyInputChunk(state, "a\rb\rc\r"));
    expect(state.lines).toEqual(["b", "c"]);
  });
});
