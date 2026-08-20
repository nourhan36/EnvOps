function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function readCsv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readChoice<T extends string>(
  name: string,
  fallback: T,
  allowed: readonly T[],
): T {
  const raw = process.env[name]?.trim().toLowerCase();

  if (!raw) {
    return fallback;
  }

  if (allowed.includes(raw as T)) {
    return raw as T;
  }

  throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
}

export const env = {
  port: readPositiveInteger("PORT", 3000),
  allowedOrigins: readCsv("APP_ORIGINS", [
    "http://localhost:5173",
    "http://localhost:3000",
  ]),
  kubectlBin: process.env.KUBECTL_BIN?.trim() || "kubectl",
  kubectlContext: process.env.KUBECTL_CONTEXT?.trim() || undefined,
  kubernetesTarget: readChoice("KUBERNETES_TARGET", "emulator", [
    "emulator",
    "aws",
  ]),
  kubernetesEmulatorServer:
    process.env.KUBERNETES_EMULATOR_SERVER?.trim() || "https://127.0.0.1:6500",
  kubernetesEmulatorAwsRegion:
    process.env.KUBERNETES_EMULATOR_AWS_REGION?.trim() || "us-east-1",
  kubernetesEmulatorAwsClusterName:
    process.env.KUBERNETES_EMULATOR_AWS_CLUSTER_NAME?.trim() ||
    "envops-dev-cluster",
  kubernetesProvisionTimeoutMs: readPositiveInteger(
    "KUBERNETES_PROVISION_TIMEOUT_MS",
    300_000,
  ),
  evictionIntervalMs: readPositiveInteger("EVICTION_INTERVAL_MS", 60_000),
  sandboxPodSelector:
    process.env.SANDBOX_POD_SELECTOR?.trim() || "app=sandbox",
  terminalShell: process.env.TERMINAL_SHELL?.trim() || "/bin/sh",
  terminalDefaultCols: readPositiveInteger("TERMINAL_DEFAULT_COLS", 100),
  terminalDefaultRows: readPositiveInteger("TERMINAL_DEFAULT_ROWS", 30),
  terminalMaxInputBytes: readPositiveInteger(
    "TERMINAL_MAX_INPUT_BYTES",
    65_536,
  ),

  // AI Error Interceptor (DeepSeek via the ITI gateway).
  llmBaseUrl:
    process.env.LLM_BASE_URL?.trim() || "http://apiaccess.iti.net.eg/api/v1",
  llmModelId: process.env.LLM_MODEL_ID?.trim() || "deepseek.v3.2",
  llmApiKey: process.env.SBG_API_KEY?.trim() || "",
  llmTimeoutMs: readPositiveInteger("LLM_TIMEOUT_MS", 30_000),
  llmMaxRetries: readPositiveInteger("LLM_MAX_RETRIES", 1),
  llmMaxStderrChars: readPositiveInteger("LLM_MAX_STDERR_CHARS", 8_000),
  aiErrorCooldownMs: readPositiveInteger("AI_ERROR_COOLDOWN_MS", 5_000),
  aiErrorDebounceMs: readPositiveInteger("AI_ERROR_DEBOUNCE_MS", 500),
  aiErrorMaxCapturedChars: readPositiveInteger(
    "AI_ERROR_MAX_CAPTURED_CHARS",
    12_000,
  ),

  // remove this once real authentication is connected.
  demoUserEmail:
    process.env.DEMO_USER_EMAIL?.trim() || "demo@envops.local",
};
