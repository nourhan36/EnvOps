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

export interface ClientToServerEvents {
  "terminal:start": (
    payload: TerminalStartPayload,
    acknowledge?: (response: TerminalAck) => void,
  ) => void;
  "terminal:input": (payload: TerminalInputPayload) => void;
  "terminal:resize": (payload: TerminalResizePayload) => void;
  "terminal:stop": () => void;
}

export interface ServerToClientEvents {
  "terminal:output": (payload: TerminalOutputPayload) => void;
  "terminal:started": (payload: TerminalStartedPayload) => void;
  "terminal:exit": (payload: TerminalExitPayload) => void;
  "terminal:error": (payload: TerminalErrorPayload) => void;
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
