import { useEffect, useState } from 'react';
import { Brain, ChevronLeft, ChevronRight, Lightbulb, AlertTriangle, Info } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import type { AIInsight } from '@/types';

interface AIPanelProps {
  socket: Socket | null;
  isOpen: boolean;
  onToggle: () => void;
}

const typeIcons = {
  info: Info,
  warning: AlertTriangle,
  suggestion: Lightbulb,
  error: AlertTriangle,
};

const typeColors = {
  info: 'text-status-active border-status-active/30 bg-status-active/10',
  warning: 'text-status-warning border-status-warning/30 bg-status-warning/10',
  suggestion: 'text-accent-hover border-accent/30 bg-accent-muted/40',
  error: 'text-status-danger border-status-danger/30 bg-status-danger/10',
};

export default function AIPanel({ socket, isOpen, onToggle }: AIPanelProps) {
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [streamLog, setStreamLog] = useState<string[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handleInsight = (insight: AIInsight) => {
      setInsights((prev) => [insight, ...prev].slice(0, 50));
    };

    const handleOutput = (data: string) => {
      const sanitized = data.replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (sanitized) {
        setStreamLog((prev) => [...prev.slice(-99), sanitized]);
      }
    };

    socket.on('ai-insight', handleInsight);
    socket.on('terminal-output', handleOutput);

    return () => {
      socket.off('ai-insight', handleInsight);
      socket.off('terminal-output', handleOutput);
    };
  }, [socket]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex h-full w-10 shrink-0 flex-col items-center justify-center gap-2 border-l border-border bg-surface-raised text-gray-400 transition-colors hover:bg-surface-overlay hover:text-accent-hover"
        aria-label="Open AI panel"
      >
        <Brain className="h-4 w-4" />
        <ChevronLeft className="h-4 w-4" />
      </button>
    );
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-surface-raised">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-accent-hover" />
          <h2 className="text-sm font-semibold text-white">AI Insights</h2>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded p-1 text-gray-400 hover:bg-surface-overlay hover:text-gray-200"
          aria-label="Close AI panel"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
        <p className="mb-3 text-xs text-gray-500">
          Subscribes to terminal output. Use <code className="text-accent-hover">/ai</code> for NL commands.
        </p>

        {insights.length === 0 && streamLog.length === 0 && (
          <p className="text-sm text-gray-500">Waiting for terminal activity…</p>
        )}

        <div className="space-y-2">
          {insights.map((insight) => {
            const Icon = typeIcons[insight.type];
            return (
              <article
                key={insight.id}
                className={`rounded-lg border p-3 ${typeColors[insight.type]}`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium uppercase">{insight.type}</span>
                </div>
                <p className="text-sm text-gray-200">{insight.message}</p>
                {insight.command && (
                  <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-2 font-mono text-xs text-gray-300">
                    {insight.command}
                  </pre>
                )}
              </article>
            );
          })}
        </div>

        {streamLog.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              Output Stream
            </h3>
            <div className="space-y-1 font-mono text-xs text-gray-400">
              {streamLog.slice(-8).map((line, i) => (
                <p key={`${line}-${i}`} className="truncate">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
