import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "../db/client";
import { env } from "../config/env";
import { SandboxTerminalTarget, TerminalErrorCode } from "../types/terminal.types";

const execFileAsync = promisify(execFile);

export class TerminalTargetError extends Error {
  constructor(
    public readonly code: TerminalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TerminalTargetError";
  }
}

interface KubernetesPodList {
  items?: Array<{
    metadata?: {
      name?: string;
      deletionTimestamp?: string;
      annotations?: Record<string, string>;
    };
    status?: {
      phase?: string;
    };
    spec?: {
      containers?: Array<{ name?: string }>;
    };
  }>;
}

function getKubectlGlobalArgs(): string[] {
  const args: string[] = [];

  // For local development, kubectl normally reads the current kubeconfig.
  // For production, the supplied Docker entrypoint creates an in-cluster kubeconfig.
  if (env.kubectlContext) {
    args.push(`--context=${env.kubectlContext}`);
  }

  return args;
}

function validateLabelValue(value: string): void {
  // Kubernetes label values allow letters, digits, '.', '_' and '-'.
  // Prisma currently generates UUID sandbox IDs, which satisfy this rule.
  const valid = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,61}[A-Za-z0-9])?$/;

  if (!valid.test(value)) {
    throw new TerminalTargetError(
      "INVALID_PAYLOAD",
      "The sandbox ID cannot be used as a Kubernetes label value.",
    );
  }
}

async function findRunningSandboxPod(
  namespace: string,
  sandboxId: string,
): Promise<{ podName: string; containerName?: string }> {
  validateLabelValue(sandboxId);

  const selector = `${env.sandboxPodLabelKey}=${sandboxId}`;
  const args = [
    ...getKubectlGlobalArgs(),
    "get",
    "pods",
    "--namespace",
    namespace,
    "--selector",
    selector,
    "--output",
    "json",
  ];

  let stdout: string;

  try {
    const result = await execFileAsync(env.kubectlBin, args, {
      env: process.env,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });

    stdout = result.stdout;
  } catch (error: any) {
    throw new TerminalTargetError(
      "SANDBOX_POD_NOT_FOUND",
      `Unable to query Kubernetes for the sandbox Pod: ${error.message}`,
    );
  }

  let podList: KubernetesPodList;

  try {
    podList = JSON.parse(stdout) as KubernetesPodList;
  } catch {
    throw new TerminalTargetError(
      "INTERNAL_ERROR",
      "kubectl returned an invalid Pod response.",
    );
  }

  const pod = podList.items?.find(
    (item) =>
      item.status?.phase === "Running" && !item.metadata?.deletionTimestamp,
  );

  const podName = pod?.metadata?.name;

  if (!podName) {
    throw new TerminalTargetError(
      "SANDBOX_POD_NOT_FOUND",
      "No running Pod is assigned to this sandbox yet.",
    );
  }

  const defaultContainer =
    pod.metadata?.annotations?.["kubectl.kubernetes.io/default-container"];
  const firstContainer = pod.spec?.containers?.[0]?.name;

  return {
    podName,
    containerName: defaultContainer || firstContainer,
  };
}

export async function resolveSandboxTerminalTarget(
  sandboxId: string,
  userEmail: string,
): Promise<SandboxTerminalTarget> {
  if (!sandboxId || typeof sandboxId !== "string") {
    throw new TerminalTargetError(
      "INVALID_PAYLOAD",
      "sandboxId is required.",
    );
  }

  const sandbox = await prisma.sandbox.findFirst({
    where: {
      id: sandboxId,
      deletedAt: null,
      user: {
        email: userEmail,
      },
    },
  });

  if (!sandbox) {
    throw new TerminalTargetError(
      "SANDBOX_NOT_FOUND",
      "Sandbox not found or it does not belong to the current user.",
    );
  }

  if (sandbox.expiresAt.getTime() <= Date.now()) {
    throw new TerminalTargetError(
      "SANDBOX_EXPIRED",
      "This sandbox has expired.",
    );
  }

  if (sandbox.status !== "running") {
    throw new TerminalTargetError(
      "SANDBOX_NOT_RUNNING",
      `Sandbox is currently '${sandbox.status}', not 'running'.`,
    );
  }

  // must label every assigned Pod with:
  //   envops.io/sandbox-id=<sandbox database ID>
  // This lets Role 4 discover the Pod without trusting a podName sent by the browser.
  const pod = await findRunningSandboxPod(sandbox.namespace, sandbox.id);

  return {
    sandboxId: sandbox.id,
    namespace: sandbox.namespace,
    podName: pod.podName,
    containerName: pod.containerName,
    shell: env.terminalShell,
  };
}
