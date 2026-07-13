import "dotenv/config";
import { spawn } from "node:child_process";
import { prisma } from "../src/db/client";
import { env } from "../src/config/env";

/**
 * DEMO ONLY — Eviction Engine will replace this cleanup script.
 */

async function runKubectl(args: string[]): Promise<void> {
  const finalArgs = env.kubectlContext
    ? [`--context=${env.kubectlContext}`, ...args]
    : args;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(env.kubectlBin, finalArgs, {
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      code === 0
        ? resolve()
        : reject(new Error(`kubectl exited with code ${code}`));
    });
  });
}

async function main(): Promise<void> {
  const sandboxId = process.argv[2]?.trim();

  if (!sandboxId) {
    throw new Error("Usage: npm run demo:cleanup -- <sandbox-id>");
  }

  const sandbox = await prisma.sandbox.findUnique({
    where: { id: sandboxId },
  });

  if (!sandbox) {
    throw new Error(`Sandbox ${sandboxId} was not found.`);
  }

  await runKubectl([
    "delete",
    "namespace",
    sandbox.namespace,
    "--ignore-not-found=true",
  ]);

  await prisma.sandbox.update({
    where: { id: sandbox.id },
    data: {
      status: "deleted",
      deletedAt: new Date(),
    },
  });

  console.log(`Cleaned sandbox ${sandbox.id}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
