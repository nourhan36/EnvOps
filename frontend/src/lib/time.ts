/**
 * Formats a remaining duration in milliseconds as "2h 30m", "30m 12s" or "12s".
 * When `showSeconds` is true the seconds are always included so a timer visibly
 * ticks even for long-lived sandboxes. Returns "Expired" for non-positive input.
 */
export function formatDuration(remainingMs: number, showSeconds = false): string {
  if (remainingMs <= 0) return 'Expired';

  const hours = Math.floor(remainingMs / 3_600_000);
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);

  if (hours > 0) {
    return showSeconds ? `${hours}h ${minutes}m ${seconds}s` : `${hours}h ${minutes}m`;
  }
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Human-readable time left until an ISO deadline, or "Expired" once it has passed. */
export function formatTTL(expiresAt: string): string {
  return formatDuration(new Date(expiresAt).getTime() - Date.now());
}