import { env } from "../config/env";
import { deepSeekClient, LlmClient, LlmError, LlmFailureReason } from "./deepseek.client";
import { buildExplainUserContent, ERROR_INTERCEPTOR_SYSTEM_PROMPT } from "./llm.prompt";
import { parseExplanation } from "./llm.response";

export interface ExplainTemplate {
  displayName: string;
  dockerImage: string;
  privileged?: boolean;
}

export interface ExplainSandbox {
  template: ExplainTemplate;
  /** Per-sandbox resource overrides, when the user customized them. */
  resourceLimits?: { cpu?: string; memory?: string } | null;
  /** Requested lifetime in minutes, when the user customized it. */
  ttlMinutes?: number | null;
}

export interface ExplainErrorInput {
  sandbox: ExplainSandbox;
  command: string;
  stderr: string;
  /** Optional client-provided label; the retriever derives one when absent. */
  environmentType?: string;
}

export interface ExplainAvailable {
  status: "available";
  explanation: string;
  suggestedFix: string;
  model: string;
  generatedAt: string;
}

export interface ExplainUnavailable {
  status: "unavailable";
  reason: string;
  retryable: boolean;
}

export type ExplainErrorResult = ExplainAvailable | ExplainUnavailable;

/**
 * Extension point for the RAG layer. Today the only implementation derives
 * context from the sandbox template metadata. When vectorized docs + sandbox
 * metadata are available, add a VectorContextRetriever that fills `ragContext`
 * with retrieved snippets; the prompt already reserves a slot for it.
 */
export interface ContextRetriever {
  retrieve(input: ExplainErrorInput): Promise<RetrievedContext>;
}

export interface RetrievedContext {
  environmentType: string;
  ragContext?: string;
}

export class TemplateContextRetriever implements ContextRetriever {
  async retrieve(input: ExplainErrorInput): Promise<RetrievedContext> {
    const { displayName, dockerImage, privileged } = input.sandbox.template;
    const { resourceLimits, ttlMinutes } = input.sandbox;

    const details: string[] = [`image ${dockerImage}`];
    if (privileged) {
      details.push("privileged access");
    }
    if (resourceLimits?.cpu || resourceLimits?.memory) {
      details.push(
        `resources cpu=${resourceLimits.cpu ?? "?"} memory=${resourceLimits.memory ?? "?"}`,
      );
    }
    if (ttlMinutes) {
      details.push(`ttl ${ttlMinutes}m`);
    }

    return {
      environmentType:
        input.environmentType?.trim() ||
        (displayName
          ? `${displayName} (${details.join(", ")})`
          : `Unknown sandbox (${details.join(", ")})`),
      // RAG extension point: inject vectorized doc snippets + sandbox
      // metadata here (e.g. recently run commands, installed packages).
      ragContext: undefined,
    };
  }
}

export class ErrorInterceptorService {
  constructor(
    private readonly client: LlmClient,
    private readonly retriever: ContextRetriever,
  ) {}

  async explain(input: ExplainErrorInput): Promise<ExplainErrorResult> {
    try {
      const context = await this.retriever.retrieve(input);

      const userContent = buildExplainUserContent({
        command: input.command,
        stderr: truncate(input.stderr, env.llmMaxStderrChars),
        environmentType: context.environmentType,
        ragContext: context.ragContext,
      });

      const { text, model } = await this.client.complete({
        systemPrompt: ERROR_INTERCEPTOR_SYSTEM_PROMPT,
        userContent,
      });

      const parsed = parseExplanation(text);

      if (!parsed.explanation && !parsed.suggestedFix) {
        throw new LlmError("empty_response", "The model returned an empty explanation.");
      }

      return {
        status: "available",
        explanation: parsed.explanation,
        suggestedFix: parsed.suggestedFix,
        model,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      const unavailable = toUnavailable(error);
      console.warn(
        `[Error Interceptor] Explanation unavailable for sandbox ${input.sandbox?.template?.displayName ?? "?"}: ` +
          `${unavailable.reason} (${unavailable.retryable ? "retryable" : "not retryable"})`,
        error instanceof Error ? error.message : error,
      );
      return unavailable;
    }
  }
}

function toUnavailable(error: unknown): ExplainUnavailable {
  if (error instanceof LlmError) {
    return {
      status: "unavailable",
      reason: error.reason,
      retryable: isRetryable(error.reason),
    };
  }

  return {
    status: "unavailable",
    reason: "internal_error",
    retryable: true,
  };
}

function isRetryable(reason: LlmFailureReason): boolean {
  return reason !== "invalid_key";
}

function truncate(value: string, maxChars: number): string {
  if (!value) {
    return "";
  }

  if (Buffer.byteLength(value, "utf8") <= maxChars) {
    return value;
  }

  return `${Buffer.from(value).subarray(0, maxChars).toString("utf8")}\n[truncated]`;
}

export const errorInterceptorService = new ErrorInterceptorService(
  deepSeekClient,
  new TemplateContextRetriever(),
);
