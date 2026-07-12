import { useEffect, useState } from 'react';
import { Clock, Play, Square, Trash2 } from 'lucide-react';
import type { Sandbox } from '@/types';

interface SandboxCardProps {
  sandbox: Sandbox;
  onReclaim: (id: string) => void;
  onTerminate: (id: string) => void;
}

function formatTTL(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';

  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const statusStyles = {
  active: 'bg-status-active/15 text-status-active border-status-active/30',
  idle: 'bg-gray-500/15 text-status-idle border-gray-500/30',
  provisioning: 'bg-status-warning/15 text-status-warning border-status-warning/30',
  terminated: 'bg-status-danger/15 text-status-danger border-status-danger/30',
};

export default function SandboxCard({ sandbox, onReclaim, onTerminate }: SandboxCardProps) {
  const [ttl, setTtl] = useState(() => formatTTL(sandbox.expiresAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setTtl(formatTTL(sandbox.expiresAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [sandbox.expiresAt]);

  return (
    <article className="group rounded-xl border border-border bg-surface-raised p-5 transition-colors hover:border-accent/40 hover:bg-surface-overlay">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">{sandbox.name}</h3>
          <p className="mt-1 font-mono text-xs text-gray-500">{sandbox.imageType}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusStyles[sandbox.status]}`}
        >
          {sandbox.status}
        </span>
      </div>

      <div className="mb-5 flex items-center gap-2 text-sm text-gray-400">
        <Clock className="h-4 w-4 text-accent-hover" />
        <span>TTL:</span>
        <span className="font-mono text-status-active">{ttl}</span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onReclaim(sandbox.id)}
          disabled={sandbox.status === 'terminated'}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-accent/50 hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Play className="h-3.5 w-3.5" />
          Reclaim
        </button>
        <button
          type="button"
          onClick={() => onTerminate(sandbox.id)}
          disabled={sandbox.status === 'terminated'}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm font-medium text-status-danger transition-colors hover:bg-status-danger/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Square className="h-3.5 w-3.5" />
          Terminate
        </button>
        <button
          type="button"
          onClick={() => onTerminate(sandbox.id)}
          disabled={sandbox.status === 'terminated'}
          className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-gray-400 transition-colors hover:border-status-danger/30 hover:text-status-danger disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Delete sandbox"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}
