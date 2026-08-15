import { Request, Response } from "express";
import { getSandboxById } from "../services/sandbox.service";
import { errorInterceptorService } from "../ai/error-interceptor.service";
import { errorCaptureRegistry } from "../error-interceptor/capture.service";

export interface ExplainErrorBody {
  command?: string;
  stderr?: string;
  environmentType?: string;
}

export async function explainError(req: Request<{ id: string }>, res: Response) {
  const userId = (req as any).user.id;
  const sandbox = await getSandboxById(req.params.id, userId);

  const body = (req.body ?? {}) as ExplainErrorBody;

  let command = body.command;
  let stderr = body.stderr;

  if (!command && !stderr) {
    const captured = errorCaptureRegistry.getLastFailure(sandbox.id);
    command = captured?.command ?? "";
    stderr = captured?.stderr ?? "";
  }

  const result = await errorInterceptorService.explain({
    sandbox: { template: sandbox.template },
    command: command ?? "",
    stderr: stderr ?? "",
    environmentType: body.environmentType,
  });

  return res.json(result);
}
