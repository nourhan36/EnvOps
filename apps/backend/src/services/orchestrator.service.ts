import * as k8s from '@kubernetes/client-node';
import * as stream from 'stream';
import { env } from '../config/env';
import { SandboxStatus } from '../constants/sandbox-status';

function buildEmulatorKubeConfig(): k8s.KubeConfig {
    const kc = new k8s.KubeConfig();
    const clusterName = 'envops-emulator';
    const userName = 'envops-emulator';

    kc.addCluster({
        name: clusterName,
        server: env.kubernetesEmulatorServer,
        skipTLSVerify: true,
    });

    // The Floci EKS emulator authenticates with the same k8s-aws-v1 bearer
    // tokens the real EKS API does. Reuse the exec/authProvider user from the
    // default kubeconfig so requests carry a valid token.
    const defaultKc = new k8s.KubeConfig();
    try {
        defaultKc.loadFromDefault();
    } catch {
        // No default kubeconfig available - fall through to the AWS CLI fallback.
    }

    const execUser = defaultKc
        .getUsers()
        .find((user) => user.exec || user.authProvider?.config?.exec);

    if (execUser?.exec) {
        kc.addUser({ name: userName, exec: execUser.exec });
    } else if (execUser?.authProvider) {
        kc.addUser({ name: userName, authProvider: execUser.authProvider });
    } else {
        kc.addUser({
            name: userName,
            exec: {
                apiVersion: 'client.authentication.k8s.io/v1beta1',
                command: 'aws',
                args: [
                    'eks',
                    'get-token',
                    '--region',
                    env.kubernetesEmulatorAwsRegion,
                    '--cluster-name',
                    env.kubernetesEmulatorAwsClusterName,
                    '--output',
                    'json',
                ],
            },
        });
    }

    kc.addContext({
        name: clusterName,
        cluster: clusterName,
        user: userName,
        namespace: 'default',
    });
    kc.setCurrentContext(clusterName);

    return kc;
}

let kc: k8s.KubeConfig;

if (env.kubernetesTarget === 'emulator') {
    kc = buildEmulatorKubeConfig();
} else {
    kc = new k8s.KubeConfig();

    try {
        kc.loadFromCluster();
    } catch {
        throw new Error(
            'Could not load in-cluster Kubernetes configuration.'
        );
    }

    if (!kc.getCurrentCluster()) {
        throw new Error(
            'No Kubernetes cluster is configured.'
        );
    }
}
const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);

export type SecurityMode = 'hardened' | 'root' | 'privileged';

export interface ProvisionRequest {
    dockerImage: string;
    limits: {
        cpu: string;
        memory: string;
    };
    /** Security posture for the pod: hardened (default), root, or privileged. */
    securityMode?: SecurityMode;
    /** Optional pod command that replaces the default "sleep infinity" (e.g. to start dockerd). */
    command?: string[];
    /** Optional pod args passed to the image entrypoint (e.g. k3s server args). */
    args?: string[];
    /** Optional pod environment variables required by runtime entrypoints (e.g. postgres/mysql). */
    env?: { name: string; value: string }[];
}

export interface AttachTerminalRequest {
    namespace: string;
    stdout: stream.Writable;
    stderr: stream.Writable;
    stdin: stream.Readable;
}

export interface ProvisionResult {
    namespace: string;
    status: string;
}

/** @internal exported for testing */
export function buildSecurityContext(mode: SecurityMode = 'hardened') {
    if (mode === 'privileged') {
        // Trusted runtime templates only. Docker-in-Docker and k3s require root
        // and privileged access (device cgroups, mounts). This intentionally
        // bypasses the hardened sandbox context - never enable it on arbitrary
        // or user-controlled images.
        return {
            runAsUser: 0,
            runAsNonRoot: false,
            privileged: true,
            allowPrivilegeEscalation: true,
        };
    }

    if (mode === 'root') {
        // Runs as root but NOT privileged: enough for apt-get or database
        // entrypoints that need to write system directories, without host
        // device/cgroup access.
        return {
            runAsUser: 0,
            runAsNonRoot: false,
            privileged: false,
            allowPrivilegeEscalation: true,
        };
    }

    // Hardened default: non-root, no privilege escalation, no capabilities.
    return {
        runAsNonRoot: true,
        runAsUser: 1000,
        allowPrivilegeEscalation: false,
        capabilities: { drop: ['ALL'] }
    };
}

