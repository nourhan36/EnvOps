import { z } from "zod";
import {
  CPU_QUANTITY_PATTERN,
  MEMORY_QUANTITY_PATTERN,
} from "../constants/sandbox-resources";

/**
 * Matches a Docker image reference: optional registry path, repository name
 * (lowercase alphanumerics, dots, underscores, hyphens), and an optional tag
 * or digest. Rejects whitespace, shell metacharacters and malformed values so
 * the LLM-extracted image can be safely interpolated into a pod spec.
 */
export const IMAGE_REFERENCE_PATTERN =
  /^[a-zA-Z0-9]+(?:(?:[._]|__|[-]+)[a-zA-Z0-9]+)*(?:\/[a-zA-Z0-9]+(?:(?:[._]|__|[-]+)[a-zA-Z0-9]+)*)*(?::[a-zA-Z0-9._-]+)?(?:@[a-zA-Z0-9._-]+:[a-fA-F0-9]{6,})?$/;

/**
 * Zod schema for the LLM-extracted provisioning parameters. Validates the
 * model's JSON response before it is passed to the provisioner. CPU/memory
 * reuse the platform-wide Kubernetes quantity patterns; ttl is capped at
 * 24 hours (1440 minutes), matching the platform's upper bound.
 */
export const provisionParametersSchema = z
  .object({
    image: z
      .string()
      .min(1, "image cannot be empty")
      .regex(IMAGE_REFERENCE_PATTERN, "Invalid Docker image reference"),
    cpu: z
      .string()
      .regex(CPU_QUANTITY_PATTERN, "Invalid K8s CPU format"),
    memory: z
      .string()
      .regex(MEMORY_QUANTITY_PATTERN, "Invalid K8s Memory format"),
    ttl_minutes: z.number().int().positive().max(1440),
  })
  .strict();

export type ProvisionParameters = z.infer<typeof provisionParametersSchema>;

/**
 * Request schema for POST /api/sandboxes/from-prompt. The prompt is the only
 * client-supplied field; everything else is derived from the LLM and clamped
 * to platform bounds server-side.
 */
export const createSandboxFromPromptSchema = z.object({
  body: z
    .object({
      prompt: z
        .string()
        .min(1, "prompt cannot be empty")
        .max(2000, "prompt is too long"),
    })
    .strict(),
});