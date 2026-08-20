import { describe, expect, it } from "vitest";
import { buildExplainUserContent, ERROR_INTERCEPTOR_SYSTEM_PROMPT } from "./llm.prompt";

describe("buildExplainUserContent", () => {
  it("includes command, stderr and environment sections", () => {
    const content = buildExplainUserContent({
      command: "npm install",
      stderr: "npm ERR! code ERESOLVE",
      environmentType: "Node.js + PostgreSQL (image node:20)",
    });

    expect(content).toContain("## Environment");
    expect(content).toContain("Node.js + PostgreSQL (image node:20)");
    expect(content).toContain("## Command");
    expect(content).toContain("npm install");
    expect(content).toContain("## Error Output");
    expect(content).toContain("npm ERR! code ERESOLVE");
  });

  it("omits the RAG Context section when no rag context is provided", () => {
    const content = buildExplainUserContent({
      command: "ls",
      stderr: "No such file or directory",
      environmentType: "Ubuntu",
    });

    expect(content).not.toContain("## RAG Context");
  });

  it("includes the RAG Context section when rag context is provided", () => {
    const content = buildExplainUserContent({
      command: "npm install",
      stderr: "npm ERR!",
      environmentType: "Node.js",
      ragContext: "postgres connection guide: use PGHOST env var",
    });

    expect(content).toContain("## RAG Context");
    expect(content).toContain("postgres connection guide");
  });
});

describe("ERROR_INTERCEPTOR_SYSTEM_PROMPT", () => {
  it("constrains the model to diagnosis + suggested fix sections", () => {
    expect(ERROR_INTERCEPTOR_SYSTEM_PROMPT).toContain("## Diagnosis");
    expect(ERROR_INTERCEPTOR_SYSTEM_PROMPT).toContain("## Suggested Fix");
    expect(ERROR_INTERCEPTOR_SYSTEM_PROMPT).toContain("Linux/DevOps troubleshooting");
  });
});
