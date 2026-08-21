import { z } from "zod";
import {
  CPU_QUANTITY_PATTERN,
  MEMORY_QUANTITY_PATTERN,
  RESOURCE_BOUNDS,
} from "../constants/sandbox-resources";

export const resourceLimitsSchema = z
  .object({
    cpu: z
      .string()
      .regex(
        CPU_QUANTITY_PATTERN,
        "cpu must be a Kubernetes quantity, e.g. '500m', '1' or '2'"
      )
      .optional(),
    memory: z
      .string()
      .regex(
        MEMORY_QUANTITY_PATTERN,
        "memory must be a Kubernetes quantity, e.g. '128Mi', '512Mi' or '2Gi'"
      )
      .optional(),
  })
  .strict();

export const createSandboxSchema = z.object({
  body: z
    .object({
      templateId: z.string().min(1, "templateId cannot be empty"),
      resources: resourceLimitsSchema.optional(),
      ttlMinutes: z
        .number()
        .int("ttlMinutes must be a whole number of minutes")
        .min(RESOURCE_BOUNDS.ttlMinutes.min, `ttlMinutes must be at least ${RESOURCE_BOUNDS.ttlMinutes.min}`)
        .max(RESOURCE_BOUNDS.ttlMinutes.max, `ttlMinutes must be at most ${RESOURCE_BOUNDS.ttlMinutes.max}`)
        .optional(),
    })
    // Rejects unknown fields (e.g. securityMode, command, dockerImage) so a
    // client can never self-escalate privileges or pick an arbitrary image.
    .strict(),
});

export const sandboxIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, "id cannot be empty"),
  }),
});