export async function provisionSandbox(
    request: ProvisionRequest
): Promise<ProvisionResult> {

    const mode = request.securityMode ?? 'hardened';
    const command = request.command ?? ["/bin/sh", "-c", "sleep infinity"];

    console.log(`Provisioning sandbox -> Image: ${request.dockerImage}, Limits: ${JSON.stringify(request.limits)}, Security: ${mode}`);

    const namespaceName = `sandbox-${Date.now()}`;
    const podName = 'sandbox-terminal';

    try {
        await coreV1Api.createNamespace({
            body: {
                metadata: { name: namespaceName }
            }
        });

        await coreV1Api.createNamespacedPod({
            namespace: namespaceName,
            body: {
                metadata: {
                    name: podName,
                    labels: { app: 'sandbox' }
                },
                spec: {
                    containers: [{
                        name: 'sandbox-container',
                        image: request.dockerImage,
                        command: command,
                        ...(request.args ? { args: request.args } : {}),
                        ...(request.env ? { env: request.env } : {}),
                        resources: {
                            requests: { cpu: '100m', memory: '128Mi' },
                            limits: {
                                cpu: request.limits.cpu,
                                memory: request.limits.memory
                            }
                        },
                        securityContext: buildSecurityContext(mode)
                    }],
                    restartPolicy: 'Never'
                }
            }
        });

        await coreV1Api.createNamespacedService({
            namespace: namespaceName,
            body: {
                metadata: { name: 'sandbox-service' },
                spec: {
                    selector: { app: 'sandbox' },
                    ports: [{ port: 80, targetPort: 80 }]
                }
            }
        });

        const isReady = await waitForPodRunning(namespaceName, podName, request.dockerImage);

        if (!isReady) {
            throw new Error("Pod failed to reach Running state within timeout.");
        }

        return {
            namespace: namespaceName,
            status: SandboxStatus.RUNNING
        };

    } catch (error) {
        console.error(`Failed to provision sandbox in ${namespaceName}:`, error);

        await coreV1Api.deleteNamespace({ name: namespaceName }).catch(() => console.log("Cleanup failed"));

        throw error;
    }
}

/**
 * Polls a sandbox pod until it reaches Running. Fails fast with a descriptive
 * reason when the pod enters a terminal failure state (image pull failure,
 * invalid image, crash loop, or unschedulable), so callers get a real
 * diagnosis instead of waiting out the full timeout. A slow cold pull keeps
 * the pod in ContainerCreating and is allowed to continue.
 */
async function waitForPodRunning(
    namespace: string,
    podName: string,
    image: string,
): Promise<boolean> {
    const pollIntervalMs = 2_000;
    const maxAttempts = Math.ceil(env.kubernetesProvisionTimeoutMs / pollIntervalMs);
    let attempts = 0;
    let lastPhase: string | undefined;
    let lastFailure: string | undefined;

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        attempts++;

        let podStatus: k8s.V1PodStatus | undefined;
        try {
            const podResponse = await coreV1Api.readNamespacedPodStatus({
                name: podName,
                namespace: namespace
            });
            podStatus = (podResponse as any).body?.status ?? (podResponse as any).status;
        } catch (error: any) {
            // A 404 means the pod is gone; anything else is a transient read
            // failure worth retrying until the timeout.
            if (error?.code === 404 || error?.statusCode === 404) {
                throw new Error(`Pod ${podName} disappeared before it became ready.`);
            }
            console.warn(`Transient error reading pod status in ${namespace}:`, error?.message ?? error);
            continue;
        }

        const diagnostic = diagnosePodStatus(podStatus);
        lastPhase = diagnostic.phase;
        lastFailure = diagnostic.failure
            ? `${diagnostic.failure.reason} - ${diagnostic.failure.message}`
            : undefined;

        if (diagnostic.phase === 'Running') {
            return true;
        }

        if (diagnostic.failure) {
            throw new Error(`Provisioning failed for image ${image}: ${diagnostic.failure.reason} - ${diagnostic.failure.message}`);
        }
    }

    throw new Error(
        `Pod failed to reach Running state within ${env.kubernetesProvisionTimeoutMs}ms. ` +
        (lastFailure ? `Last status: ${lastFailure}.` : `Last phase: ${lastPhase ?? "unknown"}.`),
    );
}

export interface PodFailure {
    reason: string;
    message: string;
}

export interface PodDiagnostic {
    phase: string | undefined;
    failure?: PodFailure;
}

/**
 * Terminal container waiting reasons that will never recover on their own.
 * ImagePullBackOff is deliberately excluded from the always-terminal set: the
 * kubelet backoff can be a transient Docker Hub rate limit, which does recover.
 */
const TERMINAL_WAITING_REASONS = new Set([
    'ErrImagePull',
    'InvalidImageName',
    'CreateContainerConfigError',
    'CreateContainerError',
    'RunContainerError',
    'CrashLoopBackOff',
]);

