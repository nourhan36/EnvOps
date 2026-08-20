import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({
  prisma: {
    sandboxTemplate: { findUnique: vi.fn() },
    sandbox: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("./orchestrator.service", () => ({
  provisionSandbox: vi.fn(),
  deleteSandboxResources: vi.fn(),
}));

vi.mock("./provision.service", () => ({
  provisionService: {
    extract: vi.fn(),
  },
}));

import { prisma } from "../db/client";
import { provisionSandbox } from "./orchestrator.service";
import { provisionService } from "./provision.service";
import { createSandbox, createSandboxFromPrompt } from "./sandbox.service";
import {
  NotFoundError,
  ProvisionExtractionError,
  ProvisioningError,
} from "../errors/AppError";
import { RESOURCE_BOUNDS } from "../constants/sandbox-resources";

const template = {
  id: "template-1",
  name: "docker",
  displayName: "Docker Playground",
  dockerImage: "docker:dind",
  defaultLimits: { cpu: "1", memory: "1Gi" },
  defaultTtlMinutes: 120,
  securityMode: "privileged",
  command: ["/bin/sh", "-c", "dockerd-entrypoint.sh & sleep infinity"],
};

function mockCreate(overrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.sandbox.create).mockResolvedValue({
    id: "sandbox-1",
    userId: "user-1",
    templateId: template.id,
    namespace: "pending-1",
    status: "provisioning",
    expiresAt: new Date(),
    resourceLimits: null,
    ttlMinutes: null,
    ...overrides,
  } as never);
}

function mockProvision() {
  vi.mocked(provisionSandbox).mockResolvedValue({
    namespace: "sandbox-123",
    status: "running",
  } as never);
}

describe("createSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.sandboxTemplate.findUnique).mockResolvedValue(template as never);
    mockCreate();
    mockProvision();
    vi.mocked(prisma.sandbox.update).mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: "sandbox-1",
        ...data,
      } as never),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws NotFoundError when the template does not exist", async () => {
    vi.mocked(prisma.sandboxTemplate.findUnique).mockResolvedValue(null as never);

    await expect(createSandbox("missing", "user-1")).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.sandbox.create).not.toHaveBeenCalled();
  });

  it("uses template defaults when no overrides are provided", async () => {
    await createSandbox(template.id, "user-1");

    expect(prisma.sandbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resourceLimits: { cpu: "1", memory: "1Gi" },
          ttlMinutes: 120,
          securityMode: "privileged",
        }),
      }),
    );

    expect(provisionSandbox).toHaveBeenCalledWith({
      dockerImage: "docker:dind",
      limits: { cpu: "1", memory: "1Gi" },
      securityMode: "privileged",
      command: ["/bin/sh", "-c", "dockerd-entrypoint.sh & sleep infinity"],
    });
  });

  it("clamps oversized overrides to the platform bounds", async () => {
    await createSandbox(template.id, "user-1", {
      resources: { cpu: "32", memory: "64Gi" },
      ttlMinutes: 100_000,
    });

    expect(prisma.sandbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resourceLimits: {
            cpu: expect.stringMatching(/^(4000m|4)$/),
            memory: "8192Mi",
          },
          ttlMinutes: RESOURCE_BOUNDS.ttlMinutes.max,
        }),
      }),
    );
  });

  it("clamps undersized overrides up to the platform minimum", async () => {
    await createSandbox(template.id, "user-1", {
      resources: { cpu: "10m", memory: "16Mi" },
      ttlMinutes: 1,
    });

    expect(prisma.sandbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resourceLimits: {
            cpu: expect.stringMatching(/^(100m|0\.1)$/),
            memory: "128Mi",
          },
          ttlMinutes: RESOURCE_BOUNDS.ttlMinutes.min,
        }),
      }),
    );
  });

  it("persists the requested TTL on the sandbox record", async () => {
    await createSandbox(template.id, "user-1", { ttlMinutes: 90 });

    expect(prisma.sandbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ttlMinutes: 90 }),
      }),
    );
  });

  it("passes the template-driven security mode and command flags to the orchestrator", async () => {
    await createSandbox(template.id, "user-1");

    expect(provisionSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        securityMode: "privileged",
        command: ["/bin/sh", "-c", "dockerd-entrypoint.sh & sleep infinity"],
      }),
    );
  });

  it("keeps hardened security for non-privileged templates", async () => {
    vi.mocked(prisma.sandboxTemplate.findUnique).mockResolvedValue({
      ...template,
      securityMode: "hardened",
      command: null,
      args: null,
    } as never);

    await createSandbox(template.id, "user-1");

    expect(provisionSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ securityMode: "hardened", command: undefined, args: undefined }),
    );
  });

  it("passes root mode for root templates", async () => {
    vi.mocked(prisma.sandboxTemplate.findUnique).mockResolvedValue({
      ...template,
      name: "postgres",
      dockerImage: "postgres:16-alpine",
      securityMode: "root",
      command: ["docker-entrypoint.sh"],
      args: ["postgres"],
      env: [{ name: "POSTGRES_PASSWORD", value: "postgres" }],
    } as never);

    await createSandbox(template.id, "user-1");

    expect(provisionSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        securityMode: "root",
        command: ["docker-entrypoint.sh"],
        args: ["postgres"],
        env: [{ name: "POSTGRES_PASSWORD", value: "postgres" }],
      }),
    );
  });

  it("passes template args to the orchestrator (entrypoint semantics)", async () => {
    const k3sTemplate = {
      ...template,
      name: "kubernetes",
      dockerImage: "rancher/k3s",
      command: null,
      args: ["server", "--disable-traefik"],
    };
    vi.mocked(prisma.sandboxTemplate.findUnique).mockResolvedValue(k3sTemplate as never);

    await createSandbox(template.id, "user-1");

    expect(provisionSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        dockerImage: "rancher/k3s",
        command: undefined,
        args: ["server", "--disable-traefik"],
      }),
    );
  });

  it("marks the sandbox FAILED and wraps the error as a 422 when provisioning fails", async () => {
    vi.mocked(provisionSandbox).mockRejectedValue(new Error("pod failed"));

    const promise = createSandbox(template.id, "user-1");

    await expect(promise).rejects.toBeInstanceOf(ProvisioningError);
    await expect(promise).rejects.toMatchObject({ statusCode: 422 });
    await expect(promise).rejects.toThrow("pod failed");

    expect(prisma.sandbox.update).toHaveBeenCalledWith({
      where: { id: "sandbox-1" },
      data: { status: "failed" },
    });
  });
});

