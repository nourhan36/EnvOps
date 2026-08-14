import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SandboxCard from '@/components/dashboard/SandboxCard';
import type { Sandbox } from '@/types';

const sandbox: Sandbox = {
  id: 'sandbox-42',
  userId: 'user-1',
  templateId: 'template-1',
  template: {
    id: 'template-1',
    name: 'terraform',
    displayName: 'Terraform Lab',
    description: 'Terraform sandbox',
    dockerImage: 'hashicorp/terraform:1.7',
    defaultLimits: { cpu: '250m', memory: '256Mi' },
    defaultTtlMinutes: 120,
    isActive: true,
    createdAt: '2026-07-21T12:00:00.000Z',
  },
  namespace: 'terraform-lab',
  status: 'running',
  createdAt: '2026-07-21T12:00:00.000Z',
  expiresAt: '2026-07-21T14:30:00.000Z',
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
    render(<SandboxCard sandbox={sandbox} onConnect={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Terraform Lab' })).toBeInTheDocument();
    expect(screen.getByText('hashicorp/terraform:1.7')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('30m 0s')).toBeInTheDocument();
  });

  it('sends the sandbox id through connect and delete actions', async () => {
    vi.useRealTimers();
    const onConnect = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<SandboxCard sandbox={sandbox} onConnect={onConnect} onDelete={onDelete} />);

    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Delete sandbox' }));

    expect(onConnect).toHaveBeenCalledWith('sandbox-42');
    expect(onDelete).toHaveBeenCalledWith('sandbox-42');
  });

  it('disables actions for non-connectable and deleted sandboxes', () => {
    render(
      <SandboxCard
        sandbox={{ ...sandbox, status: 'deleted' }}
        onConnect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete sandbox' })).toBeDisabled();
  });

  it('shows a provisioning state instead of the connect action', () => {
    render(
      <SandboxCard
        sandbox={{ ...sandbox, status: 'provisioning' }}
        onConnect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('Provisioning…')).toBeInTheDocument();
  });
});
