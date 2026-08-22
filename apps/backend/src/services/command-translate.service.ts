import {
  buildTranslateRetryUserContent,
  buildTranslateUserContent,
  COMMAND_TRANSLATE_SYSTEM_PROMPT,
  sanitizeForGateway,
} from "../ai/translate.prompt";
import { deepSeekClient } from "../ai/deepseek.client";
import type { LlmClient } from "../ai/deepseek.client";
import { LlmError } from "../ai/deepseek.client";
import {
  extractTranslationJson,
  normalizeTranslatedCommand,
  TranslationParseError,
} from "../ai/translate.response";
import {
  TranslatedCommand,
  translatedCommandSchema,
} from "../schema/ai-translate.schema";

export interface CommandTranslationReady {
  status: "ready";
  translation: TranslatedCommand;
  model: string;
}

export interface CommandTranslationFailed {
  status: "failed";
  reason: string;
  issues: string[];
  retryable: boolean;
}

export type CommandTranslationResult =
  | CommandTranslationReady
  | CommandTranslationFailed;

const MAX_ATTEMPTS = 2;

/**
 * Translates a natural-language intent into a single-line bash command.
 * Pipeline: LLM completion -> JSON extraction -> Zod validation, with one
 * corrective retry when the model's first reply fails parsing or schema
 * validation. LLM/parse failures surface as a structured failed result
 * instead of throwing.
 */
export class CommandTranslateService {
  constructor(private readonly client: LlmClient) {}

  async translate(intent: string): Promise<CommandTranslationResult> {
    let lastFailure: CommandTranslationFailed | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const userContent =
        attempt === 0
          ? buildTranslateUserContent(intent)
          : buildTranslateRetryUserContent(intent);

      try {
        const { text, model } = await this.client.complete({
          systemPrompt: sanitizeForGateway(COMMAND_TRANSLATE_SYSTEM_PROMPT),
          userContent: sanitizeForGateway(userContent),
        });

        const raw = extractTranslationJson(text);

        if (
          typeof raw === "object" &&
          raw !== null &&
          "command" in raw &&
          typeof (raw as { command: unknown }).command === "string"
        ) {
          // The model sometimes decorates the command with comments or
          // markdown wrappers; clean it before validation. A value with
          // nothing executable left fails validation and triggers the
          // corrective retry below.
          const normalized = normalizeTranslatedCommand(
            (raw as { command: string }).command,
          );

          if (!normalized || normalized.startsWith("#")) {
            throw new TranslationParseError(
              "The model returned a comment instead of an executable command.",
            );
          }

          (raw as { command: string }).command = normalized;
        }

        const translation = translatedCommandSchema.parse(raw);

        return { status: "ready", translation, model };
      } catch (error) {
        const failure = toTranslationFailed(error);
        lastFailure = failure;

        // Transport-level failures (network/timeout/keys) are not fixed by
        // re-asking the model with a corrective nudge - bail out immediately.
        if (error instanceof LlmError) {
          return failure;
        }
      }
    }

    return (
      lastFailure ?? {
        status: "failed",
        reason: "internal_error",
        issues: ["Translation failed."],
        retryable: true,
      }
    );
  }
}

function toTranslationFailed(error: unknown): CommandTranslationFailed {
  if (error instanceof LlmError) {
    return {
      status: "failed",
      reason: error.reason,
      issues: [error.message],
      retryable: error.reason !== "invalid_key",
    };
  }

  if (error instanceof TranslationParseError) {
    return {
      status: "failed",
      reason: "bad_response",
      issues: [error.message],
      retryable: true,
    };
  }

  if (
    error instanceof Error &&
    "issues" in error &&
    Array.isArray((error as any).issues)
  ) {
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

export const commandTranslateService = new CommandTranslateService(
  deepSeekClient,
);
