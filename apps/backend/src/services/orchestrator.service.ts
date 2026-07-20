import * as k8s from '@kubernetes/client-node';
import * as stream from 'stream';
import { env } from '../config/env';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const currentCluster = kc.getCurrentCluster();

if (env.kubernetesTarget === 'emulator' && currentCluster) {
    const localEmulatorCluster: k8s.Cluster = {
        ...currentCluster,
        server: env.kubernetesEmulatorServer,
        skipTLSVerify: true,
    };

    kc.clusters = kc.clusters.filter(c => c.name !== currentCluster.name);
    kc.clusters.push(localEmulatorCluster);
}

if (!currentCluster) {
    throw new Error('No Kubernetes cluster is configured. Set up kubeconfig or use the emulator target.');
}

const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);

export interface ProvisionRequest {
    dockerImage: string;
    limits: {
        cpu: string;
        memory: string;
    };
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

export async function provisionSandbox(
    request: ProvisionRequest
): Promise<ProvisionResult> {
    
    console.log(`Provisioning sandbox -> Image: ${request.dockerImage}, Limits: ${JSON.stringify(request.limits)}`);

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
                        command: ["/bin/sh", "-c", "sleep infinity"],
                        resources: {
                            requests: { cpu: '100m', memory: '128Mi' },
                            limits: { 
                                cpu: request.limits.cpu, 
                                memory: request.limits.memory 
                            }
                        },
                        securityContext: {
                            runAsNonRoot: true,
                            runAsUser: 1000,
                            allowPrivilegeEscalation: false,
                            capabilities: { drop: ['ALL'] }
                        }
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
        let attempts = 0;
        
        while (!isReady && attempts < 15) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
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
            status: "running"
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
        if (error.statusCode === 404) {
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