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
        kc.loadFromDefault();
    } catch {
        throw new Error('No Kubernetes kubeconfig was found. Set up kubeconfig or use the emulator target.');
    }

    if (!kc.getCurrentCluster()) {
        throw new Error('No Kubernetes cluster is configured. Set up kubeconfig or use the emulator target.');
    }
}

const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);

export interface ProvisionRequest {
    dockerImage: string;
    limits: {
        cpu: string;
        memory: string;
    };
    /** Relaxes the security context (root + privileged) for runtime images like Docker-in-Docker or k3s. */
    privileged?: boolean;
    /** Optional pod command that replaces the default "sleep infinity" (e.g. to start dockerd). */
    command?: string[];
    /** Optional pod args passed to the image entrypoint (e.g. k3s server args). */
    args?: string[];
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
export function buildSecurityContext(privileged: boolean) {
    if (privileged) {
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

    const privileged = request.privileged === true;
    const command = request.command ?? ["/bin/sh", "-c", "sleep infinity"];

    console.log(`Provisioning sandbox -> Image: ${request.dockerImage}, Limits: ${JSON.stringify(request.limits)}, Privileged: ${privileged}`);

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
                        resources: {
                            requests: { cpu: '100m', memory: '128Mi' },
                            limits: {
                                cpu: request.limits.cpu,
                                memory: request.limits.memory
                            }
                        },
                        securityContext: buildSecurityContext(privileged)
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

        let isReady = false;
        const pollIntervalMs = 2_000;
        const maxAttempts = Math.ceil(env.kubernetesProvisionTimeoutMs / pollIntervalMs);
        let attempts = 0;

        while (!isReady && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

            const podResponse = await coreV1Api.readNamespacedPodStatus({
                name: podName,
                namespace: namespaceName
            });

            const phase = podResponse.status?.phase || (podResponse as any).body?.status?.phase;

            if (phase === 'Running') {
                isReady = true;
            }
            attempts++;
        }

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