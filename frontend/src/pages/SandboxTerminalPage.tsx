import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Container, Loader2, Wifi, WifiOff } from 'lucide-react';
import Terminal from '@/components/terminal/Terminal';
import AIPanel from '@/components/terminal/AIPanel';
import { useSocket } from '@/providers/SocketProvider';
import type { Sandbox } from '@/types';
import { api } from '@/lib/api';

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function SandboxTerminalPage() {
  const { sandboxId } = useParams<{ sandboxId: string }>();
  const navigate = useNavigate();
  const { socket, isConnected, connect, disconnect } = useSocket();
  const [sandbox, setSandbox] = useState<Sandbox | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(true);

  useEffect(() => {
    if (!sandboxId) {
      setIsLoading(false);
      return;
    }

    setSandbox(null);
    setIsLoading(true);
    setError(null);

    connect(sandboxId);

    api
      .getSandbox(sandboxId)
      .then(setSandbox)
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));

    return () => {
      disconnect();
    };
  }, [sandboxId, connect, disconnect]);

  if (!sandboxId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-gray-400">Select a sandbox to open its terminal.</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <ArrowLeft className="h-4 w-4" />
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border bg-surface-raised px-6 py-4">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-surface-overlay hover:text-gray-200"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Sandbox</p>
            <h1 className="text-lg font-semibold text-white">
              {isLoading ? 'Loading…' : sandbox?.template.displayName ?? 'Unknown sandbox'}
            </h1>
          </div>
          {sandbox && (
            <>
              <div className="hidden items-center gap-2 text-sm text-gray-400 sm:flex">
                <Container className="h-4 w-4 text-accent-hover" />
                <span className="font-mono">{sandbox.template.dockerImage}</span>
              </div>
              <div className="hidden items-center gap-2 text-sm text-gray-400 md:flex">
                <Clock className="h-4 w-4 text-status-active" />
                <span>Expires {formatExpiry(sandbox.expiresAt)}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          {isConnected ? (
            <>
              <Wifi className="h-4 w-4 text-status-active" />
              <span className="text-status-active">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-status-danger" />
              <span className="text-status-danger">Disconnected</span>
            </>
          )}
        </div>
      </header>

      {error && (
        <div className="border-b border-status-danger/30 bg-status-danger/10 px-6 py-3 text-sm text-status-danger">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading sandbox…
            </div>
          ) : (
            <Terminal socket={socket} sandboxId={sandboxId} className="h-full" />
          )}
        </div>
        <AIPanel
          socket={socket}
          isOpen={aiPanelOpen}
          onToggle={() => setAiPanelOpen((prev) => !prev)}
        />
      </div>
    </div>
  );
}
