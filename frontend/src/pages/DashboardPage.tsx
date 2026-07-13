import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import SandboxCard from '@/components/dashboard/SandboxCard';
import type { Sandbox } from '@/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const MOCK_SANDBOXES: Sandbox[] = [
  {
    id: 'sb-001',
    name: 'k8s-lab-alpha',
    imageType: 'kubernetes:1.29',
    status: 'active',
    expiresAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
    createdAt: new Date(Date.now() - 1_800_000).toISOString(),
    region: 'us-east-1',
  },
  {
    id: 'sb-002',
    name: 'terraform-sandbox',
    imageType: 'hashicorp/terraform:1.7',
    status: 'idle',
    expiresAt: new Date(Date.now() + 45 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    region: 'eu-west-1',
  },
  {
    id: 'sb-003',
    name: 'docker-compose-lab',
    imageType: 'docker:dind',
    status: 'provisioning',
    expiresAt: new Date(Date.now() + 4 * 3_600_000).toISOString(),
    createdAt: new Date().toISOString(),
    region: 'us-west-2',
  },
];

export default function DashboardPage() {
  const [sandboxes, setSandboxes] = useState<Sandbox[]>(MOCK_SANDBOXES);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSandboxes = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/sandboxes`);
      if (response.ok) {
        const data: Sandbox[] = await response.json();
        setSandboxes(data);
      }
    } catch {
      setSandboxes(MOCK_SANDBOXES);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSandboxes();
  }, [fetchSandboxes]);

  const handleReclaim = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/sandboxes/${id}/reclaim`, { method: 'POST' });
      setSandboxes((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: 'active' as const } : s)),
      );
    } catch {
      setSandboxes((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: 'active' as const } : s)),
      );
    }
  };

  const handleTerminate = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/sandboxes/${id}/terminate`, { method: 'POST' });
      setSandboxes((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: 'terminated' as const } : s)),
      );
    } catch {
      setSandboxes((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: 'terminated' as const } : s)),
      );
    }
  };

  const activeCount = sandboxes.filter((s) => s.status === 'active').length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-6 py-5">
        <div>
          <h1 className="text-xl font-semibold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Warm-Pool orchestration · {activeCount} active sandbox{activeCount !== 1 ? 'es' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={fetchSandboxes}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-surface-overlay"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            New Sandbox
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sandboxes.map((sandbox) => (
            <SandboxCard
              key={sandbox.id}
              sandbox={sandbox}
              onReclaim={handleReclaim}
              onTerminate={handleTerminate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
