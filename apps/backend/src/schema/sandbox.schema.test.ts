import { describe, expect, it } from "vitest";
import { createSandboxSchema } from "./sandbox.schema";
import { RESOURCE_BOUNDS } from "../constants/sandbox-resources";

function parseBody(body: unknown) {
  return createSandboxSchema.parse({ body, query: {}, params: {} });
}

describe("createSandboxSchema", () => {
  it("accepts a minimal request with only a templateId", () => {
    expect(() => parseBody({ templateId: "template-1" })).not.toThrow();
  });

  it("accepts valid resource and TTL overrides", () => {
    const result = parseBody({
      templateId: "template-1",
      resources: { cpu: "1", memory: "1Gi" },
      ttlMinutes: 120,
    });
    expect(result.body.resources).toEqual({ cpu: "1", memory: "1Gi" });
    expect(result.body.ttlMinutes).toBe(120);
  });

  it("accepts partial resource overrides", () => {
    const result = parseBody({
      templateId: "template-1",
      resources: { memory: "512Mi" },
    });
    expect(result.body.resources).toEqual({ memory: "512Mi" });
  });

  it("rejects a missing templateId", () => {
    expect(() => parseBody({})).toThrow();
  });

  it("rejects an empty templateId", () => {
    expect(() => parseBody({ templateId: "" })).toThrow();
  });

  it("rejects malformed CPU quantities", () => {
    expect(() => parseBody({ templateId: "t", resources: { cpu: "1.5m" } })).toThrow(
      /cpu must be a Kubernetes quantity/,
    );
    expect(() => parseBody({ templateId: "t", resources: { cpu: "1Gi" } })).toThrow(
      /cpu must be a Kubernetes quantity/,
    );
  });

  it("rejects malformed memory quantities", () => {
    expect(() => parseBody({ templateId: "t", resources: { memory: "500m" } })).toThrow(
      /memory must be a Kubernetes quantity/,
    );
  });

  it("rejects non-integer TTL", () => {
    expect(() => parseBody({ templateId: "t", ttlMinutes: 45.5 })).toThrow(
      /ttlMinutes must be a whole number of minutes/,
    );
  });

  it("rejects TTL below the platform minimum", () => {
    expect(() =>
      parseBody({ templateId: "t", ttlMinutes: RESOURCE_BOUNDS.ttlMinutes.min - 1 }),
    ).toThrow(/ttlMinutes must be at least/);
  });

  it("rejects TTL above the platform maximum", () => {
    expect(() =>
      parseBody({ templateId: "t", ttlMinutes: RESOURCE_BOUNDS.ttlMinutes.max + 1 }),
    ).toThrow(/ttlMinutes must be at most/);
  });

  it("rejects unknown top-level fields (no privilege self-escalation)", () => {
    // A client must never be able to set privileged/command directly.
    expect(() =>
      parseBody({ templateId: "t", privileged: true, command: ["/bin/sh"] }),
    ).toThrow();
  });
});