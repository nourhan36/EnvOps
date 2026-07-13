import { useState } from 'react';
import { Clock, Container, Wifi, WifiOff } from 'lucide-react';
import Terminal from '@/components/terminal/Terminal';
import AIPanel from '@/components/terminal/AIPanel';
import { useSocket } from '@/providers/SocketProvider';

const SANDBOX_META = {
  id: 'sb-001',
  name: 'k8s-lab-alpha',
  imageType: 'kubernetes:1.29',
  expiresAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
};

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function SandboxTerminalPage() {
  const { socket, isConnected } = useSocket();
  const [aiPanelOpen, setAiPanelOpen] = useState(true);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border bg-surface-raised px-6 py-4">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Sandbox</p>
            <h1 className="text-lg font-semibold text-white">{SANDBOX_META.name}</h1>
          </div>
          <div className="hidden items-center gap-2 text-sm text-gray-400 sm:flex">
            <Container className="h-4 w-4 text-accent-hover" />
            <span className="font-mono">{SANDBOX_META.imageType}</span>
          </div>
          <div className="hidden items-center gap-2 text-sm text-gray-400 md:flex">
            <Clock className="h-4 w-4 text-status-active" />
            <span>Expires {formatExpiry(SANDBOX_META.expiresAt)}</span>
          </div>
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

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <Terminal socket={socket} className="h-full" />
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
