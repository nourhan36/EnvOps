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
import {
  CapturedFailureEvent,
  errorCaptureRegistry,
  TerminalErrorCapture,
} from "../error-interceptor/capture.service";

type TerminalSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const startingSockets = new Map<string, Promise<TerminalStartOutcome>>();

type TerminalStartOutcome =
  | { ok: true; terminal: TerminalInfo }
  | { ok: false; error: TerminalErrorPayload };

interface TerminalInfo {
  sandboxId: string;
  namespace: string;
  podName: string;
  containerName?: string;
}

// One error capture per socket connection; cleared when the terminal stops or
// the socket disconnects.
const socketCaptures = new Map<string, { sandboxId: string; capture: TerminalErrorCapture }>();

const ERROR_PREVIEW_MAX_CHARS = 4000;

function createFailureListener(
  socket: TerminalSocket,
): (event: CapturedFailureEvent) => void {
  return ({ sandboxId, failure }) => {
    if (!socket.connected) {
      return;
    }

    socket.emit("ai:error-detected", {
      sandboxId,
      command: failure.command,
      stderrPreview: failure.stderr.slice(0, ERROR_PREVIEW_MAX_CHARS),
      signature: failure.signature,
      detectedAt: failure.detectedAt.toISOString(),
    });
  };
}

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
      // A terminal start is already in flight for this connection. This is a
      // normal condition, not a client bug: the frontend double-mounts under
      // React StrictMode and a reconnect can also re-emit start before the
      // first has finished. Coalesce instead of erroring - the in-flight start
      // broadcasts terminal:started to the whole socket, so we only need to
      // await its outcome and mirror the acknowledgement.
      try {
        reply(await startingSockets.get(socket.id)!);
      } catch {
        reply({
          ok: false,
          error: {
            code: "TERMINAL_START_FAILED",
            message: "Unable to start the terminal.",
          },
        });
      }
      return;
    }

    const startPromise = (async (): Promise<TerminalStartOutcome> => {
      const target = await resolveSandboxTerminalTarget(
        payload.sandboxId.trim(),
        socket.data.userEmail,
      );

      if (!socket.connected) {
        return {
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Socket disconnected before the terminal could be started.",
          },
        };
      }

      const cols = normalizeSize(payload.cols, env.terminalDefaultCols);
      const rows = normalizeSize(payload.rows, env.terminalDefaultRows);

      const capture = new TerminalErrorCapture(
        target.sandboxId,
        createFailureListener(socket),
      );
      errorCaptureRegistry.attach(target.sandboxId, capture);
      socketCaptures.set(socket.id, { sandboxId: target.sandboxId, capture });

      terminalService.start(socket.id, target, cols, rows, {
        onData: (data) => {
          capture.handleOutput(data);

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

      const terminal: TerminalInfo = {
        sandboxId: target.sandboxId,
        namespace: target.namespace,
        podName: target.podName,
        containerName: target.containerName,
      };

      socket.emit("terminal:started", terminal);
      return { ok: true, terminal };
    })();

    startingSockets.set(socket.id, startPromise);

    try {
      const outcome = await startPromise;
      reply(outcome);
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
      return;
    }

    socketCaptures.get(socket.id)?.capture.handleInput(payload.data);
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

    // terminal:start is async, so a resize can legitimately arrive before the
    // PTY is registered. The start payload already carries the fitted size, so
    // such a resize is a harmless ordering race - ignore it instead of
    // surfacing an error to the client.
    if (!terminalService.resize(socket.id, cols, rows)) {
      console.warn(
        `Ignoring terminal:resize for ${socket.id}: no active terminal (start may still be in flight).`,
      );
    }
  });

  socket.on("terminal:stop", () => {
    const entry = socketCaptures.get(socket.id);

    if (entry) {
      errorCaptureRegistry.detachIf(entry.sandboxId, entry.capture);
      socketCaptures.delete(socket.id);
    }

    terminalService.close(socket.id);
  });

  socket.on("disconnect", (reason) => {
    startingSockets.delete(socket.id);
    const entry = socketCaptures.get(socket.id);

    if (entry) {
      errorCaptureRegistry.detachIf(entry.sandboxId, entry.capture);
      socketCaptures.delete(socket.id);
    }

    terminalService.close(socket.id);
    console.log(`Socket disconnected: ${socket.id} (${reason})`);
  });
}
