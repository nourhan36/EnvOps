import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { SandboxTemplate } from '@/types';
import { api } from '@/lib/api';

interface NewSandboxModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (sandboxId: string) => void;
}

export default function NewSandboxModal({ open, onClose, onCreated }: NewSandboxModalProps) {
  const [templates, setTemplates] = useState<SandboxTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setSelectedId(null);
    setIsLoading(true);

    api
      .getTemplates()
      .then((data) => setTemplates(data.filter((template) => template.isActive)))
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [open]);

  if (!open) return null;

  const handleCreate = async (templateId: string) => {
    setIsCreating(true);
    setError(null);
    try {
      const { sandbox } = await api.createSandbox(templateId);
      onCreated(sandbox.id);
    } catch (err) {
      setError((err as Error).message);
      setIsCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Create a new sandbox"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Create a Sandbox</h2>
            <p className="text-sm text-gray-500">Pick a template to provision an isolated environment</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isCreating}
            className="rounded p-1 text-gray-400 hover:bg-surface-overlay hover:text-gray-200"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading templates…
            </div>
          ) : error ? (
            <p className="rounded-lg border border-status-danger/30 bg-status-danger/10 p-4 text-sm text-status-danger">
              {error}
            </p>
          ) : templates.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">
              No templates available. Seed the backend to create one.
            </p>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => {
                const isSelected = selectedId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    disabled={isCreating}
                    onClick={() => {
                      setSelectedId(template.id);
                      void handleCreate(template.id);
                    }}
                    className={`w-full rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      isSelected
                        ? 'border-accent/60 bg-accent-muted/30'
                        : 'border-border bg-surface hover:border-accent/40 hover:bg-surface-overlay'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-white">{template.displayName}</h3>
                        <p className="mt-0.5 font-mono text-xs text-gray-500">{template.dockerImage}</p>
                        {template.description && (
                          <p className="mt-2 text-sm text-gray-400">{template.description}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 font-mono text-xs text-gray-400">
                        {template.defaultTtlMinutes}m TTL
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                      <span className="rounded-md bg-surface px-2 py-1 font-mono">
                        CPU {template.defaultLimits.cpu}
                      </span>
                      <span className="rounded-md bg-surface px-2 py-1 font-mono">
                        Mem {template.defaultLimits.memory}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {isCreating && (
            <div className="mt-4 flex items-center gap-2 text-sm text-accent-hover">
              <Loader2 className="h-4 w-4 animate-spin" />
              Provisioning sandbox in Kubernetes…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
