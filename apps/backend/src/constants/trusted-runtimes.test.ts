import { describe, expect, it } from "vitest";
import {
  canonicalizeImageReference,
  parseImageRef,
  resolveTrustedRuntime,
  TRUSTED_RUNTIMES,
} from "./trusted-runtimes";

describe("parseImageRef", () => {
  it("parses a bare name", () => {
    expect(parseImageRef("postgres")).toEqual({
      name: "postgres",
      tag: null,
      digest: null,
    });
  });

  it("parses a name with a tag", () => {
    expect(parseImageRef("postgres:16-alpine")).toEqual({
      name: "postgres",
      tag: "16-alpine",
      digest: null,
    });
  });

  it("parses a digest reference", () => {
    expect(parseImageRef("redis@sha256:abcdef123456")).toEqual({
      name: "redis",
      tag: null,
      digest: "sha256:abcdef123456",
    });
  });

  it("does not mistake a registry port for a tag", () => {
    expect(parseImageRef("localhost:5000/postgres:16").name).toBe("postgres");
    expect(parseImageRef("localhost:5000/postgres:16").tag).toBe("16");
  });

  it("strips the registry host from the repository name", () => {
    expect(parseImageRef("docker.io/library/mysql:8").name).toBe("mysql");
  });
});

describe("canonicalizeImageReference", () => {
  it("rewrites common misnomers to their real repo", () => {
    expect(canonicalizeImageReference("nodejs:latest")).toBe("node:latest");
    expect(canonicalizeImageReference("nodejs:20")).toBe("node:20");
    expect(canonicalizeImageReference("nodejs")).toBe("node:latest");
    expect(canonicalizeImageReference("go")).toBe("golang:latest");
    expect(canonicalizeImageReference("python3:3.12")).toBe("python:3.12");
    expect(canonicalizeImageReference("mongodb:7")).toBe("mongo:7");
  });

  it("preserves digests on canonicalized images", () => {
    expect(canonicalizeImageReference("nodejs@sha256:abcdef123456")).toBe(
      "node@sha256:abcdef123456",
    );
  });

  it("leaves correct names and registry-qualified refs untouched", () => {
    expect(canonicalizeImageReference("node:20")).toBe("node:20");
    expect(canonicalizeImageReference("golang:1.22-alpine")).toBe("golang:1.22-alpine");
    expect(canonicalizeImageReference("docker.io/library/python:3.11-slim")).toBe(
      "docker.io/library/python:3.11-slim",
    );
  });

  it("is case-insensitive on the name", () => {
    expect(canonicalizeImageReference("NodeJS:18")).toBe("node:18");
  });
});

describe("resolveTrustedRuntime", () => {
  it("resolves a known runtime to root mode with the recommended tag", () => {
    const resolved = resolveTrustedRuntime("postgres")!;
    expect(resolved.name).toBe("postgres");
    expect(resolved.securityMode).toBe("root");
    expect(resolved.image).toBe("postgres:16-alpine");
    expect(resolved.command).toEqual(["docker-entrypoint.sh"]);
    expect(resolved.args).toEqual(["postgres"]);
    expect(resolved.env).toEqual([{ name: "POSTGRES_PASSWORD", value: "postgres" }]);
  });

  it("prefers the extracted tag over the recommended tag", () => {
    expect(resolveTrustedRuntime("postgres:17")!.image).toBe("postgres:17");
  });

  it("prefers a digest over any tag", () => {
    expect(
      resolveTrustedRuntime("redis:7@sha256:abcdef123456")!.image,
    ).toBe("redis@sha256:abcdef123456");
  });

  it("matches via aliases", () => {
    expect(resolveTrustedRuntime("mongodb")!.name).toBe("mongo");
    expect(resolveTrustedRuntime("psql")!.name).toBe("postgres");
  });

  it("rewrites aliases to the canonical image repo", () => {
    expect(resolveTrustedRuntime("mongodb:latest")!.image).toBe("mongo:latest");
    expect(resolveTrustedRuntime("mongodb")!.image).toBe("mongo:7");
  });

  it("matches registry-qualified references", () => {
    expect(resolveTrustedRuntime("docker.io/library/mysql:8")!.image).toBe(
      "mysql:8",
    );
  });

  it("is case-insensitive on the image name", () => {
    expect(resolveTrustedRuntime("Postgres")!.name).toBe("postgres");
  });

  it("returns null for unknown images so they stay hardened", () => {
    expect(resolveTrustedRuntime("python:3.11-slim")).toBeNull();
    expect(resolveTrustedRuntime("golang:1.22-alpine")).toBeNull();
    expect(resolveTrustedRuntime("example.com/private/app:latest")).toBeNull();
  });

  it("exposes every entry as a root-mode trusted runtime", () => {
    for (const runtime of TRUSTED_RUNTIMES) {
      expect(runtime.securityMode).toBe("root");
      expect(runtime.command.length).toBeGreaterThan(0);
    }
  });
});