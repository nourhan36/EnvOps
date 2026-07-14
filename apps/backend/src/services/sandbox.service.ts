import { prisma } from "../db/client";
import { provisionSandbox } from "./orchestrator.service";
import { NotFoundError } from "../errors/AppError";

export async function createSandbox(templateId: string, userId: string) {

    const template = await prisma.sandboxTemplate.findUnique({
        where: { id: templateId }
    });

    if (!template) {
        throw new NotFoundError("Template not found");
    }

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + template.defaultTtlMinutes);

    const provisionResult = await provisionSandbox({
        dockerImage: template.dockerImage,
        limits: template.defaultLimits as { cpu: string; memory: string; }
    });

    const sandbox = await prisma.sandbox.create({
        data: {
            userId: userId,
            templateId: template.id,
            namespace: provisionResult.namespace,
            status: provisionResult.status,
            expiresAt: expiresAt
        }
    });

    return sandbox;
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

    return await prisma.sandbox.update({
        where: { id },
        data: {
            status: "deleted",
            deletedAt: new Date()
        }
    });
}