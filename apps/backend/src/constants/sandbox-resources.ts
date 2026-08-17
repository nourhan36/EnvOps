/**
 * Platform-wide bounds and parsing helpers for per-sandbox resource
 * customization. These enforce anti-abuse ceilings regardless of what the
 * client sends, so a user can never over-provision CPU, memory or TTL.
 */

export interface SandboxResourceLimits {
  cpu: string;
  memory: string;
}

export const RESOURCE_BOUNDS = {
  cpu: {
    // millicores
    min: 100,
    max: 4000,
  },
  memory: {
    // bytes
    min: 128 * 1024 * 1024, // 128Mi
    max: 8 * 1024 * 1024 * 1024, // 8Gi
  },
  ttlMinutes: {
    min: 5,
    max: 1440,
  },
} as const;

/**
 * Matches Kubernetes-style CPU quantities: whole cores (1, 0.5, 2.000) or
 * integer milli-units (500m). Decimal milli-units (e.g. 1.5m) are invalid in
 * Kubernetes. Rejects arbitrary strings to avoid injection of malformed
 * resource values into the pod spec.
 */
export const CPU_QUANTITY_PATTERN = /^(?:\d+m|\d+(?:\.\d{1,3})?)$/;

/**
 * Matches Kubernetes-style memory quantities: bytes (1048576), binary
 * suffixes (Ki, Mi, Gi, Ti) or SI suffixes (k, M, G, T).
 */
export const MEMORY_QUANTITY_PATTERN = /^\d+(?:\.\d+)?(?:Ki|Mi|Gi|Ti|k|M|G|T)?$/;

export function isCpuQuantity(value: string): boolean {
  return CPU_QUANTITY_PATTERN.test(value);
}

export function isMemoryQuantity(value: string): boolean {
  return MEMORY_QUANTITY_PATTERN.test(value);
}

/** Converts a CPU quantity into millicores, or null when the format is invalid. */
export function cpuToMillicores(value: string): number | null {
  if (!isCpuQuantity(value)) {
    return null;
  }

  if (value.endsWith("m")) {
    const millis = Number.parseInt(value.slice(0, -1), 10);
    return Number.isFinite(millis) ? millis : null;
  }

  const cores = Number.parseFloat(value);
  return Number.isFinite(cores) ? Math.round(cores * 1000) : null;
}

/** Converts a memory quantity into bytes, or null when the format is invalid. */
export function memoryToBytes(value: string): number | null {
  if (!isMemoryQuantity(value)) {
    return null;
  }

  const match = value.match(/^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|k|M|G|T)?$/);
  if (!match) {
    return null;
  }

  const number = Number.parseFloat(match[1]);
  if (!Number.isFinite(number)) {
    return null;
  }

  const suffix = match[2] ?? "";
  const multipliers: Record<string, number> = {
    "": 1,
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    k: 1_000,
    M: 1_000 ** 2,
    G: 1_000 ** 3,
    T: 1_000 ** 4,
  };

  return Math.round(number * multipliers[suffix]);
}

/** Formats millicores back into a Kubernetes CPU quantity. */
export function millicoresToCpu(millicores: number): string {
  if (millicores % 1000 === 0) {
    return `${millicores / 1000}`;
  }
  return `${millicores}m`;
}

/** Formats bytes back into a human-readable Kubernetes memory quantity (Mi). */
export function bytesToMemory(bytes: number): string {
  return `${Math.round(bytes / (1024 ** 2))}Mi`;
}

function clampMillicores(millicores: number): number {
  return Math.min(
    Math.max(millicores, RESOURCE_BOUNDS.cpu.min),
    RESOURCE_BOUNDS.cpu.max,
  );
}

function clampBytes(bytes: number): number {
  return Math.min(
    Math.max(bytes, RESOURCE_BOUNDS.memory.min),
    RESOURCE_BOUNDS.memory.max,
  );
}

/** Clamps a requested CPU quantity into the allowed range. Falls back to the default when invalid. */
export function clampCpu(requested: string | undefined, fallback: string): string {
  if (requested !== undefined) {
    const millicores = cpuToMillicores(requested);
    if (millicores !== null) {
      const clamped = clampMillicores(millicores);
      return clamped === millicores ? requested : millicoresToCpu(clamped);
    }
  }

  const fallbackMillis = cpuToMillicores(fallback);
  if (fallbackMillis === null) {
    return millicoresToCpu(RESOURCE_BOUNDS.cpu.min);
  }

  const clamped = clampMillicores(fallbackMillis);
  return clamped === fallbackMillis ? fallback : millicoresToCpu(clamped);
}

/** Clamps a requested memory quantity into the allowed range. Falls back to the default when invalid. */
export function clampMemory(requested: string | undefined, fallback: string): string {
  if (requested !== undefined) {
    const bytes = memoryToBytes(requested);
    if (bytes !== null) {
      const clamped = clampBytes(bytes);
      return clamped === bytes ? requested : bytesToMemory(clamped);
    }
  }

  const fallbackBytes = memoryToBytes(fallback);
  if (fallbackBytes === null) {
    return bytesToMemory(RESOURCE_BOUNDS.memory.min);
  }

  const clamped = clampBytes(fallbackBytes);
  return clamped === fallbackBytes ? fallback : bytesToMemory(clamped);
}

/** Clamps a requested TTL (minutes) into the allowed range. Falls back to the default when missing/invalid. */
export function clampTtlMinutes(requested: number | undefined, fallback: number): number {
  if (requested === undefined || !Number.isInteger(requested)) {
    return fallback;
  }

  return Math.min(
    Math.max(requested, RESOURCE_BOUNDS.ttlMinutes.min),
    RESOURCE_BOUNDS.ttlMinutes.max,
  );
}
