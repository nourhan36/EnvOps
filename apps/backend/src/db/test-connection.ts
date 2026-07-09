import { prisma } from './client';
import { redisClient, connectRedis } from './redis';

// Smoke test for the database and Redis wiring used by the backend.
async function main() {
  // Create a temporary user to confirm Prisma can write to PostgreSQL.
  const user = await prisma.user.create({
    data: { email: `test-${Date.now()}@envops.local` },
  });
  console.log('Created user:', user);

  // Read sandbox templates to verify seeded data is visible to the client.
  const templates = await prisma.sandboxTemplate.findMany();
  console.log('Templates found:', templates.length);

  // Perform a simple Redis write/read round trip.
  await connectRedis();
  await redisClient.set('phase1-check', 'ok');
  const val = await redisClient.get('phase1-check');
  console.log('Redis round-trip:', val);

  // Clean up the temporary data and close network connections before exit.
  await prisma.user.delete({ where: { id: user.id } });
  await redisClient.disconnect();
  await prisma.$disconnect();
}

main().catch(console.error);
