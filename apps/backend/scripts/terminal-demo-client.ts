import "dotenv/config";
import { io, Socket } from "socket.io-client";
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../src/types/terminal.types";

/**
 * DEMO ONLY — this replaces xterm.js until the frontend.
 * It connects to the REAL Socket.IO backend and the REAL Kubernetes Pod.
 */

const sandboxId = process.argv[2]?.trim();
const backendUrl = process.env.BACKEND_URL?.trim() || "http://localhost:3000";

if (!sandboxId) {
  console.error("Usage: npm run demo:terminal -- <sandbox-id>");
  process.exit(1);
}

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  backendUrl,
  {
    transports: ["websocket"],
    reconnection: false,
  },
);

let rawModeEnabled = false;

function restoreTerminal(): void {
  if (rawModeEnabled && process.stdin.isTTY) {
    process.stdin.setRawMode(false);
    rawModeEnabled = false;
  }

  process.stdin.pause();
}

function disconnectAndExit(code = 0): void {
  restoreTerminal();
  socket.disconnect();
  process.exitCode = code;
}

socket.on("connect", () => {
  console.error(`Connected to ${backendUrl}`);

  socket.emit(
    "terminal:start",
    {
      sandboxId,
      cols: process.stdout.columns || 100,
      rows: process.stdout.rows || 30,
    },
    (response) => {
      if (!response.ok) {
        console.error(
          `Unable to start terminal: ${response.error?.code} - ${response.error?.message}`,
        );
        disconnectAndExit(1);
        return;
      }

      console.error(
        `Attached to ${response.terminal?.namespace}/${response.terminal?.podName}`,
      );
      console.error("Press Ctrl+] to disconnect. Ctrl+C is sent to the Pod.\n");

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        rawModeEnabled = true;
      }

      process.stdin.resume();
      process.stdin.on("data", (chunk: Buffer) => {
        // Ctrl+] (ASCII 29) exits the local demo client without sending it remotely.
        if (chunk.length === 1 && chunk[0] === 29) {
          socket.emit("terminal:stop");
          disconnectAndExit(0);
          return;
        }

        socket.emit("terminal:input", { data: chunk.toString("utf8") });
      });
    },
  );
});

socket.on("terminal:output", ({ data }) => {
  process.stdout.write(data);
});

socket.on("terminal:error", ({ code, message }) => {
  console.error(`\nTerminal error: ${code} - ${message}`);
});

socket.on("terminal:exit", ({ exitCode, signal }) => {
  console.error(
    `\nRemote terminal exited (code=${exitCode ?? "unknown"}, signal=${signal ?? "none"}).`,
  );
  disconnectAndExit(exitCode && exitCode !== 0 ? 1 : 0);
});

socket.on("connect_error", (error) => {
  console.error(`Socket connection failed: ${error.message}`);
  disconnectAndExit(1);
});

socket.on("disconnect", (reason) => {
  restoreTerminal();
  console.error(`\nDisconnected: ${reason}`);
});

process.stdout.on("resize", () => {
  if (!socket.connected) {
    return;
  }

  socket.emit("terminal:resize", {
    cols: process.stdout.columns || 100,
    rows: process.stdout.rows || 30,
  });
});

process.on("SIGTERM", () => disconnectAndExit(0));
