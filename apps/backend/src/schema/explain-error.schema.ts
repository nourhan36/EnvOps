import { z } from "zod";

export const explainErrorSchema = z.object({
  params: z.object({
    id: z.string().min(1, "id cannot be empty"),
  }),
  body: z
    .object({
      command: z.string().min(1).max(1024, "command is too long").optional(),
      stderr: z.string().min(1).max(20_000, "stderr is too long").optional(),
      environmentType: z.string().min(1).max(200, "environmentType is too long").optional(),
    })
    .refine(
      (body) => (body.command !== undefined) === (body.stderr !== undefined),
      {
        message: "command and stderr must be provided together; omit both to use the last captured failure",
        path: ["body"],
      },
    ),
});
