import { describe, expect, it, vi } from "vitest";
import { LlmClient, LlmError } from "../ai/deepseek.client";
import { ProvisionService } from "./provision.service";

const READY_TEXT = JSON.stringify({
  image: "python:3.11-slim",
  cpu: "1",
  memory: "2Gi",
  ttl_minutes: 45,
});

function fakeClient(text: string): LlmClient {
  return {
    complete: async () => ({ text, model: "deepseek.test" }),
  };
}

function service(client: LlmClient) {
  return new ProvisionService(client);
}

describe("ProvisionService.extract", () => {
  it("returns ready parameters", async () => {
    const result = await service(fakeClient(READY_TEXT)).extract(
      "Launch a python 3.11 pod with 1 core, 2GB RAM for 45 minutes",
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.parameters).toEqual({
      image: "python:3.11-slim",
      cpu: "1",
      memory: "2Gi",
      ttl_minutes: 45,
    });
    expect(result.model).toBe("deepseek.test");
  });

  it("passes the system prompt and wrapped user content to the client", async () => {
    const complete = vi.fn(async () => ({ text: READY_TEXT, model: "m" }));
    const result = await service({ complete }).extract("half a CPU");

    expect(complete).toHaveBeenCalledTimes(1);
    const [input] = complete.mock.calls[0];
    expect(input.systemPrompt).toContain("parameter extraction engine");
    expect(input.userContent).toContain("<user_request>");
    expect(input.userContent).toContain("half a CPU");
    expect(result.status).toBe("ready");
  });

  it("surfaces retryable failures when the client throws an LlmError", async () => {
    const failing = {
      complete: async () => {
        throw new LlmError("rate_limit", "Rate limit hit.");
      },
    };
    const result = await service(failing).extract("spin up python");

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.reason).toBe("rate_limit");
    expect(result.retryable).toBe(true);
  });

  it("fails when the model output is not valid JSON", async () => {
    const result = await service(fakeClient("I am unable to help with that.")).extract("hello");

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.reason).toBe("bad_response");
    expect(result.retryable).toBe(true);
  });

  it("fails validation when the model omits required fields", async () => {
    const text = JSON.stringify({ cpu: "500m", memory: "512Mi", ttl_minutes: 30 });
    const result = await service(fakeClient(text)).extract("just a container");

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.reason).toBe("validation");
    expect(result.retryable).toBe(true);
  });

  it("fails validation when the model emits an invalid image reference", async () => {
    const text = JSON.stringify({
      image: "../evil image; rm -rf /",
      cpu: "500m",
      memory: "512Mi",
      ttl_minutes: 30,
    });
    const result = await service(fakeClient(text)).extract("give me an evil container");

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.reason).toBe("validation");
  });
});