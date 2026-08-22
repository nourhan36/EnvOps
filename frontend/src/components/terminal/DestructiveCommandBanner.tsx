import { AlertTriangle, Check, X } from 'lucide-react';

export interface DestructiveBannerProps {
  command: string;
  explanation: string;
  /** Explicitly user-initiated execution: writes \r to the terminal. */
  onRun: () => void;
  onDiscard: () => void;
}

export default function DestructiveCommandBanner({
  command,
  explanation,
  onRun,
  onDiscard,
}: DestructiveBannerProps) {
  return (
    <div
      role="alertdialog"
      aria-label="Potentially destructive command"
      className="absolute left-0 right-0 top-0 z-20 flex flex-col gap-2 border-b border-status-warning/40 bg-status-warning/10 px-3 py-2.5 backdrop-blur-sm"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-status-warning">
            This command may modify or delete data
          </p>
          <p className="mt-0.5 truncate font-mono text-xs text-gray-300" title={command}>
            {command}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{explanation}</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDiscard}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-gray-300 transition-colors hover:bg-surface-overlay"
        >
          <X className="h-3.5 w-3.5" />
          Discard
        </button>
        <button
          type="button"
          onClick={onRun}
          className="inline-flex items-center gap-1 rounded-md bg-status-warning px-2.5 py-1 text-xs font-medium text-black transition-colors hover:brightness-110"
        >
          <Check className="h-3.5 w-3.5" />
          Run anyway
        </button>
      </div>
    </div>
  );
}
