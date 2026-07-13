export type SandboxStatus = 'active' | 'idle' | 'provisioning' | 'terminated';

export interface Sandbox {
  id: string;
  name: string;
  imageType: string;
  status: SandboxStatus;
  expiresAt: string;
  createdAt: string;
  region?: string;
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
