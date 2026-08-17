import { useEffect, useState } from 'react';
import { ChevronLeft, Loader2, ShieldAlert, X } from 'lucide-react';
import type { SandboxTemplate } from '@/types';
import { api } from '@/lib/api';

interface NewSandboxModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (sandboxId: string) => void;
}

const CPU_OPTIONS = ['100m', '250m', '500m', '1', '2', '4'];
const MEMORY_OPTIONS = ['128Mi', '256Mi', '512Mi', '1Gi', '2Gi', '4Gi', '8Gi'];
const TTL_OPTIONS = [30, 60, 90, 120, 180, 240];

function withDefault(options: string[], value: string | undefined): string[] {
  if (value && !options.includes(value)) {
    return [...options, value];
  }
  return options;
}

export default function NewSandboxModal({ open, onClose, onCreated }: NewSandboxModalProps) {
  const [templates, setTemplates] = useState<SandboxTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SandboxTemplate | null>(null);
  const [cpu, setCpu] = useState('500m');
  const [memory, setMemory] = useState('256Mi');
  const [ttlMinutes, setTtlMinutes] = useState(60);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setSelected(null);
    setIsLoading(true);

    api
      .getTemplates()
      .then((data) => setTemplates(data.filter((template) => template.isActive)))
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [open]);

  if (!open) return null;

  const selectTemplate = (template: SandboxTemplate) => {
    setSelected(template);
    setCpu(template.defaultLimits.cpu ?? '500m');
    setMemory(template.defaultLimits.memory ?? '256Mi');
    setTtlMinutes(template.defaultTtlMinutes);
    setError(null);
  };

  const handleCreate = async () => {
    if (!selected) return;

    setIsCreating(true);
    setError(null);
    try {
      const { sandbox } = await api.createSandbox(selected.id, {
        resources: { cpu, memory },
        ttlMinutes,
      });
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
            <h2 className="text-lg font-semibold text-white">
              {selected ? 'Customize Sandbox' : 'Create a Sandbox'}
            </h2>
            <p className="text-sm text-gray-500">
              {selected
                ? `Configure resources for ${selected.displayName}`
                : 'Pick an image to provision an isolated environment'}
            </p>
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
          ) : error && !selected ? (
            <p className="rounded-lg border border-status-danger/30 bg-status-danger/10 p-4 text-sm text-status-danger">
              {error}
            </p>
          ) : templates.length === 0 && !selected ? (
            <p className="py-10 text-center text-sm text-gray-500">
              No templates available. Seed the backend to create one.
            </p>
          ) : !selected ? (
            <div className="space-y-3">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => selectTemplate(template)}
                  className="w-full rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-accent/40 hover:bg-surface-overlay"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-white">{template.displayName}</h3>
                      <p className="mt-0.5 font-mono text-xs text-gray-500">{template.dockerImage}</p>
                      {template.description && (
                        <p className="mt-2 text-sm text-gray-400">{template.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="rounded-full border border-border px-2.5 py-0.5 font-mono text-xs text-gray-400">
                        {template.defaultTtlMinutes}m TTL
                      </span>
                      {template.privileged && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-status-warning/40 bg-status-warning/10 px-2.5 py-0.5 text-xs font-medium text-status-warning">
                          <ShieldAlert className="h-3 w-3" />
                          Elevated
                        </span>
                      )}
                    </div>
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
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setSelected(null)}
                disabled={isCreating}
                className="inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-200"
              >
                <ChevronLeft className="h-4 w-4" />
                Choose a different image
              </button>

              <div className="rounded-xl border border-border bg-surface p-4">
                <h3 className="font-medium text-white">{selected.displayName}</h3>
                <p className="mt-0.5 font-mono text-xs text-gray-500">{selected.dockerImage}</p>
              </div>

              {selected.privileged && (
                <p className="rounded-lg border border-status-warning/40 bg-status-warning/10 p-3 text-sm text-status-warning">
                  This image runs with elevated privileges (root + privileged mode) so it can
                  host nested Docker or Kubernetes runtimes. Only use images you trust.
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-300">CPU</span>
                  <select
                    value={cpu}
                    onChange={(e) => setCpu(e.target.value)}
                    disabled={isCreating}
                    className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 font-mono text-sm text-gray-200 outline-none transition-colors focus:border-accent/50"
                    aria-label="CPU limit"
                  >
                    {withDefault(CPU_OPTIONS, cpu).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-300">Memory</span>
                  <select
                    value={memory}
                    onChange={(e) => setMemory(e.target.value)}
                    disabled={isCreating}
                    className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 font-mono text-sm text-gray-200 outline-none transition-colors focus:border-accent/50"
                    aria-label="Memory limit"
                  >
                    {withDefault(MEMORY_OPTIONS, memory).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-300">Lifetime</span>
                  <select
                    value={ttlMinutes}
                    onChange={(e) => setTtlMinutes(Number(e.target.value))}
                    disabled={isCreating}
                    className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 font-mono text-sm text-gray-200 outline-none transition-colors focus:border-accent/50"
                    aria-label="Sandbox lifetime"
                  >
                    {Array.from(new Set([...TTL_OPTIONS, ttlMinutes])).map((option) => (
                      <option key={option} value={option}>
                        {option}m
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {error && (
                <p className="rounded-lg border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Provisioning in Kubernetes…
                  </>
                ) : (
                  'Create Sandbox'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
