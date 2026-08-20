import { describe, expect, it } from "vitest";
import { provisionParametersSchema } from "./provision.schema";

function parseParams(params: unknown) {
  return provisionParametersSchema.parse(params);
}

describe("provisionParametersSchema (TC matrix)", () => {
  it("TC-01: accepts an explicit full request", () => {
    const result = parseParams({
      image: "ubuntu:22.04",
      cpu: "1",
      memory: "2Gi",
      ttl_minutes: 45,
    });
    expect(result).toEqual({
      image: "ubuntu:22.04",
      cpu: "1",
      memory: "2Gi",
      ttl_minutes: 45,
    });
  });

  it("TC-02: accepts normalized fuzzy values", () => {
    const result = parseParams({
      image: "node:latest",
      cpu: "500m",
      memory: "1Gi",
      ttl_minutes: 60,
    });
    expect(result.cpu).toBe("500m");
    expect(result.memory).toBe("1Gi");
    expect(result.ttl_minutes).toBe(60);
  });

  it("TC-03: accepts minimal values", () => {
    const result = parseParams({
      image: "alpine:latest",
      cpu: "500m",
      memory: "512Mi",
      ttl_minutes: 30,
    });
    expect(result).toEqual({
      image: "alpine:latest",
      cpu: "500m",
      memory: "512Mi",
      ttl_minutes: 30,
    });
  });

  it("TC-04: accepts heavy specs", () => {
    const result = parseParams({
      image: "debian:bookworm-slim",
      cpu: "200m",
      memory: "256Mi",
      ttl_minutes: 15,
    });
    expect(result.cpu).toBe("200m");
    expect(result.memory).toBe("256Mi");
    expect(result.ttl_minutes).toBe(15);
  });

  it("TC-05: accepts core counts and hour-derived ttl", () => {
    const result = parseParams({
      image: "ubuntu:latest",
      cpu: "4",
      memory: "8Gi",
      ttl_minutes: 120,
    });
    expect(result.cpu).toBe("4");
    expect(result.memory).toBe("8Gi");
    expect(result.ttl_minutes).toBe(120);
  });
});

describe("provisionParametersSchema validation", () => {
  it("rejects a missing image", () => {
    expect(() =>
      parseParams({ cpu: "500m", memory: "512Mi", ttl_minutes: 30 }),
    ).toThrow(/image/);
  });

  it("rejects an empty image", () => {
    expect(() =>
      parseParams({ image: "", cpu: "500m", memory: "512Mi", ttl_minutes: 30 }),
    ).toThrow(/image cannot be empty/);
  });

  it("accepts valid image references with registry paths and digests", () => {
    expect(() =>
      parseParams({
        image: "docker.io/library/python:3.11-slim",
        cpu: "500m",
        memory: "512Mi",
        ttl_minutes: 30,
      }),
    ).not.toThrow();
    expect(() =>
      parseParams({
        image: "gcr.io/distroless/base@sha256:abcdef1234567890",
        cpu: "500m",
        memory: "512Mi",
        ttl_minutes: 30,
      }),
    ).not.toThrow();
  });

  it("rejects malformed or abusive image references", () => {
    for (const bad of [
      "../evil",
      "ubuntu 22.04",
      "python:3.11;rm -rf /",
      "image:tag:extra",
      "//etc/passwd",
      "node --version",
    ]) {
      expect(() =>
        parseParams({ image: bad, cpu: "500m", memory: "512Mi", ttl_minutes: 30 }),
      ).toThrow(/Invalid Docker image reference/);
    }
  });

  it("rejects malformed cpu quantities", () => {
    expect(() =>
      parseParams({ image: "u", cpu: "1.5m", memory: "512Mi", ttl_minutes: 30 }),
    ).toThrow(/Invalid K8s CPU format/);
  });

  it("rejects malformed memory quantities", () => {
    expect(() =>
      parseParams({ image: "u", cpu: "500m", memory: "500m", ttl_minutes: 30 }),
    ).toThrow(/Invalid K8s Memory format/);
  });

  it("rejects a non-integer ttl", () => {
    expect(() =>
      parseParams({ image: "u", cpu: "500m", memory: "512Mi", ttl_minutes: 30.5 }),
    ).toThrow();
  });

  it("rejects a non-positive ttl", () => {
    expect(() =>
      parseParams({ image: "u", cpu: "500m", memory: "512Mi", ttl_minutes: 0 }),
    ).toThrow();
  });

  it("rejects a ttl above 24 hours", () => {
    expect(() =>
      parseParams({ image: "u", cpu: "500m", memory: "512Mi", ttl_minutes: 1441 }),
    ).toThrow();
  });

  it("rejects unknown extra fields", () => {
    expect(() =>
      parseParams({
        image: "u",
        cpu: "500m",
        memory: "512Mi",
        ttl_minutes: 30,
        securityMode: "root",
      }),
    ).toThrow();
  });
});