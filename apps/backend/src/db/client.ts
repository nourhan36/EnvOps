import { PrismaClient } from '@prisma/client';

// create a shared Prisma client on the Node global object during development
// This prevents hot reloads or repeated imports from opening many DB connections
declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
