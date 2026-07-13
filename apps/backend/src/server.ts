import "dotenv/config";
import { createServer } from "node:http";
import app from "./app";
import { env } from "./config/env";
import { createSocketServer } from "./sockets/socket.server";
import { terminalService } from "./services/terminal.service";

const httpServer = createServer(app);
const io = createSocketServer(httpServer);

httpServer.listen(env.port, () => {
  console.log(`HTTP and Socket.IO server is running on port ${env.port}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}. Closing active terminals...`);
  terminalService.closeAll();

  io.close(() => {
    httpServer.close((error) => {
      if (error) {
        console.error("Failed to close HTTP server:", error);
        process.exitCode = 1;
      }
    });
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
