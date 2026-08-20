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

  const templates = [
    {
      name: 'ubuntu',
      displayName: 'Empty Ubuntu Sandbox',
      dockerImage: 'ubuntu:22.04',
      defaultLimits: { cpu: '250m', memory: '256Mi' },
      defaultTtlMinutes: 60,
    },
    {
      name: 'rich-linux',
      displayName: 'Rich Linux',
      description:
        'Ubuntu 22.04 with a broad set of developer tools preinstalled for learning Linux, scripting and DevOps workflows.',
      dockerImage: 'ubuntu:22.04',
      defaultLimits: { cpu: '500m', memory: '512Mi' },
      defaultTtlMinutes: 120,
      command: [
        '/bin/sh',
        '-c',
        'apt-get update -y && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git curl wget vim nano python3 python3-pip nodejs npm jq unzip openssh-client && sleep infinity',
      ],
    },
    {
      name: 'docker',
      displayName: 'Docker Playground',
      description:
        'Docker-in-Docker sandbox. Runs a real Docker daemon so you can build images and run containers. Requires privileged access.',
      dockerImage: 'docker:dind',
      defaultLimits: { cpu: '1', memory: '1Gi' },
      defaultTtlMinutes: 120,
      privileged: true,
      command: ['/bin/sh', '-c', 'dockerd-entrypoint.sh & sleep infinity'],
    },
    {
      name: 'kubernetes',
      displayName: 'Kubernetes Lab',
      description:
        'Single-node k3s cluster for learning kubectl, workloads, services and Helm. Requires privileged access.',
      dockerImage: 'rancher/k3s',
      defaultLimits: { cpu: '1', memory: '1Gi' },
      defaultTtlMinutes: 120,
      privileged: true,
      // Preserves the image ENTRYPOINT (/bin/k3s) and passes server args to it.
      args: ['server', '--disable-traefik'],
    },
  ];

  for (const template of templates) {
    await prisma.sandboxTemplate.upsert({
      where: { name: template.name },
      update: template,
      create: template,
    });
  }
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
