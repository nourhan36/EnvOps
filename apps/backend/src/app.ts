import express from "express";
import healthRoutes from "./routes/health.routes";
import templateRoutes from "./routes/template.routes";
import sandboxRoutes from "./routes/sandbox.routes";

const app = express();

app.use(express.json());

app.use("/api", healthRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/sandboxes", sandboxRoutes);

export default app;