import { z } from "zod";

export const createSandboxSchema = z.object({
  body: z.object({
    templateId: z.string().min(1, "templateId cannot be empty"),
  }),
});

export const sandboxIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, "id cannot be empty"),
  }),
});
