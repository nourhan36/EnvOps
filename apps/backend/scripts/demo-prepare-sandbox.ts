import "dotenv/config";
import { spawn } from "node:child_process";
import { prisma } from "../src/db/client";
import { env } from "../src/config/env";

/**
 * DEMO ONLY — not the production Warm-Pool Orchestrator.
 *
 * This script creates a REAL Kubernetes Namespace and Pod so can prove
 * Socket.IO + node-pty works before the real orchestrator.
 * Delete this script when creates/assigns Pods and marks sandboxes
 * as running automatically.
 */

function kubectlArgs(args: string[]): string[] {
  return env.kubectlContext
    ? [`--context=${env.kubectlContext}`, ...args]
    : args;
}

async function runKubectlWithInput(
  args: string[],
  input: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(env.kubectlBin, kubectlArgs(args), {
      env: process.env,
      stdio: ["pipe", "inherit", "inherit"],
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`kubectl exited with code ${code}`));
      }
    });

    child.stdin.end(input);
  });
}

async function runKubectl(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(env.kubectlBin, kubectlArgs(args), {
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`kubectl exited with code ${code}`));
      }
    });
  });
}

function readLimits(value: unknown): { cpu: string; memory: string } {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as any).cpu === "string" &&
    typeof (value as any).memory === "string"
  ) {
    return {
      cpu: (value as any).cpu,
      memory: (value as any).memory,
    };
  }

  return { cpu: "250m", memory: "256Mi" };
}

async function main(): Promise<void> {
  const sandboxId = process.argv[2]?.trim();

  if (!sandboxId) {
    throw new Error(
      "Usage: npm run demo:prepare -- <sandbox-id returned by POST /api/sandboxes>",
    );
  }

  const sandbox = await prisma.sandbox.findUnique({
    where: { id: sandboxId },
    include: { template: true },
  });

  if (!sandbox) {
    throw new Error(`Sandbox ${sandboxId} was not found in PostgreSQL.`);
  }

  const podName = `workspace-${sandbox.id.slice(0, 8).toLowerCase()}`;
  const limits = readLimits(sandbox.template.defaultLimits);

  const manifest = {
    apiVersion: "v1",
    kind: "List",
    items: [
      {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name: sandbox.namespace,
          labels: {
            "envops.io/managed": "true",
            "envops.io/sandbox-id": sandbox.id,
          },
        },
      },
      {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
          name: podName,
          namespace: sandbox.namespace,
          labels: {
            app: "sandbox",
            "envops.io/managed": "true",
          },
          annotations: {
            "kubectl.kubernetes.io/default-container": "workspace",
          },
        },
        spec: {
          restartPolicy: "Never",
          containers: [
            {
              name: "workspace",
              image: sandbox.template.dockerImage,
              imagePullPolicy: "IfNotPresent",
              // Keeps the real sandbox container alive so kubectl exec can attach.
              command: [
                "/bin/sh",
                "-c",
                "trap : TERM INT; while true; do sleep 3600; done",
              ],
              stdin: true,
              tty: true,
              resources: {
                requests: limits,
                limits,
              },
              securityContext: {
                allowPrivilegeEscalation: false,
                capabilities: {
                  drop: ["ALL"],
                },
              },
            },
          ],
        },
      },
    ],
  };

  console.log(`Creating real Pod ${sandbox.namespace}/${podName}...`);
  await runKubectlWithInput(
    ["apply", "--filename", "-"],
    JSON.stringify(manifest),
  );

  await runKubectl([
    "wait",
    "--namespace",
    sandbox.namespace,
    "--for=condition=Ready",
    `pod/${podName}`,
    "--timeout=120s",
  ]);

  await prisma.sandbox.update({
    where: { id: sandbox.id },
    data: {
      status: "running",
      resourceLimits: limits,
    },
  });

  console.log("\nReal demo sandbox is ready.");
  console.log(`Sandbox ID: ${sandbox.id}`);
  console.log(`Namespace:  ${sandbox.namespace}`);
  console.log(`Pod:        ${podName}`);
  console.log(`\nNext: npm run demo:terminal -- ${sandbox.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
