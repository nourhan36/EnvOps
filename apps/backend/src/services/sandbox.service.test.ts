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

import { prisma } from "../db/client";
import { provisionSandbox } from "./orchestrator.service";
import { createSandbox } from "./sandbox.service";
import { NotFoundError } from "../errors/AppError";
import { RESOURCE_BOUNDS } from "../constants/sandbox-resources";

const template = {
  id: "template-1",
  name: "docker",
  displayName: "Docker Playground",
  dockerImage: "docker:dind",
  defaultLimits: { cpu: "1", memory: "1Gi" },
  defaultTtlMinutes: 120,
  privileged: true,
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
        }),
      }),
    );

    expect(provisionSandbox).toHaveBeenCalledWith({
      dockerImage: "docker:dind",
      limits: { cpu: "1", memory: "1Gi" },
      privileged: true,
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

  it("passes the template-driven privileged and command flags to the orchestrator", async () => {
    await createSandbox(template.id, "user-1");

    expect(provisionSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        privileged: true,
        command: ["/bin/sh", "-c", "dockerd-entrypoint.sh & sleep infinity"],
      }),
    );
  });

  it("keeps hardened security for non-privileged templates", async () => {
    vi.mocked(prisma.sandboxTemplate.findUnique).mockResolvedValue({
      ...template,
      privileged: false,
      command: null,
      args: null,
    } as never);

    await createSandbox(template.id, "user-1");

    expect(provisionSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ privileged: false, command: undefined, args: undefined }),
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

  it("marks the sandbox FAILED when provisioning fails", async () => {
    vi.mocked(provisionSandbox).mockRejectedValue(new Error("pod failed"));

    await expect(createSandbox(template.id, "user-1")).rejects.toThrow("pod failed");

    expect(prisma.sandbox.update).toHaveBeenCalledWith({
      where: { id: "sandbox-1" },
      data: { status: "failed" },
    });
  });
});