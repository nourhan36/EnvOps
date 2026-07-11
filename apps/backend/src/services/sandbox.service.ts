import { prisma } from "../db/client";
import { provisionSandbox } from "./orchestrator.service";

export async function createSandbox(templateId: string) {

    const template = await prisma.sandboxTemplate.findUnique({
        where: {
            id: templateId
        }
    });

    if (!template) {
        throw new Error("Template not found");
    }

    const user = await prisma.user.findUnique({
        where: {
            email: "demo@envops.local"
        }
    });

    if (!user) {
        throw new Error("Demo user not found");
    }

    const expiresAt = new Date();

    expiresAt.setMinutes(
        expiresAt.getMinutes() + template.defaultTtlMinutes
    );

    const provisionResult = await provisionSandbox({
        dockerImage: template.dockerImage,
        limits: template.defaultLimits as {
            cpu: string;
            memory: string;
        }
    });

    const sandbox = await prisma.sandbox.create({
        data: {
            userId: user.id,
            templateId: template.id,
            namespace: provisionResult.namespace,
            status: provisionResult.status,
            expiresAt: expiresAt
        }
    });

    return sandbox;
}

export async function getAllSandboxes() {

    const user = await prisma.user.findUnique({
        where: {
            email: "demo@envops.local"
        }
    });

    if (!user) {
        throw new Error("Demo user not found");
    }

    return await prisma.sandbox.findMany({
        where: {
            userId: user.id,
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

export async function getSandboxById(id: string) {

    const user = await prisma.user.findUnique({
        where: {
            email: "demo@envops.local"
        }
    });

    if (!user) {
        throw new Error("Demo user not found");
    }

    const sandbox = await prisma.sandbox.findFirst({
        where: {
            id,
            userId: user.id,
            deletedAt: null
        },
        include: {
            template: true
        }
    });

    if (!sandbox) {
        throw new Error("Sandbox not found");
    }

    return sandbox;
}

export async function deleteSandbox(id: string) {

    const user = await prisma.user.findUnique({
        where: {
            email: "demo@envops.local"
        }
    });

    if (!user) {
        throw new Error("Demo user not found");
    }

    const sandbox = await prisma.sandbox.findFirst({
        where: {
            id,
            userId: user.id
        }
    });

    if (!sandbox) {
        throw new Error("Sandbox not found");
    }

    return await prisma.sandbox.update({
        where: {
            id
        },
        data: {
            status: "deleted",
            deletedAt: new Date()
        }
    });

}