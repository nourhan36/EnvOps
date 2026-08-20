import { describe, expect, it } from "vitest";
import { extractProvisionJson, ProvisionParseError } from "./provision.response";

describe("extractProvisionJson", () => {
  it("parses a bare JSON object", () => {
    const raw = '{"image":"ubuntu:22.04","cpu":"1","memory":"2Gi","ttl_minutes":45}';
    expect(extractProvisionJson(raw)).toEqual({
      image: "ubuntu:22.04",
      cpu: "1",
      memory: "2Gi",
      ttl_minutes: 45,
    });
  });

  it("parses JSON wrapped in a markdown code fence", () => {
    const raw = [
      "Here you go:",
      "```json",
      '{"image":"alpine:latest","cpu":"500m","memory":"512Mi","ttl_minutes":30}',
      "```",
    ].join("\n");
    expect(extractProvisionJson(raw)).toEqual({
      image: "alpine:latest",
      cpu: "500m",
      memory: "512Mi",
      ttl_minutes: 30,
    });
  });

  it("parses JSON embedded in prose", () => {
    const raw = `The params are {"image":"node:latest","cpu":"500m","memory":"1Gi","ttl_minutes":60} hope that helps.`;
    expect(extractProvisionJson(raw)).toEqual({
      image: "node:latest",
      cpu: "500m",
      memory: "1Gi",
      ttl_minutes: 60,
    });
  });

  it("rejects an empty response", () => {
    expect(() => extractProvisionJson("  ")).toThrow(ProvisionParseError);
  });

  it("rejects output with no JSON object", () => {
    expect(() => extractProvisionJson("sorry, I cannot do that")).toThrow(
      /No JSON object was found/,
    );
  });

  it("rejects malformed JSON", () => {
    expect(() => extractProvisionJson('{"image": }')).toThrow(ProvisionParseError);
  });
});