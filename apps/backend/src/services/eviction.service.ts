import { prisma } from "../db/client";

export async function runEvictionCycle() {

    console.log("Checking expired sandboxes...");

    const expiredSandboxes = await prisma.sandbox.findMany({

        where: {
            deletedAt: null,
            expiresAt: {
                lte: new Date()
            }
        }

    });

    console.log(
        `Found ${expiredSandboxes.length} expired sandbox(es).`
    );

}