import { describe, expect, it, vi } from "vitest";
import { DeepSeekClient, LlmError } from "./deepseek.client";

function createClient(fetchImpl: typeof fetch) {
  return new DeepSeekClient({
    baseUrl: "http://gateway.test",
    modelId: "deepseek.v3.2",
    apiKey: "test-key",
    timeoutMs: 1000,
    maxRetries: 0,
    fetchImpl,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("DeepSeekClient", () => {
  it("builds the documented gateway payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "hi" } }] }),
    );

    await createClient(fetchImpl as typeof fetch).complete({
      systemPrompt: "sys",
      userContent: "user",
    });

    const [url, init] = fetchImpl.mock.calls[0];

    expect(url).toBe("http://gateway.test/student/chat");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toEqual({
      model_id: "deepseek.v3.2",
      messages: [{ role: "user", content: "user" }],
      system_prompt: "sys",
    });
  });

  it("extracts text from an OpenAI-compatible response", async () => {
    const client = createClient(
      (async () =>
        jsonResponse({ choices: [{ message: { content: "## Diagnosis\nboom" } }] })) as typeof fetch,
    );

    const { text } = await client.complete({ systemPrompt: "s", userContent: "u" });
    expect(text).toBe("## Diagnosis\nboom");
  });

  it("maps a 200 error envelope (AUTH_INVALID) to invalid_key", async () => {
    const client = createClient(
      (async () =>
        jsonResponse({
          error: { code: "AUTH_INVALID", message: "Invalid access token.", details: {} },
        })) as typeof fetch,
    );

    await expect(client.complete({ systemPrompt: "s", userContent: "u" })).rejects.toMatchObject({
      reason: "invalid_key",
    });
  });

  it("maps a 200 error envelope (rate limit) to rate_limit", async () => {
    const client = createClient(
      (async () =>
        jsonResponse({
          error: { code: "RATE_LIMIT", message: "Too many requests.", details: {} },
        })) as typeof fetch,
    );

    await expect(client.complete({ systemPrompt: "s", userContent: "u" })).rejects.toMatchObject({
      reason: "rate_limit",
    });
  });

  it("reports empty_response when the body has no recognized text", async () => {
    const client = createClient((async () => jsonResponse({ ok: true })) as typeof fetch);

    await expect(client.complete({ systemPrompt: "s", userContent: "u" })).rejects.toMatchObject({
      reason: "empty_response",
    });
  });

  it("reports invalid_key when the API key is not configured", async () => {
    const client = new DeepSeekClient({
      baseUrl: "http://gateway.test",
      modelId: "deepseek.v3.2",
      apiKey: "",
      timeoutMs: 1000,
      maxRetries: 0,
      fetchImpl: vi.fn() as typeof fetch,
    });

    await expect(client.complete({ systemPrompt: "s", userContent: "u" })).rejects.toBeInstanceOf(
      LlmError,
    );
    await expect(client.complete({ systemPrompt: "s", userContent: "u" })).rejects.toMatchObject({
      reason: "invalid_key",
    });
  });
});
