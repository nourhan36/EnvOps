import { z } from "zod";

/**
 * Rejects newline/carriage-return/control characters (tab allowed). This is
 * the core auto-execution guardrail: the translated command is pasted onto
 * the user's cursor line, so any embedded \n would execute it immediately.
 */
const SINGLE_LINE_PATTERN = /^[^\n\r\u0000-\u0008\u000b-\u001f\u007f]*$/;

/**
 * Zod schema for the LLM-translated command. Validates the model's JSON
 * response before it is sent back to the terminal client.
 */
export const translatedCommandSchema = z
  .object({
    command: z
      .string()
      .min(1, "command cannot be empty")
      .max(2000, "command is too long")
      .regex(
        SINGLE_LINE_PATTERN,
        "command must be a single line without control characters",
      ),
    is_destructive: z.boolean(),
    explanation: z.string().min(1, "explanation cannot be empty").max(500),
  })
  .strict();

export type TranslatedCommand = z.infer<typeof translatedCommandSchema>;

/**
 * Socket payload schema for ai:translate. The intent length mirrors
 * AI_MAX_INTENT_CHARS at validation time; the socket handler clamps to the
 * configured env value as well.
 */
export const aiTranslateSocketPayloadSchema = z
  .object({
    sandboxId: z.string().min(1),
    intent: z.string(),
  })
  .strict();

export type AiTranslateSocketPayload = z.infer<
  typeof aiTranslateSocketPayloadSchema
>;
