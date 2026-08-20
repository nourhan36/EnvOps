export type SandboxStatus =
  | 'provisioning'
  | 'running'
  | 'failed'
  | 'stopped'
  | 'expired'
  | 'deleted';

export type SecurityMode = 'hardened' | 'root' | 'privileged';

export interface SandboxTemplate {
  id: string;
  name: string;
  displayName: string;
  description?: string | null;
  dockerImage: string;
  defaultLimits: Record<string, string>;
  defaultTtlMinutes: number;
  securityMode: SecurityMode;
  command?: string[] | null;
  args?: string[] | null;
  isActive: boolean;
  createdAt: string;
}

export interface SandboxResourceLimits {
  cpu: string;
  memory: string;
}

export interface SandboxCreateOptions {
  resources?: Partial<SandboxResourceLimits>;
  ttlMinutes?: number;
}

export interface Sandbox {
  id: string;
  userId: string;
  templateId: string | null;
  /** Resolved template; null for prompt-created (dynamic image) sandboxes. */
  template: SandboxTemplate | null;
  /** Actual container image: template image, or the LLM-extracted image for prompt-created sandboxes. */
  dockerImage?: string | null;
  /** Effective security posture applied at provision time. */
  securityMode?: SecurityMode;
  namespace: string;
  status: SandboxStatus;
  resourceLimits?: Record<string, string> | null;
  ttlMinutes?: number | null;
  createdAt: string;
  expiresAt: string;
  deletedAt?: string | null;
}

export interface SandboxMutationResponse {
  message: string;
  sandbox: Sandbox;
}

export interface DashboardStats {
  totalSandboxes: number;
  provisioningSandboxes: number;
  runningSandboxes: number;
  failedSandboxes: number;
  totalTemplates: number;
}

export interface AIInsight {
  id: string;
  timestamp: string;
  type: 'info' | 'warning' | 'suggestion' | 'error';
  message: string;
  command?: string;
}

export interface AIErrorDetected {
  sandboxId: string;
  command: string;
  stderrPreview: string;
  signature?: string;
  detectedAt: string;
}

export interface ExplainErrorRequest {
  command?: string;
  stderr?: string;
  environmentType?: string;
}

export interface ExplainErrorAvailable {
  status: 'available';
  explanation: string;
  suggestedFix: string;
  model: string;
  generatedAt: string;
}

export interface ExplainErrorUnavailable {
  status: 'unavailable';
  reason: string;
  retryable: boolean;
}

export type ExplainErrorResponse = ExplainErrorAvailable | ExplainErrorUnavailable;
