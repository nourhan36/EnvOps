import { prisma } from "../db/client";

export async function getAllTemplates() {
    return await prisma.sandboxTemplate.findMany();
}
