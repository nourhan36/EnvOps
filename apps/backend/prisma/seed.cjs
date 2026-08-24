require('dotenv/config');

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const demoUserEmail = process.env.DEMO_USER_EMAIL?.trim() || 'demo@envops.local';

const templates = [
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
    description: 'Ubuntu with common developer tools for learning Linux, scripting and DevOps workflows.',
    dockerImage: 'ubuntu:22.04',
    defaultLimits: { cpu: '500m', memory: '512Mi' },
    defaultTtlMinutes: 120,
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
    description: 'PostgreSQL 16 database server.',
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
    description: 'MySQL 8 database server.',
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
    description: 'Docker-in-Docker sandbox for building and running containers.',
    dockerImage: 'docker:dind',
    defaultLimits: { cpu: '1', memory: '1Gi' },
    defaultTtlMinutes: 120,
    securityMode: 'privileged',
    command: ['/bin/sh', '-c', 'dockerd-entrypoint.sh & sleep infinity'],
  },
  {
    name: 'kubernetes',
    displayName: 'Kubernetes Lab',
    description: 'Single-node k3s cluster for learning Kubernetes.',
    dockerImage: 'rancher/k3s',
    defaultLimits: { cpu: '1', memory: '1Gi' },
    defaultTtlMinutes: 120,
    securityMode: 'privileged',
    args: ['server', '--disable-traefik'],
  },
];

async function main() {
  await prisma.user.upsert({
    where: { email: demoUserEmail },
    update: {},
    create: { email: demoUserEmail },
  });

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
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
