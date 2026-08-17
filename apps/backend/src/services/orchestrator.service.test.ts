import { describe, expect, it } from "vitest";
import { buildSecurityContext } from "./orchestrator.service";

describe("buildSecurityContext", () => {
  it("returns a hardened context for non-privileged templates", () => {
    expect(buildSecurityContext(false)).toEqual({
      runAsNonRoot: true,
      runAsUser: 1000,
      allowPrivilegeEscalation: false,
      capabilities: { drop: ["ALL"] },
    });
  });

  it("returns a privileged root context only for trusted runtime templates", () => {
    expect(buildSecurityContext(true)).toEqual({
      runAsUser: 0,
      runAsNonRoot: false,
      privileged: true,
      allowPrivilegeEscalation: true,
    });
  });

  it("never adds capabilities to the hardened context", () => {
    const ctx = buildSecurityContext(false) as any;
    expect(ctx.capabilities?.add).toBeUndefined();
  });
});