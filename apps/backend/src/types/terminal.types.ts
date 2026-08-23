export interface TerminalStartPayload {
  sandboxId: string;
  cols?: number;
  rows?: number;
}

export interface TerminalInputPayload {
  data: string;
}

export interface TerminalResizePayload {
  cols: number;
  rows: number;
}

export interface TerminalOutputPayload {
  data: string;
}

export interface TerminalStartedPayload {
  sandboxId: string;
  namespace: string;
  podName: string;
  containerName?: string;
}

export interface TerminalExitPayload {
  exitCode?: number;
  signal?: number;
}

export interface AIErrorDetectedPayload {
  sandboxId: string;
  command: string;
  stderrPreview: string;
  signature?: string;
  detectedAt: string;
}

export type TerminalErrorCode =
  | "INVALID_PAYLOAD"
  | "UNAUTHORIZED"
  | "SANDBOX_NOT_FOUND"
  | "SANDBOX_NOT_RUNNING"
  | "SANDBOX_EXPIRED"
  | "SANDBOX_POD_NOT_FOUND"
  | "TERMINAL_NOT_STARTED"
  | "TERMINAL_ALREADY_STARTING"
  | "TERMINAL_START_FAILED"
  | "INPUT_TOO_LARGE"
  | "AI_RATE_LIMITED"
  | "AI_TRANSLATION_FAILED"
  | "AI_UNSAFE_COMMAND"
  | "INTENT_TOO_LONG"
  | "INTERNAL_ERROR";

export interface TerminalErrorPayload {
  code: TerminalErrorCode;
  message: string;
}

export interface TerminalAck {
  ok: boolean;
  error?: TerminalErrorPayload;
  terminal?: TerminalStartedPayload;
}

export interface AiTranslatePayload {
  sandboxId: string;
  intent: string;
}

export interface AiTranslation {
  /** Single-line bash command. Never contains newlines - execution stays user-initiated. */
  command: string;
  is_destructive: boolean;
  explanation: string;
}

export type AiTranslateAck =
  | { ok: true; translation: AiTranslation }
  | { ok: false; error: TerminalErrorPayload };

export interface ClientToServerEvents {
  "terminal:start": (
    payload: TerminalStartPayload,
    acknowledge?: (response: TerminalAck) => void,
  ) => void;
  "terminal:input": (payload: TerminalInputPayload) => void;
  "terminal:resize": (payload: TerminalResizePayload) => void;
  "terminal:stop": () => void;
  "ai:translate": (
    payload: AiTranslatePayload,
    acknowledge?: (response: AiTranslateAck) => void,
  ) => void;
}

export interface ServerToClientEvents {
  "terminal:output": (payload: TerminalOutputPayload) => void;
  "terminal:started": (payload: TerminalStartedPayload) => void;
  "terminal:exit": (payload: TerminalExitPayload) => void;
  "terminal:error": (payload: TerminalErrorPayload) => void;
  "ai:error-detected": (payload: AIErrorDetectedPayload) => void;
}

export interface InterServerEvents {
  // Reserved for future multi-replica Socket.IO communication.
}

export interface SocketData {
  userEmail: string;
}

export interface SandboxTerminalTarget {
  sandboxId: string;
  namespace: string;
  podName: string;
  containerName?: string;
  shell: string;
}