function isRateLimitMessage(message: string | undefined): boolean {
    if (!message) {
        return false;
    }
    const lower = message.toLowerCase();
    return lower.includes('toomanyrequests') || lower.includes('rate limit') || lower.includes('denied');
}

/** @internal exported for testing */
export function diagnosePodStatus(status: k8s.V1PodStatus | undefined): PodDiagnostic {
    const phase = status?.phase;

    if (phase === 'Failed' || phase === 'Succeeded') {
        const terminated =
            status?.containerStatuses?.[0]?.state?.terminated ??
            status?.containerStatuses?.[0]?.lastState?.terminated;
        return {
            phase,
            failure: {
                reason: `Pod${phase}`,
                message: terminated?.message ?? terminated?.reason ?? `pod ${phase.toLowerCase()}`,
            },
        };
    }

    const unschedulable = status?.conditions?.find(
        (condition) =>
            condition.type === 'PodScheduled' &&
            condition.status === 'False' &&
            condition.reason === 'Unschedulable',
    );
    if (unschedulable) {
        return {
            phase,
            failure: {
                reason: 'Unschedulable',
                message: unschedulable.message ?? 'the pod could not be scheduled to any node',
            },
        };
    }

    for (const container of status?.containerStatuses ?? []) {
        const waiting = container.state?.waiting;
        if (waiting?.reason && TERMINAL_WAITING_REASONS.has(waiting.reason)) {
            return {
                phase,
                failure: {
                    reason: waiting.reason,
                    message: waiting.message ?? `container ${container.name} is stuck in ${waiting.reason}`,
                },
            };
        }

        // ImagePullBackOff only fails fast when it is not a transient rate limit.
        if (waiting?.reason === 'ImagePullBackOff' && !isRateLimitMessage(waiting.message)) {
            return {
                phase,
                failure: {
                    reason: 'ImagePullBackOff',
                    message: waiting.message ?? `image pull for ${container.name} is failing`,
                },
            };
        }

        // A crash-looping container that has restarted should not block silently.
        if ((container.restartCount ?? 0) > 0 && container.lastState?.terminated) {
            const terminated = container.lastState.terminated;
            return {
                phase,
                failure: {
                    reason: 'CrashLoopBackOff',
                    message: `container ${container.name} restarted ${container.restartCount} time(s): ` +
                        (terminated.message ?? terminated.reason ?? 'unknown reason'),
                },
            };
        }
    }

    return { phase };
}

export async function cleanupSandbox(namespace: string): Promise<void> {
    console.log(`Executing garbage collection for namespace: ${namespace}`);

    try {
        await coreV1Api.deleteNamespace({
            name: namespace
        });

        console.log(`Garbage collection triggered successfully for: ${namespace}`);
    } catch (error: any) {
        if (error.code === 404) {
            console.log(`Namespace ${namespace} not found. Assuming already cleaned up.`);
            return;
        }

        console.error(`Critical: Failed to delete namespace ${namespace}:`, error);
        throw new Error(`Garbage collection failed for ${namespace}`);
    }
}

export async function attachTerminal(
    request: AttachTerminalRequest
): Promise<any> {

    console.log(`Attaching terminal to namespace: ${request.namespace}`);

    const podName = 'sandbox-terminal';
    const containerName = 'sandbox-container';

    const exec = new k8s.Exec(kc);

    try {
        const connection = await exec.exec(
            request.namespace,
            podName,
            containerName,
            ['/bin/sh'],
            request.stdout,
            request.stderr,
            request.stdin,
            true,
            (status: k8s.V1Status) => {
                console.log(`Terminal session closed for ${request.namespace}. Status: ${status.status}`);
            }
        );

        return connection;

    } catch (error) {
        console.error(`Critical: Failed to attach terminal for ${request.namespace}:`, error);
        throw new Error('Terminal connection to the sandbox failed.');
    }
}

export async function deleteSandboxResources(namespace: string): Promise<void> {
    console.log(`Executing sandbox resource deletion for namespace: ${namespace}`);
    try {
        await coreV1Api.deleteNamespace({ name: namespace });
        console.log(`Successfully deleted sandbox resources (namespace & pods) for: ${namespace}`);
    } catch (error: any) {
        if (error.code === 404) {
            console.log(`Namespace ${namespace} not found. Assuming already deleted.`);
            return;
        }
        console.error(`Critical: Failed to delete namespace ${namespace}:`, error);
        throw new Error(`Failed to delete sandbox resources for ${namespace}`);
    }
}