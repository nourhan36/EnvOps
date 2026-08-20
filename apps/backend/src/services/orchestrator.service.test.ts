import { describe, expect, it } from "vitest";
import { buildSecurityContext, diagnosePodStatus } from "./orchestrator.service";

describe("buildSecurityContext", () => {
  it("returns a hardened context for the default/hardened mode", () => {
    expect(buildSecurityContext("hardened")).toEqual({
      runAsNonRoot: true,
      runAsUser: 1000,
      allowPrivilegeEscalation: false,
      capabilities: { drop: ["ALL"] },
    });
  });

  it("defaults to a hardened context when no mode is provided", () => {
    expect(buildSecurityContext()).toEqual({
      runAsNonRoot: true,
      runAsUser: 1000,
      allowPrivilegeEscalation: false,
      capabilities: { drop: ["ALL"] },
    });
  });

  it("returns a root context (no privileged) for root mode", () => {
    expect(buildSecurityContext("root")).toEqual({
      runAsUser: 0,
      runAsNonRoot: false,
      privileged: false,
      allowPrivilegeEscalation: true,
    });
  });

  it("returns a privileged root context only for trusted runtime templates", () => {
    expect(buildSecurityContext("privileged")).toEqual({
      runAsUser: 0,
      runAsNonRoot: false,
      privileged: true,
      allowPrivilegeEscalation: true,
    });
  });

  it("never adds capabilities to the hardened context", () => {
    const ctx = buildSecurityContext("hardened") as any;
    expect(ctx.capabilities?.add).toBeUndefined();
  });
});

describe("diagnosePodStatus", () => {
  it("treats a Running pod as healthy", () => {
    const diagnostic = diagnosePodStatus({ phase: "Running" } as any);
    expect(diagnostic.phase).toBe("Running");
    expect(diagnostic.failure).toBeUndefined();
  });

  it("keeps waiting while a cold image pull is in progress", () => {
    const diagnostic = diagnosePodStatus({
      phase: "Pending",
      containerStatuses: [
        { name: "sandbox-container", state: { waiting: { reason: "ContainerCreating" } } },
      ],
    } as any);
    expect(diagnostic.failure).toBeUndefined();
  });

  it("fails fast on ErrImagePull with the kubelet message", () => {
    const diagnostic = diagnosePodStatus({
      phase: "Pending",
      containerStatuses: [
        {
          name: "sandbox-container",
          state: { waiting: { reason: "ErrImagePull", message: "not found" } },
        },
      ],
    } as any);
    expect(diagnostic.failure).toEqual({
      reason: "ErrImagePull",
      message: "not found",
    });
  });

  it("fails fast on ImagePullBackOff for a bad image", () => {
    const diagnostic = diagnosePodStatus({
      phase: "Pending",
      containerStatuses: [
        {
          name: "sandbox-container",
          state: {
            waiting: { reason: "ImagePullBackOff", message: "failed to resolve reference" },
          },
        },
      ],
    } as any);
    expect(diagnostic.failure?.reason).toBe("ImagePullBackOff");
  });

  it("keeps waiting on ImagePullBackOff caused by a transient rate limit", () => {
    const diagnostic = diagnosePodStatus({
      phase: "Pending",
      containerStatuses: [
        {
          name: "sandbox-container",
          state: {
            waiting: {
              reason: "ImagePullBackOff",
              message: "toomanyrequests: You have reached your pull rate limit",
            },
          },
        },
      ],
    } as any);
    expect(diagnostic.failure).toBeUndefined();
  });

  it("fails fast on CrashLoopBackOff", () => {
    const diagnostic = diagnosePodStatus({
      phase: "Running",
      containerStatuses: [
        {
          name: "sandbox-container",
          state: { waiting: { reason: "CrashLoopBackOff", message: "back-off 5m0s" } },
        },
      ],
    } as any);
    expect(diagnostic.failure?.reason).toBe("CrashLoopBackOff");
  });

  it("reports restarted containers that have terminated previously", () => {
    const diagnostic = diagnosePodStatus({
      phase: "Running",
      containerStatuses: [
        {
          name: "sandbox-container",
          restartCount: 3,
          lastState: { terminated: { reason: "Error", message: "exit code 1" } },
        },
      ],
    } as any);
    expect(diagnostic.failure?.reason).toBe("CrashLoopBackOff");
    expect(diagnostic.failure?.message).toContain("restarted 3 time(s)");
  });

  it("fails fast when the pod is unschedulable", () => {
    const diagnostic = diagnosePodStatus({
      phase: "Pending",
      conditions: [
        {
          type: "PodScheduled",
          status: "False",
          reason: "Unschedulable",
          message: "0/1 nodes are available: insufficient cpu",
        },
      ],
    } as any);
    expect(diagnostic.failure).toEqual({
      reason: "Unschedulable",
      message: "0/1 nodes are available: insufficient cpu",
    });
  });

  it("reports a terminal Failed pod", () => {
    const diagnostic = diagnosePodStatus({
      phase: "Failed",
      containerStatuses: [
        { name: "sandbox-container", state: { terminated: { reason: "Error" } } },
      ],
    } as any);
    expect(diagnostic.failure?.reason).toBe("PodFailed");
  });
});