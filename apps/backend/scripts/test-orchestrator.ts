import { provisionSandbox, cleanupSandbox } from '../src/services/orchestrator.service';

async function executeTest() {
    console.log("Starting K8s Orchestrator Test...");
    let testNamespace = "";

    try {
        // 1. Test Provisioning & Polling
        const start = Date.now();
        const result = await provisionSandbox({
            dockerImage: 'alpine:latest',
            limits: { cpu: '200m', memory: '256Mi' }
        });
        
        testNamespace = result.namespace;
        const duration = (Date.now() - start) / 1000;
        
        console.log(`✅ Provisioning Success!`);
        console.log(`Namespace: ${result.namespace}`);
        console.log(`Status: ${result.status}`);
        console.log(`Time to Running: ${duration}s`);

        // 2. Simulate Active Session
        console.log("\nHolding for 10 seconds to simulate a live terminal session...");
        await new Promise(resolve => setTimeout(resolve, 10000));

    } catch (error) {
        console.error("\n❌ Test failed during provisioning phase:", error);
    } finally {
        // 3. Test Garbage Collection
        if (testNamespace) {
            console.log(`\nTriggering garbage collection for ${testNamespace}...`);
            try {
                await cleanupSandbox(testNamespace);
                console.log("✅ Cleanup complete. EKS resources destroyed.");
            } catch (cleanupError) {
                console.error("❌ Cleanup failed:", cleanupError);
            }
        }
    }
}

executeTest();