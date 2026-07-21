import path from "node:path";
import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env";

const routeFiles = path.join(__dirname, "../routes/*.{ts,js}");

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "EnvOps API",
      version: "1.0.0",
      description:
        "REST API for sandbox templates, sandbox lifecycle, and dashboard data. " +
        "The current MVP uses the seeded demo user instead of a real bearer token. " +
        "Socket.IO terminal events are documented separately in the AsyncAPI documentation.",
    },
    servers: [
      {
        url: `http://localhost:${env.port}`,
        description: "Local development server",
      },
    ],
    externalDocs: {
      description: "Socket.IO terminal event documentation",
      url: "/socket-docs",
    },
    tags: [
      { name: "Health", description: "Backend health checks" },
      { name: "Templates", description: "Available sandbox templates" },
      { name: "Sandboxes", description: "Sandbox lifecycle operations" },
      { name: "Dashboard", description: "Dashboard statistics" },
    ],
    components: {
      schemas: {
        ErrorResponse: {
          type: "object",
          required: ["message"],
          properties: {
            message: {
              type: "string",
              example: "Sandbox not found",
            },
          },
        },
        ResourceLimits: {
          type: "object",
          required: ["cpu", "memory"],
          properties: {
            cpu: { type: "string", example: "250m" },
            memory: { type: "string", example: "256Mi" },
          },
          additionalProperties: true,
        },
        SandboxTemplate: {
          type: "object",
          required: [
            "id",
            "name",
            "displayName",
            "dockerImage",
            "defaultLimits",
            "defaultTtlMinutes",
            "isActive",
            "createdAt",
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "ubuntu" },
            displayName: { type: "string", example: "Ubuntu Sandbox" },
            description: {
              type: "string",
              nullable: true,
              example: "Ubuntu development sandbox",
            },
            dockerImage: { type: "string", example: "ubuntu:22.04" },
            defaultLimits: { $ref: "#/components/schemas/ResourceLimits" },
            defaultTtlMinutes: { type: "integer", example: 60 },
            isActive: { type: "boolean", example: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Sandbox: {
          type: "object",
          required: [
            "id",
            "userId",
            "templateId",
            "namespace",
            "status",
            "createdAt",
            "expiresAt",
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            userId: { type: "string", format: "uuid" },
            templateId: { type: "string", format: "uuid" },
            namespace: {
              type: "string",
              example: "sandbox-1784661672464",
            },
            status: {
              type: "string",
              enum: [
                "provisioning",
                "running",
                "failed",
                "stopped",
                "expired",
                "deleted",
              ],
              example: "running",
            },
            resourceLimits: {
              allOf: [{ $ref: "#/components/schemas/ResourceLimits" }],
              nullable: true,
            },
            createdAt: { type: "string", format: "date-time" },
            expiresAt: { type: "string", format: "date-time" },
            deletedAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            template: { $ref: "#/components/schemas/SandboxTemplate" },
          },
        },
        CreateSandboxRequest: {
          type: "object",
          required: ["templateId"],
          properties: {
            templateId: {
              type: "string",
              format: "uuid",
              example: "31884bc3-86db-4687-8ee7-40abd578dafb",
            },
          },
        },
        CreateSandboxResponse: {
          type: "object",
          required: ["message", "sandbox"],
          properties: {
            message: {
              type: "string",
              example: "Sandbox created successfully",
            },
            sandbox: { $ref: "#/components/schemas/Sandbox" },
          },
        },
        DeleteSandboxResponse: {
          type: "object",
          required: ["message", "sandbox"],
          properties: {
            message: {
              type: "string",
              example: "Sandbox deleted successfully",
            },
            sandbox: { $ref: "#/components/schemas/Sandbox" },
          },
        },
        DashboardStats: {
          type: "object",
          required: [
            "totalSandboxes",
            "provisioningSandboxes",
            "runningSandboxes",
            "failedSandboxes",
            "totalTemplates",
          ],
          properties: {
            totalSandboxes: { type: "integer", example: 2 },
            provisioningSandboxes: { type: "integer", example: 0 },
            runningSandboxes: { type: "integer", example: 2 },
            failedSandboxes: { type: "integer", example: 0 },
            totalTemplates: { type: "integer", example: 1 },
          },
        },
      },
    },
  },
  apis: [routeFiles],
};

export const swaggerSpec = swaggerJsdoc(options);
