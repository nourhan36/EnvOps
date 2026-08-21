import { deepSeekClient, LlmClient, LlmError } from "../ai/deepseek.client";
import {
  PROVISION_PARAMS_SYSTEM_PROMPT,
  buildProvisionUserContent,
} from "../ai/provision.prompt";
import {
  extractProvisionJson,
  ProvisionParseError,
} from "../ai/provision.response";
import {
  provisionParametersSchema,
  ProvisionParameters,
} from "../schema/provision.schema";

export interface ProvisionReady {
  status: "ready";
  parameters: ProvisionParameters;
  model: string;
}

export interface ProvisionFailed {
  status: "failed";
  reason: string;
  issues: string[];
  retryable: boolean;
}

export type ProvisionExtractionResult = ProvisionReady | ProvisionFailed;

export class ProvisionService {
  constructor(private readonly client: LlmClient) {}

  /**
   * Runs the full extraction pipeline: LLM completion -> JSON extraction ->
   * Zod validation. The extracted image is used verbatim as the container
   * image (provisioned with the hardened security context). LLM/parse
   * failures surface as a structured failed result instead of throwing.
   */
  async extract(prompt: string): Promise<ProvisionExtractionResult> {
    try {
      const { text, model } = await this.client.complete({
        systemPrompt: PROVISION_PARAMS_SYSTEM_PROMPT,
        userContent: buildProvisionUserContent(prompt),
      });

      const raw = extractProvisionJson(text);
      const parameters = provisionParametersSchema.parse(raw);

      return {
        status: "ready",
        parameters,
        model,
      };
    } catch (error) {
      return toProvisionFailed(error);
    }
  }
}

function toProvisionFailed(error: unknown): ProvisionFailed {
  if (error instanceof LlmError) {
    return {
      status: "failed",
      reason: error.reason,
      issues: [error.message],
      retryable: error.reason !== "invalid_key",
    };
  }

  if (error instanceof ProvisionParseError) {
    return {
      status: "failed",
      reason: "bad_response",
      issues: [error.message],
      retryable: true,
    };
  }

  if (error instanceof Error && "issues" in error && Array.isArray((error as any).issues)) {
    return {
      status: "failed",
      reason: "validation",
      issues: (error as any).issues.map((issue: any) => issue.message),
      retryable: true,
    };
  }

  return {
    status: "failed",
    reason: "internal_error",
    issues: [error instanceof Error ? error.message : "Unknown error."],
    retryable: true,
  };
}

export const provisionService = new ProvisionService(deepSeekClient);