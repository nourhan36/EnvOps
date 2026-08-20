import { render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountdown } from '@/hooks/useCountdown';

function Harness({ expiresAt, showSeconds }: { expiresAt: string; showSeconds?: boolean }) {
  const { ttl, isExpired } = useCountdown(expiresAt, showSeconds);
  return (
    <div>
      <span data-testid="ttl">{ttl}</span>
      <span data-testid="expired">{String(isExpired)}</span>
    </div>
  );
}

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T14:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with the full remaining time', () => {
    render(<Harness expiresAt="2026-07-21T14:30:00.000Z" />);

    expect(screen.getByTestId('ttl')).toHaveTextContent('30m 0s');
    expect(screen.getByTestId('expired')).toHaveTextContent('false');
  });

  it('ticks down every second', () => {
    render(<Harness expiresAt="2026-07-21T14:00:30.000Z" showSeconds />);

    expect(screen.getByTestId('ttl')).toHaveTextContent('30s');

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByTestId('ttl')).toHaveTextContent('25s');

    act(() => {
      vi.advanceTimersByTime(25_000);
    });
    expect(screen.getByTestId('ttl')).toHaveTextContent('Expired');
    expect(screen.getByTestId('expired')).toHaveTextContent('true');
  });

  it('marks a past deadline as expired immediately', () => {
    render(<Harness expiresAt="2026-07-21T13:30:00.000Z" />);

    expect(screen.getByTestId('ttl')).toHaveTextContent('Expired');
    expect(screen.getByTestId('expired')).toHaveTextContent('true');
  });
});