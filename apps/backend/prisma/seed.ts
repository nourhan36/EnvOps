import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
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
  

  const templates: Prisma.SandboxTemplateUncheckedCreateInput[] = [
    {
      name: 'ubuntu',
      displayName: 'Empty Ubuntu Sandbox',
      dockerImage: 'ubuntu:22.04',
      defaultLimits: { cpu: '250m', memory: '256Mi' },
      defaultTtlMinutes: 60,
      securityMode: 'hardened',
    },
    {
      name: 'rich-linux',
      displayName: 'Rich Linux',
      description:
        'Ubuntu 22.04 with a broad set of developer tools preinstalled for learning Linux, scripting and DevOps workflows.',
      dockerImage: 'ubuntu:22.04',
      defaultLimits: { cpu: '500m', memory: '512Mi' },
      defaultTtlMinutes: 120,
      // apt-get needs root to write system directories, but NOT privileged pod
      // access - root mode is sufficient and safer than privileged.
      securityMode: 'root',
      command: [
        '/bin/sh',
        '-c',
        'apt-get update -y && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git curl wget vim nano python3 python3-pip nodejs npm jq unzip openssh-client && sleep infinity',
      ],
    },
    {
      name: 'postgres',
      displayName: 'PostgreSQL',
      description:
        'PostgreSQL 16 database server. Connect from the sandbox terminal: psql -U postgres (password: postgres).',
      dockerImage: 'postgres:16-alpine',
      defaultLimits: { cpu: '500m', memory: '1Gi' },
      defaultTtlMinutes: 120,
      securityMode: 'root',
      command: ['docker-entrypoint.sh'],
      args: ['postgres'],
      env: [{ name: 'POSTGRES_PASSWORD', value: 'postgres' }],
    },
    {
      name: 'mysql',
      displayName: 'MySQL',
      description:
        'MySQL 8 database server. Connect from the sandbox terminal: mysql -u root -proot.',
      dockerImage: 'mysql:8',
      defaultLimits: { cpu: '1', memory: '1Gi' },
      defaultTtlMinutes: 120,
      securityMode: 'root',
      command: ['docker-entrypoint.sh'],
      args: ['mysqld'],
      env: [{ name: 'MYSQL_ROOT_PASSWORD', value: 'root' }],
    },
    {
      name: 'docker',
      displayName: 'Docker Playground',
      description:
        'Docker-in-Docker sandbox. Runs a real Docker daemon so you can build images and run containers. Requires privileged access.',
      dockerImage: 'docker:dind',
      defaultLimits: { cpu: '1', memory: '1Gi' },
      defaultTtlMinutes: 120,
      securityMode: 'privileged',
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
      securityMode: 'privileged',
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
