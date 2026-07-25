import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SandboxCard from '@/components/dashboard/SandboxCard';
import type { Sandbox } from '@/types';

const sandbox: Sandbox = {
  id: 'sandbox-42',
  name: 'terraform-lab',
  imageType: 'hashicorp/terraform:1.7',
  status: 'active',
  expiresAt: '2026-07-21T14:30:00.000Z',
  createdAt: '2026-07-21T12:00:00.000Z',
};

describe('SandboxCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T14:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the sandbox metadata and a human-readable TTL', () => {
    render(<SandboxCard sandbox={sandbox} onReclaim={vi.fn()} onTerminate={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'terraform-lab' })).toBeInTheDocument();
    expect(screen.getByText('hashicorp/terraform:1.7')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('30m 0s')).toBeInTheDocument();
  });

  it('sends the sandbox id through reclaim and termination actions', async () => {
    vi.useRealTimers();
    const onReclaim = vi.fn();
    const onTerminate = vi.fn();
    const user = userEvent.setup();
    render(<SandboxCard sandbox={sandbox} onReclaim={onReclaim} onTerminate={onTerminate} />);

    await user.click(screen.getByRole('button', { name: 'Reclaim' }));
    await user.click(screen.getByRole('button', { name: 'Terminate' }));
    await user.click(screen.getByRole('button', { name: 'Delete sandbox' }));

    expect(onReclaim).toHaveBeenCalledWith('sandbox-42');
    expect(onTerminate).toHaveBeenCalledTimes(2);
    expect(onTerminate).toHaveBeenNthCalledWith(1, 'sandbox-42');
  });

  it('disables all actions after termination', () => {
    render(
      <SandboxCard
        sandbox={{ ...sandbox, status: 'terminated' }}
        onReclaim={vi.fn()}
        onTerminate={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Reclaim' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Terminate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete sandbox' })).toBeDisabled();
  });
});
