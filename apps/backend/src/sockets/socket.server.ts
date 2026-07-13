import { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env";
import {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "../types/terminal.types";
import { registerTerminalSocketHandlers } from "./terminal.socket";

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: env.allowedOrigins,
      credentials: true,
    },
    transports: ["websocket", "polling"],
    maxHttpBufferSize: env.terminalMaxInputBytes,
  });

  // TEMPORARY MVP AUTHENTICATION:
  // The current project has no login middleware yet, so every socket uses the
  // seeded demo user. verify a token from socket.handshake.auth
  // and store the real authenticated user in socket.data instead.
  io.use((socket, next) => {
    socket.data.userEmail = env.demoUserEmail;
    next();
  });

  io.on("connection", (socket) => {
    registerTerminalSocketHandlers(socket);
  });

  return io;
}
