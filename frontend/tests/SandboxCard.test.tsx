import { render, screen, act } from '@testing-library/react';
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
    securityMode: 'hardened',
    command: null,
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

  it('shows per-sandbox resource limits when present', () => {
    render(
      <SandboxCard
        sandbox={{ ...sandbox, resourceLimits: { cpu: '1', memory: '1Gi' } }}
        onConnect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('1 CPU · 1Gi')).toBeInTheDocument();
  });

  it('renders a prompt-created sandbox with no template using its docker image', () => {
    const dynamic: Sandbox = {
      ...sandbox,
      templateId: null,
      template: null,
      dockerImage: 'python:3.11-slim',
      resourceLimits: { cpu: '500m', memory: '512Mi' },
    };
    render(<SandboxCard sandbox={dynamic} onConnect={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'python:3.11-slim' })).toBeInTheDocument();
    expect(screen.getAllByText('python:3.11-slim').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('500m CPU · 512Mi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  });

  it('shows a root badge for allowlisted dynamic sandboxes running as root', () => {
    const dynamic: Sandbox = {
      ...sandbox,
      templateId: null,
      template: null,
      dockerImage: 'postgres:16-alpine',
      securityMode: 'root',
      resourceLimits: { cpu: '500m', memory: '1Gi' },
    };
    render(<SandboxCard sandbox={dynamic} onConnect={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'postgres:16-alpine' })).toBeInTheDocument();
    expect(screen.getByText('root', { exact: true })).toBeInTheDocument();
  });

  it('sends the sandbox id through connect and delete actions', async () => {
    vi.useRealTimers();
    const onConnect = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <SandboxCard
        sandbox={{ ...sandbox, expiresAt: '2099-07-21T14:30:00.000Z' }}
        onConnect={onConnect}
        onDelete={onDelete}
      />,
    );

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

  it('disables connect while a sandbox is provisioning', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onConnect = vi.fn();
    render(
      <SandboxCard
        sandbox={{ ...sandbox, status: 'provisioning', expiresAt: '2099-07-21T14:30:00.000Z' }}
        onConnect={onConnect}
        onDelete={vi.fn()}
      />,
    );

    const connect = screen.getByRole('button', { name: 'Provisioning…' });
    expect(connect).toBeDisabled();

    await user.click(connect);
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('labels the busy state as Deleting and disables connect while a delete is in progress', () => {
    render(
      <SandboxCard
        sandbox={{ ...sandbox, status: 'running' }}
        onConnect={vi.fn()}
        onDelete={vi.fn()}
        isDeleting
      />,
    );

    expect(screen.getByText('Deleting…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  });

  it('keeps connect enabled for a running sandbox that is not deleting', () => {
    render(<SandboxCard sandbox={sandbox} onConnect={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  });

  it('shows an expired badge and removes the connect button once the TTL has elapsed', () => {
    const expired = { ...sandbox, expiresAt: '2026-07-21T13:30:00.000Z' };
    render(<SandboxCard sandbox={expired} onConnect={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('expired')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete sandbox' })).toBeEnabled();
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('flips a running sandbox to expired and removes connect when the countdown hits zero', () => {
    render(<SandboxCard sandbox={sandbox} onConnect={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(31 * 60 * 1000);
    });

    expect(screen.getByText('expired')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete sandbox' })).toBeEnabled();
  });

  it('hides the TTL countdown on failed sandboxes', () => {
    render(
      <SandboxCard
        sandbox={{ ...sandbox, status: 'failed' }}
        onConnect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.queryByText(/TTL:/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  });
});
