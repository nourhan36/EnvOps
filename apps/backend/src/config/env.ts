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

export const env = {
  port: readPositiveInteger("PORT", 3000),
  allowedOrigins: readCsv("APP_ORIGINS", [
    "http://localhost:5173",
    "http://localhost:3000",
  ]),
  kubectlBin: process.env.KUBECTL_BIN?.trim() || "kubectl",
  kubectlContext: process.env.KUBECTL_CONTEXT?.trim() || undefined,
  sandboxPodLabelKey:
    process.env.SANDBOX_POD_LABEL_KEY?.trim() || "envops.io/sandbox-id",
  terminalShell: process.env.TERMINAL_SHELL?.trim() || "/bin/sh",
  terminalDefaultCols: readPositiveInteger("TERMINAL_DEFAULT_COLS", 100),
  terminalDefaultRows: readPositiveInteger("TERMINAL_DEFAULT_ROWS", 30),
  terminalMaxInputBytes: readPositiveInteger(
    "TERMINAL_MAX_INPUT_BYTES",
    65_536,
  ),

  // remove this once real authentication is connected.
  demoUserEmail:
    process.env.DEMO_USER_EMAIL?.trim() || "demo@envops.local",
};
