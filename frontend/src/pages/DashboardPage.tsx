import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import SandboxCard from '@/components/dashboard/SandboxCard';
import NewSandboxModal from '@/components/dashboard/NewSandboxModal';
import type { DashboardStats, Sandbox } from '@/types';
import { api } from '@/lib/api';

const EMPTY_STATS: DashboardStats = {
  totalSandboxes: 0,
  provisioningSandboxes: 0,
  runningSandboxes: 0,
  failedSandboxes: 0,
  totalTemplates: 0,
};


export default function DashboardPage() {
  const navigate = useNavigate();
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [sandboxesData, statsData] = await Promise.all([
        api.getSandboxes(),
        api.getDashboardStats(),
      ]);
      setSandboxes(sandboxesData);
      setStats(statsData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const handleCreated = (sandboxId: string) => {
    setIsModalOpen(false);
    void fetchDashboard();
    navigate(`/sandbox/${sandboxId}`);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.deleteSandbox(id);
      setSandboxes((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  const runningCount = sandboxes.filter(
    (s) => s.status === 'running' && new Date(s.expiresAt).getTime() > Date.now(),
  ).length;

  const statCards = [
    { label: 'Total Sandboxes', value: stats.totalSandboxes, color: 'text-white' },
    { label: 'Running', value: stats.runningSandboxes, color: 'text-status-active' },
    {
      label: 'Provisioning',
      value: stats.provisioningSandboxes,
      color: 'text-status-warning',
    },
    { label: 'Failed', value: stats.failedSandboxes, color: 'text-status-danger' },
    { label: 'Templates', value: stats.totalTemplates, color: 'text-accent-hover' },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-6 py-5">
        <div>
          <h1 className="text-xl font-semibold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sandbox orchestration · {runningCount} running sandbox
            {runningCount !== 1 ? 'es' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={fetchDashboard}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-surface-overlay"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            New Sandbox
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {statCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-border bg-surface-raised p-4">
              <p className="text-xs text-gray-500">{card.label}</p>
              <p className={`mt-1 font-mono text-2xl font-semibold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-status-danger/30 bg-status-danger/10 p-4 text-sm text-status-danger">
            {error}
          </div>
        )}

        {isLoading ? (
          <p className="py-16 text-center text-sm text-gray-500">Loading sandboxes…</p>
        ) : sandboxes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center">
            <p className="text-sm text-gray-400">No sandboxes yet.</p>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <Plus className="h-4 w-4" />
              Create your first sandbox
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sandboxes.map((sandbox) => (
              <SandboxCard
                key={sandbox.id}
                sandbox={sandbox}
                onConnect={(id) => navigate(`/sandbox/${id}`)}
                onDelete={handleDelete}
                isDeleting={deletingId === sandbox.id}
              />
            ))}
          </div>
        )}
      </div>

      <NewSandboxModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
