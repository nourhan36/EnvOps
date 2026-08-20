import { prisma } from "../db/client";
import { provisionSandbox, deleteSandboxResources } from "./orchestrator.service";
import { NotFoundError } from "../errors/AppError";
import { SandboxStatus } from "../constants/sandbox-status";
import {
  clampCpu,
  clampMemory,
  clampTtlMinutes,
  SandboxResourceLimits,
} from "../constants/sandbox-resources";

export interface CreateSandboxOptions {
  resources?: Partial<SandboxResourceLimits>;
  ttlMinutes?: number;
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

    const templateLimits = template.defaultLimits as unknown as SandboxResourceLimits;

    // User overrides are clamped to platform bounds. The dockerImage, the
    // privileged flag and the pod command always come from the template so a
    // client can never self-escalate privileges or inject arbitrary images.
    const resourceLimits: SandboxResourceLimits = {
        cpu: clampCpu(options.resources?.cpu, templateLimits.cpu),
        memory: clampMemory(options.resources?.memory, templateLimits.memory),
    };

    const ttlMinutes = clampTtlMinutes(options.ttlMinutes, template.defaultTtlMinutes);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + ttlMinutes);

    let sandbox = await prisma.sandbox.create({
        data: {
            userId: userId,
            templateId: template.id,
            namespace: `pending-${Date.now()}`,
            status: SandboxStatus.PROVISIONING,
            expiresAt: expiresAt,
            resourceLimits: { cpu: resourceLimits.cpu, memory: resourceLimits.memory },
            ttlMinutes: ttlMinutes
        },
        include: {
            template: true
        }
    });

    try {
        const provisionResult = await provisionSandbox({
            dockerImage: template.dockerImage,
            limits: resourceLimits,
            privileged: template.privileged,
            command: (template.command as string[] | null) ?? undefined,
            args: (template.args as string[] | null) ?? undefined,
        });

        sandbox = await prisma.sandbox.update({
            where: { id: sandbox.id },
            data: {
                namespace: provisionResult.namespace,
                status: provisionResult.status
            },
            include: {
                template: true
            }
        });

        return sandbox;
    } catch (error) {
        await prisma.sandbox.update({
            where: { id: sandbox.id },
            data: {
                status: SandboxStatus.FAILED
            }
        });
        throw error;
    }
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
