import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const demoUserEmail = process.env.DEMO_USER_EMAIL?.trim() || 'demo@envops.local';

async function main() {

  await prisma.user.upsert({
    where: {
      email: demoUserEmail,
    },
    update: {},
    create: {
      email: demoUserEmail,
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
