export type SandboxStatus =
  | 'provisioning'
  | 'running'
  | 'failed'
  | 'stopped'
  | 'expired'
  | 'deleted';

export interface SandboxTemplate {
  id: string;
  name: string;
  displayName: string;
  description?: string | null;
  dockerImage: string;
  defaultLimits: Record<string, string>;
  defaultTtlMinutes: number;
  privileged: boolean;
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
  templateId: string;
  template: SandboxTemplate;
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

export interface LabGenerationRequest {
  prompt: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  technologies?: string[];
}

export interface LabGenerationResult {
  id: string;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  title: string;
  description?: string;
  sandboxId?: string;
}
