import { describe, expect, it } from "vitest";
import {
  PROVISION_PARAMS_SYSTEM_PROMPT,
  buildProvisionUserContent,
} from "./provision.prompt";

describe("PROVISION_PARAMS_SYSTEM_PROMPT", () => {
  it("instructs the model to return a single JSON object", () => {
    expect(PROVISION_PARAMS_SYSTEM_PROMPT).toContain("single JSON object");
    expect(PROVISION_PARAMS_SYSTEM_PROMPT).toContain("ttl_minutes");
  });

  it("encodes image normalization rules", () => {
    expect(PROVISION_PARAMS_SYSTEM_PROMPT).toContain("ubuntu:latest");
    expect(PROVISION_PARAMS_SYSTEM_PROMPT).toContain('"node" -> "node:latest"');
  });

  it("encodes cpu normalization rules", () => {
    expect(PROVISION_PARAMS_SYSTEM_PROMPT).toContain("half a core");
    expect(PROVISION_PARAMS_SYSTEM_PROMPT).toContain("500m");
  });

  it("encodes memory normalization rules", () => {
    expect(PROVISION_PARAMS_SYSTEM_PROMPT).toContain('"512 MB" -> "512Mi"');
    expect(PROVISION_PARAMS_SYSTEM_PROMPT).toContain("1Gi");
  });

  it("encodes ttl normalization rules and defaults", () => {
    expect(PROVISION_PARAMS_SYSTEM_PROMPT).toContain("1 hour");
    expect(PROVISION_PARAMS_SYSTEM_PROMPT).toContain("2.5 hours");
  });

  it("treats user input as untrusted data", () => {
    expect(PROVISION_PARAMS_SYSTEM_PROMPT).toContain("untrusted data");
    expect(PROVISION_PARAMS_SYSTEM_PROMPT).toContain("<user_request>");
  });
});

describe("buildProvisionUserContent", () => {
  it("wraps the prompt in user_request delimiters", () => {
    const content = buildProvisionUserContent("Launch ubuntu with 1 core");
    expect(content).toContain("<user_request>");
    expect(content).toContain("Launch ubuntu with 1 core");
    expect(content).toContain("</user_request>");
  });

  it("trims the prompt", () => {
    const content = buildProvisionUserContent("  spin up python  \n");
    expect(content).toContain("spin up python");
    expect(content).not.toContain("  spin up");
  });
});