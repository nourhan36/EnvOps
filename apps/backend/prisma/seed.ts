import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {

  await prisma.user.upsert({
    where: {
      email: "demo@envops.local",
    },
    update: {},
    create: {
      email: "demo@envops.local",
    },
  });

  await prisma.sandboxTemplate.createMany({
    data: [
      {
        name: 'ubuntu',
        displayName: 'Empty Ubuntu Sandbox',
        dockerImage: 'ubuntu:22.04',
        defaultLimits: { cpu: '250m', memory: '256Mi' },
      }
    ],
    skipDuplicates: true,
  });
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());