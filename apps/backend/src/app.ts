import cors from "cors";
import express from "express";
import { env } from "./config/env";
import healthRoutes from "./routes/health.routes";
import templateRoutes from "./routes/template.routes";
import sandboxRoutes from "./routes/sandbox.routes";
import { errorHandler } from "./middlewares/error.middleware";

const app = express();

app.use(
  cors({
    origin: env.allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json());

app.use("/api", healthRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/sandboxes", sandboxRoutes);


app.use(errorHandler);

export default app;
