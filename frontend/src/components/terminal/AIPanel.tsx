import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  Brain,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { api } from '@/lib/api';
import type { AIErrorDetected, ExplainErrorResponse, SandboxTemplate } from '@/types';

interface AIPanelProps {
  socket: Socket | null;
  isOpen: boolean;
  onToggle: () => void;
  sandboxId: string;
  template?: SandboxTemplate | null;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

export default function AIPanel({ socket, isOpen, onToggle, sandboxId, template }: AIPanelProps) {
  const [detected, setDetected] = useState<AIErrorDetected | null>(null);
  const [result, setResult] = useState<ExplainErrorResponse | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const explain = useCallback(
    async () => {
      if (!sandboxId || isExplaining) return;

      setIsExplaining(true);
      setResult(null);
      setRequestError(null);

      try {
        // Empty body: the backend answers with the latest captured failure for
        // this sandbox (full stderr), so the panel never sends stale data.
        const response = await api.explainError(sandboxId, {
          environmentType: template?.displayName,
        });
        setResult(response);
      } catch (error) {
        setResult(null);
        setRequestError(error instanceof Error ? error.message : 'Unable to reach the explain service.');
      } finally {
        setIsExplaining(false);
      }
    },
    [sandboxId, isExplaining, template],
  );

  useEffect(() => {
    if (!socket) return;

    // Detection only surfaces the latest failure for the button; the model is
    // never called automatically, only when the user clicks "Explain This Failure".
    const handleErrorDetected = (payload: AIErrorDetected) => {
      setDetected(payload);
      setRequestError(null);
    };

    socket.on('ai:error-detected', handleErrorDetected);

    return () => {
      socket.off('ai:error-detected', handleErrorDetected);
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

  const unavailable =
    result?.status === 'unavailable'
      ? result
      : requestError
        ? { retryable: true, reason: requestError }
        : null;

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-surface-raised">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-accent-hover" />
          <h2 className="text-sm font-semibold text-white">Explain This Failure</h2>
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
        {template && (
          <p className="mb-3 flex items-center gap-1.5 text-xs text-gray-500">
            <TerminalSquare className="h-3.5 w-3.5 text-accent-hover" />
            {template.displayName}
          </p>
        )}

        {detected && (
          <article className="mb-3 rounded-lg border border-status-danger/30 bg-status-danger/10 p-3">
            <div className="mb-1 flex items-center gap-2 text-status-danger">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="text-xs font-medium uppercase">
                Failure {detected.signature ? `· ${detected.signature}` : ''}
              </span>
            </div>
            <p className="text-xs text-gray-400">{formatTime(detected.detectedAt)}</p>
            <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-2 font-mono text-xs text-gray-300">
              {detected.command}
            </pre>
            <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-black/30 p-2 font-mono text-xs text-gray-400">
              {detected.stderrPreview}
            </pre>
          </article>
        )}

        <button
          type="button"
          onClick={() => void explain()}
          disabled={isExplaining}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExplaining ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing with DeepSeek…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Explain This Failure
            </>
          )}
        </button>

        {isExplaining && (
          <p className="text-center text-xs text-gray-500">
            Asking deepseek.v3.2 to diagnose the error…
          </p>
        )}

        {!isExplaining && !result && !requestError && (
          <p className="text-sm text-gray-500">
            Run a failing command in the terminal, then click{' '}
            <span className="text-accent-hover">Explain This Failure</span> to diagnose the latest
            error.
          </p>
        )}

        {result?.status === 'available' && (
          <div className="space-y-3">
            <section>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-status-warning">
                Diagnosis
              </h3>
              <div className="prose-xs text-sm text-gray-200">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {result.explanation}
                </ReactMarkdown>
              </div>
            </section>

            {result.suggestedFix && (
              <section>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-status-active">
                  Suggested Fix
                </h3>
                <div className="prose-xs text-sm text-gray-200">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {result.suggestedFix}
                  </ReactMarkdown>
                </div>
              </section>
            )}

            <p className="text-[10px] uppercase tracking-wide text-gray-600">
              Answered by {result.model}
            </p>
          </div>
        )}

        {unavailable && (
          <div className="rounded-lg border border-status-warning/30 bg-status-warning/10 p-3 text-sm text-status-warning">
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="font-medium">AI explanation unavailable</span>
            </div>
            <p className="text-xs text-gray-400">
              The model call failed. Your terminal session is unaffected.
            </p>
            {unavailable.retryable && (
              <button
                type="button"
                onClick={() => void explain()}
                className="mt-2 inline-flex items-center gap-1.5 rounded border border-current px-2 py-1 text-xs font-medium transition-colors hover:bg-status-warning/10"
              >
                <RefreshCw className="h-3 w-3" />
                Try again
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-1 mt-2 text-base font-semibold text-white">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-1 mt-2 text-sm font-semibold text-white">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1 mt-2 text-sm font-semibold text-white">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="my-1.5 text-sm leading-relaxed text-gray-300">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-1.5 list-disc space-y-1 pl-5 text-sm text-gray-300">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-1.5 list-decimal space-y-1 pl-5 text-sm text-gray-300">{children}</ol>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-xs text-accent-hover">
      {children}
    </code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-2 overflow-x-auto rounded bg-black/40 p-2 font-mono text-xs text-gray-300">
      {children}
    </pre>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent-hover underline decoration-accent/50 underline-offset-2"
    >
      {children}
    </a>
  ),
};
