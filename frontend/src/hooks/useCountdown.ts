import { useEffect, useState } from 'react';
import { formatDuration } from '@/lib/time';

export interface UseCountdownResult {
  /** Human-readable remaining time, or "Expired" once the deadline has passed. */
  ttl: string;
  isExpired: boolean;
}

/**
 * Tracks the time remaining until an ISO deadline, re-rendering every second.
 * Pass `showSeconds` to always include the seconds in the formatted value.
 */


export function useCountdown(
  expiresAt: string | null | undefined,
  showSeconds = false,
): UseCountdownResult {
  const deadline = expiresAt ? new Date(expiresAt).getTime() : Number.NEGATIVE_INFINITY;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  const remainingMs = deadline - now;
  return {
    ttl: formatDuration(remainingMs, showSeconds),
    isExpired: remainingMs <= 0,
  };
}