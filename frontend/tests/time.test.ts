import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDuration, formatTTL } from '@/lib/time';

describe('formatDuration', () => {
  it('formats seconds-only durations', () => {
    expect(formatDuration(12_000)).toBe('12s');
  });

  it('formats minute/second durations', () => {
    expect(formatDuration(30 * 60_000)).toBe('30m 0s');
    expect(formatDuration(30 * 60_000 + 7_000)).toBe('30m 7s');
  });

  it('omits seconds for hour-long durations by default', () => {
    expect(formatDuration(2 * 3_600_000 + 30 * 60_000)).toBe('2h 30m');
  });

  it('includes seconds for hour-long durations when showSeconds is true', () => {
    expect(formatDuration(2 * 3_600_000 + 30 * 60_000 + 5_000, true)).toBe('2h 30m 5s');
  });

  it('returns Expired for non-positive remaining time', () => {
    expect(formatDuration(0)).toBe('Expired');
    expect(formatDuration(-1000)).toBe('Expired');
  });
});

describe('formatTTL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T14:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes the remaining time from an ISO deadline', () => {
    expect(formatTTL('2026-07-21T14:30:00.000Z')).toBe('30m 0s');
  });

  it('returns Expired for a past deadline', () => {
    expect(formatTTL('2026-07-21T13:30:00.000Z')).toBe('Expired');
  });
});