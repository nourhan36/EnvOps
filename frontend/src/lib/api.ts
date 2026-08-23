import type {
  DashboardStats,
  ExplainErrorRequest,
  ExplainErrorResponse,
  Sandbox,
  SandboxCreateOptions,
  SandboxMutationResponse,
  SandboxTemplate,
} from '@/types';


const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    });
  } catch {
    throw new ApiError('Unable to reach the EnvOps backend.', 0);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body?.message) message = body.message;
    } catch {
      // ignore body parsing failures
    }
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getHealth: () => request<{ status: string }>('/health'),
  getTemplates: () => request<SandboxTemplate[]>('/templates'),
  getSandboxes: () => request<Sandbox[]>('/sandboxes'),
  getSandbox: (id: string) => request<Sandbox>(`/sandboxes/${id}`),
  createSandbox: (templateId: string, options?: SandboxCreateOptions) =>
    request<SandboxMutationResponse>('/sandboxes', {
      method: 'POST',
      body: JSON.stringify({ templateId, ...options }),
    }),
  createSandboxFromPrompt: (prompt: string) =>
    request<SandboxMutationResponse>('/sandboxes/from-prompt', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  deleteSandbox: (id: string) =>
    request<SandboxMutationResponse>(`/sandboxes/${id}`, { method: 'DELETE' }),
  getDashboardStats: () => request<DashboardStats>('/dashboard'),
  explainError: (sandboxId: string, body?: ExplainErrorRequest) =>
    request<ExplainErrorResponse>(`/sandboxes/${sandboxId}/explain-error`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
};
