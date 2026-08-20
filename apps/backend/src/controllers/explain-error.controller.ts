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

    if (!captured) {
      return res.json({
        status: "unavailable",
        reason: "no_failure_captured",
        retryable: false,
      });
    }

    command = captured.command;
    stderr = captured.stderr;
  }

  // Prompt-created sandboxes have no template; synthesize an environment label
  // from the stored image so the error interceptor still gets context.
  const template = sandbox.template ?? {
    displayName: sandbox.dockerImage ?? "Dynamic sandbox",
    dockerImage: sandbox.dockerImage ?? "unknown",
    securityMode: sandbox.securityMode,
  };

  const result = await errorInterceptorService.explain({
    sandbox: {
      template,
      resourceLimits: sandbox.resourceLimits as { cpu?: string; memory?: string } | null,
      ttlMinutes: sandbox.ttlMinutes,
    },
    command: command ?? "",
    stderr: stderr ?? "",
    environmentType: body.environmentType,
  });

  return res.json(result);
}
