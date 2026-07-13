import { Socket } from "socket.io";
import { env } from "../config/env";
import {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
  TerminalAck,
  TerminalErrorPayload,
  TerminalResizePayload,
  TerminalStartPayload,
} from "../types/terminal.types";
import {
  resolveSandboxTerminalTarget,
  TerminalTargetError,
} from "../services/sandbox-terminal-target.service";
import { terminalService } from "../services/terminal.service";

type TerminalSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const startingSockets = new Set<string>();

function emitError(
  socket: TerminalSocket,
  error: TerminalErrorPayload,
): void {
  socket.emit("terminal:error", error);
}

function normalizeSize(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fallback;
  }

  // Prevent invalid or extreme PTY sizes.
  return Math.min(Math.max(value, 1), 500);
}

function validateStartPayload(payload: unknown): payload is TerminalStartPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as TerminalStartPayload).sandboxId === "string" &&
    (payload as TerminalStartPayload).sandboxId.trim().length > 0
  );
}

function validateResizePayload(
  payload: unknown,
): payload is TerminalResizePayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as TerminalResizePayload).cols === "number" &&
    typeof (payload as TerminalResizePayload).rows === "number"
  );
}

export function registerTerminalSocketHandlers(socket: TerminalSocket): void {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("terminal:start", async (payload, acknowledge) => {
    const reply = (response: TerminalAck): void => {
      acknowledge?.(response);
    };

    if (!validateStartPayload(payload)) {
      const error: TerminalErrorPayload = {
        code: "INVALID_PAYLOAD",
        message: "terminal:start requires a valid sandboxId.",
      };
      emitError(socket, error);
      reply({ ok: false, error });
      return;
    }

    if (startingSockets.has(socket.id)) {
      const error: TerminalErrorPayload = {
        code: "TERMINAL_ALREADY_STARTING",
        message: "A terminal is already being started for this connection.",
      };
      emitError(socket, error);
      reply({ ok: false, error });
      return;
    }

    startingSockets.add(socket.id);

    try {
      const target = await resolveSandboxTerminalTarget(
        payload.sandboxId.trim(),
        socket.data.userEmail,
      );

      if (!socket.connected) {
        return;
      }

      const cols = normalizeSize(payload.cols, env.terminalDefaultCols);
      const rows = normalizeSize(payload.rows, env.terminalDefaultRows);

      terminalService.start(socket.id, target, cols, rows, {
        onData: (data) => {
          if (socket.connected) {
            socket.emit("terminal:output", { data });
          }
        },
        onExit: (exitPayload) => {
          if (socket.connected) {
            socket.emit("terminal:exit", exitPayload);
          }
        },
      });

      const terminal = {
        sandboxId: target.sandboxId,
        namespace: target.namespace,
        podName: target.podName,
        containerName: target.containerName,
      };

      socket.emit("terminal:started", terminal);
      reply({ ok: true, terminal });
    } catch (error: any) {
      const terminalError: TerminalErrorPayload =
        error instanceof TerminalTargetError
          ? { code: error.code, message: error.message }
          : {
              code: "TERMINAL_START_FAILED",
              message: error?.message || "Unable to start the terminal.",
            };

      emitError(socket, terminalError);
      reply({ ok: false, error: terminalError });
    } finally {
      startingSockets.delete(socket.id);
    }
  });

  socket.on("terminal:input", (payload) => {
    if (!payload || typeof payload.data !== "string") {
      emitError(socket, {
        code: "INVALID_PAYLOAD",
        message: "terminal:input requires a string data field.",
      });
      return;
    }

    if (Buffer.byteLength(payload.data, "utf8") > env.terminalMaxInputBytes) {
      emitError(socket, {
        code: "INPUT_TOO_LARGE",
        message: "Terminal input exceeded the allowed message size.",
      });
      return;
    }

    if (!terminalService.write(socket.id, payload.data)) {
      emitError(socket, {
        code: "TERMINAL_NOT_STARTED",
        message: "Start a terminal before sending input.",
      });
    }
  });

  socket.on("terminal:resize", (payload) => {
    if (!validateResizePayload(payload)) {
      emitError(socket, {
        code: "INVALID_PAYLOAD",
        message: "terminal:resize requires numeric cols and rows.",
      });
      return;
    }

    const cols = normalizeSize(payload.cols, env.terminalDefaultCols);
    const rows = normalizeSize(payload.rows, env.terminalDefaultRows);

    if (!terminalService.resize(socket.id, cols, rows)) {
      emitError(socket, {
        code: "TERMINAL_NOT_STARTED",
        message: "Start a terminal before resizing it.",
      });
    }
  });

  socket.on("terminal:stop", () => {
    terminalService.close(socket.id);
  });

  socket.on("disconnect", (reason) => {
    startingSockets.delete(socket.id);
    terminalService.close(socket.id);
    console.log(`Socket disconnected: ${socket.id} (${reason})`);
  });
}
