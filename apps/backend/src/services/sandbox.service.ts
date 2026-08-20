import { prisma } from "../db/client";
import {
  provisionSandbox,
  deleteSandboxResources,
  ProvisionResult,
  SecurityMode,
} from "./orchestrator.service";
import {
  AppError,
  NotFoundError,
  ProvisionExtractionError,
  ProvisioningError,
} from "../errors/AppError";
import { SandboxStatus } from "../constants/sandbox-status";
import {
  clampCpu,
  clampMemory,
  clampTtlMinutes,
  SandboxResourceLimits,
} from "../constants/sandbox-resources";
import { provisionService } from "./provision.service";
import {
  canonicalizeImageReference,
  resolveTrustedRuntime,
} from "../constants/trusted-runtimes";

export interface CreateSandboxOptions {
  resources?: Partial<SandboxResourceLimits>;
  ttlMinutes?: number;
}

/** The subset of template data required to provision a sandbox. */
export interface ProvisionableTemplate {
  id: string;
  dockerImage: string;
  securityMode: SecurityMode;
  command?: string[] | null;
  args?: string[] | null;
  env?: { name: string; value: string }[] | null;
  defaultLimits: { cpu: string; memory: string };
  defaultTtlMinutes: number;
}

interface SandboxDraft {
  userId: string;
  templateId: string | null;
  dockerImage: string;
  securityMode: SecurityMode;
  resourceLimits: SandboxResourceLimits;
  ttlMinutes: number;
  expiresAt: Date;
}

/**
 * Creates the sandbox record in the PROVISIONING state, runs the provision
 * callback, then persists the resulting namespace/status. On failure the
 * record is marked FAILED and the error is rethrown - plain Errors are wrapped
 * in a ProvisioningError so clients get a descriptive 422 instead of a 500.
 */
async function persistAndProvision(
  draft: SandboxDraft,
  provision: () => Promise<ProvisionResult>
) {
  const sandbox = await prisma.sandbox.create({
    data: {
      userId: draft.userId,
      templateId: draft.templateId,
      dockerImage: draft.dockerImage,
      securityMode: draft.securityMode,
      namespace: `pending-${Date.now()}`,
      status: SandboxStatus.PROVISIONING,
      expiresAt: draft.expiresAt,
      resourceLimits: { cpu: draft.resourceLimits.cpu, memory: draft.resourceLimits.memory },
      ttlMinutes: draft.ttlMinutes,
    },
    include: {
      template: true,
    },
  });

  try {
    const provisionResult = await provision();
    return await prisma.sandbox.update({
      where: { id: sandbox.id },
      data: {
        namespace: provisionResult.namespace,
        status: provisionResult.status,
      },
      include: {
        template: true,
      },
    });
  } catch (error) {
    await prisma.sandbox.update({
      where: { id: sandbox.id },
      data: {
        status: SandboxStatus.FAILED,
      },
    });
    throw error instanceof AppError
      ? error
      : new ProvisioningError(error instanceof Error ? error.message : String(error));
  }
}

async function provisionFromTemplate(
  template: ProvisionableTemplate,
  userId: string,
  options: CreateSandboxOptions
) {
    // User overrides are clamped to platform bounds. The dockerImage, the
    // security mode and the pod command always come from the template so a
    // client can never self-escalate privileges or inject arbitrary images.
    const resourceLimits: SandboxResourceLimits = {
        cpu: clampCpu(options.resources?.cpu, template.defaultLimits.cpu),
        memory: clampMemory(options.resources?.memory, template.defaultLimits.memory),
    };

    const ttlMinutes = clampTtlMinutes(options.ttlMinutes, template.defaultTtlMinutes);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + ttlMinutes);

    return persistAndProvision(
        {
            userId: userId,
            templateId: template.id,
            dockerImage: template.dockerImage,
            securityMode: template.securityMode,
            resourceLimits: resourceLimits,
            ttlMinutes: ttlMinutes,
            expiresAt: expiresAt,
        },
        () =>
            provisionSandbox({
                dockerImage: template.dockerImage,
                limits: resourceLimits,
                securityMode: template.securityMode,
                command: template.command ?? undefined,
                args: template.args ?? undefined,
                env: template.env ?? undefined,
            })
    );
}

export async function createSandbox(
  templateId: string,
  userId: string,
  options: CreateSandboxOptions = {}
) {
    const template = await prisma.sandboxTemplate.findUnique({
        where: { id: templateId }
    });

    if (!template) {
        throw new NotFoundError("Template not found");
    }

    return provisionFromTemplate(template as unknown as ProvisionableTemplate, userId, options);
}

/**
 * Provisions a sandbox from a natural language request. The LLM extracts the
 * provisioning parameters (image, cpu, memory, ttl_minutes). The extracted
 * image name is canonicalized server-side (so "nodejs" becomes "node") and then
 * resolved against the trusted-runtime allowlist: known database and service
 * runtimes (postgres, mysql, redis, ...) run as root with a pinned entrypoint
 * command, while all other images always run hardened (non-root, no
 * capabilities, default "sleep infinity" command) so a prompt can never
 * escalate privileges on an arbitrary image.
 */
export async function createSandboxFromPrompt(prompt: string, userId: string) {
    const result = await provisionService.extract(prompt);

    if (result.status !== "ready") {
        throw new ProvisionExtractionError(result);
    }

    const { parameters } = result;

    const resourceLimits: SandboxResourceLimits = {
        cpu: clampCpu(parameters.cpu, "500m"),
        memory: clampMemory(parameters.memory, "512Mi"),
    };

    const ttlMinutes = clampTtlMinutes(parameters.ttl_minutes, 30);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + ttlMinutes);

    const runtime = resolveTrustedRuntime(parameters.image);
    const dockerImage = runtime?.image ?? canonicalizeImageReference(parameters.image);
    const securityMode: SecurityMode = runtime ? runtime.securityMode : "hardened";

    return persistAndProvision(
        {
            userId: userId,
            templateId: null,
            dockerImage: dockerImage,
            securityMode: securityMode,
            resourceLimits: resourceLimits,
            ttlMinutes: ttlMinutes,
            expiresAt: expiresAt,
        },
        () =>
            provisionSandbox({
                dockerImage: dockerImage,
                limits: resourceLimits,
                securityMode: securityMode,
                command: runtime?.command,
                args: runtime?.args,
                env: runtime?.env,
            })
    );
}

export async function getAllSandboxes(userId: string) {
    return await prisma.sandbox.findMany({
        where: {
            userId: userId,
            deletedAt: null
        },
        include: {
            template: true
        },
        orderBy: {
            createdAt: "desc"
        }
    });
}

export async function getSandboxById(id: string, userId: string) {
    const sandbox = await prisma.sandbox.findFirst({
        where: {
            id,
            userId: userId,
            deletedAt: null
        },
        include: {
            template: true
        }
    });

    if (!sandbox) {
        throw new NotFoundError("Sandbox not found");
    }

    return sandbox;
}

export async function deleteSandbox(id: string, userId: string) {
    const sandbox = await prisma.sandbox.findFirst({
        where: {
            id,
            userId: userId,
            deletedAt: null
        }
    });

    if (!sandbox) {
        throw new NotFoundError("Sandbox not found");
    }

    await deleteSandboxResources(sandbox.namespace);

    return await prisma.sandbox.update({
        where: { id },
        data: {
            status: SandboxStatus.DELETED,
            deletedAt: new Date()
        },
        include: {
            template: true
        }
    });
}