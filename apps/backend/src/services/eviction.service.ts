import { prisma } from "../db/client";
import { deleteSandboxResources } from "./orchestrator.service";

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

    for (const sandbox of expiredSandboxes) {

        try {

            console.log(
                `Deleting expired sandbox: ${sandbox.id}`
            );

            await deleteSandboxResources(sandbox.namespace);
            await prisma.sandbox.update({
                where: {
                    id: sandbox.id
                },
                data: {
                    deletedAt: new Date()
                }
            });

            console.log(
                `Sandbox ${sandbox.id} successfully evicted.`
            );

        } catch (error) {

            console.error(
                `Failed to evict sandbox ${sandbox.id}:`,
                error
            );

        }
    }
}