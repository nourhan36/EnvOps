import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({
  prisma: {
    sandbox: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("./orchestrator.service", () => ({
  deleteSandboxResources: vi.fn(),
}));

import { prisma } from "../db/client";
import { deleteSandboxResources } from "./orchestrator.service";
import { runEvictionCycle } from "./eviction.service";

const expiredSandbox = {
  id: "sandbox-expired",
  namespace: "sandbox-expired-ns",
};

const runningSandbox = {
  id: "sandbox-running",
  namespace: "sandbox-running-ns",
};

describe("runEvictionCycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.sandbox.findMany).mockResolvedValue([
      expiredSandbox,
    ] as never);
    vi.mocked(prisma.sandbox.update).mockResolvedValue({ id: expiredSandbox.id } as never);
    vi.mocked(deleteSandboxResources).mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("only queries non-deleted running sandboxes that have expired", async () => {
    await runEvictionCycle();

    expect(prisma.sandbox.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        status: "running",
        expiresAt: {
          lte: expect.any(Date),
        },
      },
    });
  });

  it("deletes the Kubernetes resources and marks the sandbox as expired", async () => {
    await runEvictionCycle();

    expect(deleteSandboxResources).toHaveBeenCalledWith("sandbox-expired-ns");
    expect(prisma.sandbox.update).toHaveBeenCalledWith({
      where: { id: "sandbox-expired" },
      data: { status: "expired" },
    });
  });

  it("keeps the sandbox visible instead of soft-deleting it", async () => {
    await runEvictionCycle();

    const updateCall = vi.mocked(prisma.sandbox.update).mock.calls[0];
    expect(updateCall).toBeDefined();
    expect(updateCall[0]).not.toHaveProperty("deletedAt");
    expect((updateCall[0] as any).data).not.toHaveProperty("deletedAt");
  });

  it("evicts every expired sandbox in the batch", async () => {
    vi.mocked(prisma.sandbox.findMany).mockResolvedValue([
      expiredSandbox,
      { id: "sandbox-expired-2", namespace: "sandbox-expired-ns-2" },
    ] as never);

    await runEvictionCycle();

    expect(deleteSandboxResources).toHaveBeenCalledTimes(2);
    expect(prisma.sandbox.update).toHaveBeenCalledTimes(2);
  });

  it("continues evicting remaining sandboxes when one fails", async () => {
    vi.mocked(prisma.sandbox.findMany).mockResolvedValue([
      expiredSandbox,
      { id: "sandbox-expired-2", namespace: "sandbox-expired-ns-2" },
    ] as never);
    vi.mocked(deleteSandboxResources).mockRejectedValueOnce(
      new Error("namespace delete failed"),
    );

    await expect(runEvictionCycle()).resolves.not.toThrow();

    expect(deleteSandboxResources).toHaveBeenCalledTimes(2);
    expect(prisma.sandbox.update).toHaveBeenCalledTimes(1);
    expect(prisma.sandbox.update).toHaveBeenCalledWith({
      where: { id: "sandbox-expired-2" },
      data: { status: "expired" },
    });
  });

  it("does nothing when there are no expired sandboxes", async () => {
    vi.mocked(prisma.sandbox.findMany).mockResolvedValue([] as never);

    await runEvictionCycle();

    expect(deleteSandboxResources).not.toHaveBeenCalled();
    expect(prisma.sandbox.update).not.toHaveBeenCalled();
  });
});