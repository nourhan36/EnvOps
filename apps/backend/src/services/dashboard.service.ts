import { prisma } from "../db/client";
import { SandboxStatus } from "../constants/sandbox-status";


export async function getDashboardStats() {


    const totalSandboxes =
        await prisma.sandbox.count({
            where: {
                deletedAt: null
            }
        });



    const provisioningSandboxes =
        await prisma.sandbox.count({
            where: {
                status: SandboxStatus.PROVISIONING,
                deletedAt: null
            }
        });



    const runningSandboxes =
        await prisma.sandbox.count({
            where: {
                status: SandboxStatus.RUNNING,
                deletedAt: null
            }
        });



    const failedSandboxes =
        await prisma.sandbox.count({
            where: {
                status: SandboxStatus.FAILED,
                deletedAt: null
            }
        });



    const totalTemplates =
        await prisma.sandboxTemplate.count({
            where: {
                isActive: true
            }
        });



    return {

        totalSandboxes,

        provisioningSandboxes,

        runningSandboxes,

        failedSandboxes,

        totalTemplates

    };

}