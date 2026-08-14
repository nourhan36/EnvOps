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
  isActive: boolean;
  createdAt: string;
}

export interface Sandbox {
  id: string;
  userId: string;
  templateId: string;
  template: SandboxTemplate;
  namespace: string;
  status: SandboxStatus;
  resourceLimits?: Record<string, string> | null;
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
