import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";

import { env } from "./config/env";
import { swaggerSpec } from "./config/swagger";
import { asyncApiSpec } from "./config/asyncapi";
import { renderSocketDocs } from "./config/socket-docs";

import healthRoutes from "./routes/health.routes";
import templateRoutes from "./routes/template.routes";
import sandboxRoutes from "./routes/sandbox.routes";
import dashboardRoutes from "./routes/dashboard.routes";

import { errorHandler } from "./middlewares/error.middleware";


const app = express();



app.use(
  cors({
    origin: env.allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());



app.get("/openapi.json", (_req, res) => {
  res.json(swaggerSpec);
});

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "EnvOps REST API",
  })
);

app.get("/asyncapi.json", (_req, res) => {
  res.json(asyncApiSpec);
});

app.get("/socket-docs", (_req, res) => {
  res.type("html").send(renderSocketDocs());
});



app.use("/api", healthRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/sandboxes", sandboxRoutes);
app.use("/api/dashboard", dashboardRoutes);



app.use(errorHandler);


export default app;