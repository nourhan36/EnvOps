import { env } from "../config/env";
import { extractResponseText } from "./llm.response";

export type LlmFailureReason =
  | "network"
  | "timeout"
  | "rate_limit"
  | "invalid_key"
  | "bad_response"
  | "empty_response";

export class LlmError extends Error {
  constructor(
    public readonly reason: LlmFailureReason,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface LlmCompletion {
  text: string;
  model: string;
}

export interface LlmClient {
  /**
   * Non-streaming completion. The interface is the extension seam for future
   * streaming support (e.g. `streamCompletion`) and for RAG-aware requests.
   */
  complete(input: {
    systemPrompt: string;
    userContent: string;
  }): Promise<LlmCompletion>;
}

export class DeepSeekClient implements LlmClient {
  constructor(private readonly deps: {
    baseUrl: string;
    modelId: string;
    apiKey: string;
    timeoutMs: number;
    maxRetries: number;
    fetchImpl?: typeof fetch;
  }) {}

  private get fetchImpl(): typeof fetch {
    return this.deps.fetchImpl ?? fetch;
  }

  async complete(input: {
    systemPrompt: string;
    userContent: string;
  }): Promise<LlmCompletion> {
    if (!this.deps.apiKey) {
      throw new LlmError("invalid_key", "SBG_API_KEY is not configured.");
    }

    const body = {
      model_id: this.deps.modelId,
      messages: [
        {
          role: "user",
          content: input.userContent,
        },
      ],
      system_prompt: input.systemPrompt,
    };

    let lastError: LlmError | null = null;

    for (let attempt = 0; attempt <= this.deps.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(250 * attempt);
      }

      try {
        const text = await this.postAndExtract(body);
        return { text, model: this.deps.modelId };
      } catch (error) {
        if (!(error instanceof LlmError)) {
          throw error;
        }

        if (!isRetryable(error.reason) || attempt === this.deps.maxRetries) {
          throw error;
        }

        lastError = error;
      }
    }

    throw lastError ?? new LlmError("bad_response", "LLM request failed.");
  }

  private async postAndExtract(body: unknown): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.deps.timeoutMs);

    let response: Response;

    try {
      response = await this.fetchImpl(`${this.deps.baseUrl}/student/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.deps.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new LlmError("timeout", "LLM request timed out.");
      }
      throw new LlmError("network", `Unable to reach the LLM gateway: ${(error as Error).message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 401 || response.status === 403) {
      throw new LlmError("invalid_key", `LLM gateway rejected the API key (HTTP ${response.status}).`);
    }

    if (response.status === 429) {
      throw new LlmError("rate_limit", "LLM gateway rate limit exceeded.");
    }

    if (!response.ok) {
      if (response.status >= 500) {
        throw new LlmError("bad_response", `LLM gateway error (HTTP ${response.status}).`);
      }
      throw new LlmError("bad_response", `LLM gateway error (HTTP ${response.status}).`);
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new LlmError("bad_response", "LLM gateway returned a non-JSON response.");
    }

    // The ITI gateway reports errors as a 200 OK body with an error envelope:
    // { "error": { "code": "AUTH_INVALID", "message": "...", "details": {} } }
    const gatewayError = extractGatewayError(payload);

    if (gatewayError) {
      throw mapGatewayError(gatewayError);
    }

    const text = extractResponseText(payload);

    if (!text.trim()) {
      throw new LlmError("empty_response", "LLM gateway returned an empty response.");
    }

    return text;
  }
}

interface GatewayError {
  code: string;
  message: string;
}

function extractGatewayError(payload: unknown): GatewayError | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const error = record.error;

  if (typeof error !== "object" || error === null) {
    return null;
  }

  const errorRecord = error as Record<string, unknown>;
  const code = typeof errorRecord.code === "string" ? errorRecord.code : "";
  const message = typeof errorRecord.message === "string" ? errorRecord.message : "";

  if (!code && !message) {
    return null;
  }

  return { code, message };
}

function mapGatewayError(error: GatewayError): LlmError {
  const code = error.code.toUpperCase();

  if (code.includes("AUTH") || code.includes("TOKEN") || code.includes("UNAUTHORIZED")) {
    return new LlmError("invalid_key", `LLM gateway rejected the API key: ${error.message}`);
  }

  if (code.includes("RATE") || code.includes("LIMIT") || code.includes("THROTTLE")) {
    return new LlmError("rate_limit", `LLM gateway rate limit exceeded: ${error.message}`);
  }

  return new LlmError("bad_response", `LLM gateway error: ${error.message}`);
}

function isRetryable(reason: LlmFailureReason): boolean {
  return reason === "network" || reason === "rate_limit" || reason === "bad_response";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const deepSeekClient: LlmClient = new DeepSeekClient({
  baseUrl: env.llmBaseUrl,
  modelId: env.llmModelId,
  apiKey: env.llmApiKey,
  timeoutMs: env.llmTimeoutMs,
  maxRetries: env.llmMaxRetries,
});
