export interface ProvisionRequest {
    dockerImage: string;
    limits: {
        cpu: string;
        memory: string;
    };
}

export interface ProvisionResult {
    namespace: string;
    status: string;
}

export async function provisionSandbox(
    request: ProvisionRequest
): Promise<ProvisionResult> {

    console.log("Provisioning sandbox with:");
    console.log("Image:", request.dockerImage);
    console.log("Limits:", request.limits);

    // TODO: Later this will call Kubernetes API:
    // 1. Create Namespace
    // 2. Create Pod using dockerImage
    // 3. Apply resource limits
    // 4. Create Service

    const namespace = `sandbox-${Date.now()}`;

    return {
        namespace,
        status: "provisioning"
    };
}