export type ErrorSeverity = "error" | "warning";

export interface ErrorSignatureMatch {
  matched: boolean;
  signature?: string;
  severity?: ErrorSeverity;
}

interface ErrorPattern {
  pattern: RegExp;
  signature: string;
  severity: ErrorSeverity;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  { pattern: /command not found/i, signature: "command not found", severity: "error" },
  { pattern: /no such file or directory/i, signature: "no such file or directory", severity: "error" },
  { pattern: /permission denied/i, signature: "permission denied", severity: "error" },
  { pattern: /not a directory/i, signature: "not a directory", severity: "error" },
  { pattern: /is a directory/i, signature: "is a directory", severity: "error" },
  { pattern: /cannot open file/i, signature: "cannot open file", severity: "error" },
  { pattern: /npm (err|error)!/i, signature: "npm error", severity: "error" },
  { pattern: /npm error/i, signature: "npm error", severity: "error" },
  { pattern: /yarn error/i, signature: "yarn error", severity: "error" },
  { pattern: /\bfatal:/i, signature: "fatal error", severity: "error" },
  { pattern: /fatal error/i, signature: "fatal error", severity: "error" },
  { pattern: /cannot find module/i, signature: "module not found", severity: "error" },
  { pattern: /module not found/i, signature: "module not found", severity: "error" },
  { pattern: /syntaxerror/i, signature: "syntax error", severity: "error" },
  { pattern: /referenceerror/i, signature: "reference error", severity: "error" },
  { pattern: /typeerror/i, signature: "type error", severity: "error" },
  { pattern: /rangeerror/i, signature: "range error", severity: "error" },
  { pattern: /traceback \(most recent call last\)/i, signature: "python traceback", severity: "error" },
  { pattern: /connection (was )?refused/i, signature: "connection refused", severity: "error" },
  { pattern: /eaddrinuse/i, signature: "address already in use", severity: "error" },
  { pattern: /econnrefused/i, signature: "connection refused", severity: "error" },
  { pattern: /panic:/i, signature: "panic", severity: "error" },
  { pattern: /segmentation fault/i, signature: "segmentation fault", severity: "error" },
  { pattern: /psql:/i, signature: "postgres client error", severity: "error" },
  { pattern: /redis (error|err)!/i, signature: "redis error", severity: "error" },
  { pattern: /command failed/i, signature: "command failed", severity: "error" },
  { pattern: /exit status \d+/i, signature: "non-zero exit status", severity: "error" },
  { pattern: /make(?:\[\d+\])?: \*\*\*/i, signature: "make error", severity: "error" },
  { pattern: /killed$|^\s*killed\b/i, signature: "process killed", severity: "error" },
  { pattern: /(^|\s)(error|failed|failure):/i, signature: "generic error", severity: "error" },
  { pattern: /\bbash:\b|\bsh:\b|\bzsh:\b/, signature: "shell error", severity: "error" },
  // Generic fallback for the ubiquitous "program: <error message>" format that
  // no specific signature covers (e.g. "passwd: Cannot determine your user
  // name."). Kept last so specific signatures take priority. The lookahead
  // scans the rest of the line for a strong error keyword, so it tolerates
  // error-code prefixes like "curl: (7) Failed..." and quoted args like
  // "git: 'foo' is not a git command". Multiline `^` matches any line within a
  // multi-line output block.
  {
    pattern:
      /^[a-z0-9._-]+:(?=[^:\n]*(?:cannot|could not|unable|failed|failure|error|exception|is not|not a|no such|not found|unknown|invalid|missing|unrecognized|denied|permission|access|must|expected|requires?|required|out of|too many|too few|unexpected|illegal)\b)/im,
    signature: "generic error",
    severity: "error",
  },
];

/**
 * Strips ANSI escape sequences from terminal output so detection operates on
 * clean text (also what gets sent to the LLM).
 */
export function stripAnsi(data: string): string {
  // eslint-disable-next-line no-control-regex
  return data.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\x1b[()][0-9A-Z]/g, "");
}

export function detectErrorSignature(line: string): ErrorSignatureMatch {
  const cleaned = stripAnsi(line);

  if (!cleaned.trim()) {
    return { matched: false };
  }

  for (const { pattern, signature, severity } of ERROR_PATTERNS) {
    if (pattern.test(cleaned)) {
      return { matched: true, signature, severity };
    }
  }

  return { matched: false };
}

export interface CommandLineBuffer {
  current: string;
  lines: string[];
  maxLines: number;
}

/**
 * Incremental command-line reconstructor. Mirrors the frontend's handling of
 * raw xterm input: printable characters append, \r completes a line, backspace
 * (\u007f) removes the last character, and Ctrl-C (\u0003) cancels the draft.
 * ANSI escape sequences (arrow keys, colors) are skipped entirely.
 */
export function applyInputChunk(
  state: CommandLineBuffer,
  chunk: string,
): { completedLines: string[]; state: CommandLineBuffer } {
  const next: CommandLineBuffer = { ...state, current: state.current, lines: [...state.lines] };
  const completedLines: string[] = [];

  let i = 0;

  while (i < chunk.length) {
    const char = chunk[i];
    const code = char.charCodeAt(0);

    if (char === "\x1b") {
      i = skipEscapeSequence(chunk, i);
      continue;
    }

    if (char === "\r" || char === "\n") {
      const line = next.current.trim();
      next.current = "";
      if (line) {
        next.lines.push(line);
        completedLines.push(line);
        if (next.lines.length > next.maxLines) {
          next.lines.shift();
        }
      }
    } else if (char === "\u007f") {
      next.current = next.current.slice(0, -1);
    } else if (char === "\u0003") {
      next.current = "";
    } else if (char >= " ") {
      next.current += char;
    }

    i += 1;
  }

  return { completedLines, state: next };
}

/**
 * Advances past an ANSI escape sequence starting at `index` (which must point
 * at ESC). Supports CSI (ESC [ params/intermediates + final), OSC (ESC ] ...
 * until BEL or ST) and short two-character sequences.
 */
function skipEscapeSequence(chunk: string, index: number): number {
  const next = chunk[index + 1];

  if (next === "[" || next === "]") {
    let i = index + 2;

    while (i < chunk.length) {
      const code = chunk.charCodeAt(i);
      if (chunk[i] === "\x07") {
        return i + 1;
      }
      if (code >= 0x40 && code <= 0x7e) {
        return i + 1;
      }
      if (code < 0x20 || code === 0x7f) {
        return i;
      }
      i += 1;
    }

    return i;
  }

  return index + 2;
}

export function createCommandLineBuffer(maxLines = 20): CommandLineBuffer {
  return { current: "", lines: [], maxLines };
}