describe("createSandboxFromPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate();
    mockProvision();
    vi.mocked(prisma.sandbox.update).mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: "sandbox-1",
        ...data,
      } as never),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockReady(image: string, overrides: Record<string, unknown> = {}) {
    vi.mocked(provisionService.extract).mockResolvedValue({
      status: "ready",
      parameters: {
        image,
        cpu: "500m",
        memory: "512Mi",
        ttl_minutes: 30,
        ...overrides,
      },
      model: "deepseek.test",
    } as never);
  }

  it("provisions the extracted image directly with a null templateId", async () => {
    mockReady("python:3.11-slim", { cpu: "1", memory: "2Gi", ttl_minutes: 45 });

    await createSandboxFromPrompt("spin up python 3.11 with 1 core and 2GB for 45 minutes", "user-1");

    expect(prisma.sandbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateId: null,
          dockerImage: "python:3.11-slim",
          securityMode: "hardened",
          resourceLimits: { cpu: "1", memory: "2Gi" },
          ttlMinutes: 45,
        }),
      }),
    );

    expect(provisionSandbox).toHaveBeenCalledWith({
      dockerImage: "python:3.11-slim",
      limits: { cpu: "1", memory: "2Gi" },
      securityMode: "hardened",
    });
  });

  it("provisions allowlisted database images as root with the runtime entrypoint", async () => {
    mockReady("postgres", { ttl_minutes: 60 });

    await createSandboxFromPrompt("spin up a postgres database", "user-1");

    expect(prisma.sandbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateId: null,
          dockerImage: "postgres:16-alpine",
          securityMode: "root",
        }),
      }),
    );

    expect(provisionSandbox).toHaveBeenCalledWith({
      dockerImage: "postgres:16-alpine",
      limits: { cpu: "500m", memory: "512Mi" },
      securityMode: "root",
      command: ["docker-entrypoint.sh"],
      args: ["postgres"],
      env: [{ name: "POSTGRES_PASSWORD", value: "postgres" }],
    });
  });

  it("keeps an explicit tag on allowlisted images but still applies root mode", async () => {
    mockReady("postgres:17", { ttl_minutes: 60 });

    await createSandboxFromPrompt("postgres 17", "user-1");

    expect(prisma.sandbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dockerImage: "postgres:17", securityMode: "root" }),
      }),
    );
    expect(provisionSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        dockerImage: "postgres:17",
        securityMode: "root",
        command: ["docker-entrypoint.sh"],
      }),
    );
  });

  it("matches allowlisted images with a registry prefix", async () => {
    mockReady("docker.io/library/mysql:8", { ttl_minutes: 60 });

    await createSandboxFromPrompt("mysql", "user-1");

    expect(provisionSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        dockerImage: "mysql:8",
        securityMode: "root",
        command: ["docker-entrypoint.sh"],
        args: ["mysqld"],
      }),
    );
  });

  it("canonicalizes common misnomers like nodejs to the real repo and stays hardened", async () => {
    mockReady("nodejs:latest", { cpu: "500m", memory: "1Gi", ttl_minutes: 60 });

    await createSandboxFromPrompt("nodejs with half a cpu and 1GB for an hour", "user-1");

    expect(prisma.sandbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateId: null,
          dockerImage: "node:latest",
          securityMode: "hardened",
          resourceLimits: { cpu: "500m", memory: "1Gi" },
          ttlMinutes: 60,
        }),
      }),
    );

    expect(provisionSandbox).toHaveBeenCalledWith({
      dockerImage: "node:latest",
      limits: { cpu: "500m", memory: "1Gi" },
      securityMode: "hardened",
    });
  });

  it("canonicalizes aliases to allowlisted runtimes and applies root mode", async () => {
    mockReady("mongodb", { ttl_minutes: 60 });

    await createSandboxFromPrompt("mongodb", "user-1");

    expect(provisionSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        dockerImage: "mongo:7",
        securityMode: "root",
        command: ["docker-entrypoint.sh"],
        args: ["mongod"],
      }),
    );
  });

  it("clamps prompt-derived resources and TTL to platform bounds", async () => {
    mockReady("ubuntu:latest", { cpu: "32", memory: "64Gi", ttl_minutes: 100_000 });

    await createSandboxFromPrompt("huge machine", "user-1");

    expect(prisma.sandbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resourceLimits: {
            cpu: expect.stringMatching(/^(4000m|4)$/),
            memory: "8192Mi",
          },
          ttlMinutes: RESOURCE_BOUNDS.ttlMinutes.max,
        }),
      }),
    );
  });

  it("throws a ProvisionExtractionError without creating a record when extraction fails", async () => {
    vi.mocked(provisionService.extract).mockResolvedValue({
      status: "failed",
      reason: "bad_response",
      issues: ["The model output was not valid JSON."],
      retryable: true,
    } as never);

    await expect(createSandboxFromPrompt("hello", "user-1")).rejects.toBeInstanceOf(
      ProvisionExtractionError,
    );
    expect(prisma.sandbox.create).not.toHaveBeenCalled();
    expect(provisionSandbox).not.toHaveBeenCalled();
  });

  it("marks the sandbox FAILED and wraps the error as a 422 when provisioning a dynamic image fails", async () => {
    mockReady("alpine:latest");
    vi.mocked(provisionSandbox).mockRejectedValue(new Error("image pull failed"));

    const promise = createSandboxFromPrompt("alpine", "user-1");

    await expect(promise).rejects.toBeInstanceOf(ProvisioningError);
    await expect(promise).rejects.toMatchObject({ statusCode: 422 });
    await expect(promise).rejects.toThrow("image pull failed");

    expect(prisma.sandbox.update).toHaveBeenCalledWith({
      where: { id: "sandbox-1" },
      data: { status: "failed" },
    });
  });
});