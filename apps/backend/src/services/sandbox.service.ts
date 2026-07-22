import { prisma } from "../db/client";
import { provisionSandbox, deleteSandboxResources } from "./orchestrator.service";
import { NotFoundError } from "../errors/AppError";
import { SandboxStatus } from "../constants/sandbox-status";

export async function createSandbox(templateId: string, userId: string) {

    const template = await prisma.sandboxTemplate.findUnique({
        where: { id: templateId }
    });

    if (!template) {
        throw new NotFoundError("Template not found");
    }

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + template.defaultTtlMinutes);

    let sandbox = await prisma.sandbox.create({
        data: {
            userId: userId,
            templateId: template.id,
            namespace: `pending-${Date.now()}`,
            status: SandboxStatus.PROVISIONING,
            expiresAt: expiresAt
        },
        include: {
            template: true
        }
    });

    try {
        const provisionResult = await provisionSandbox({
            dockerImage: template.dockerImage,
            limits: template.defaultLimits as { cpu: string; memory: string; }
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
        }
    });
}