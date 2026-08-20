import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/pages/DashboardPage';
import { api } from '@/lib/api';
import type { Sandbox, DashboardStats, SandboxTemplate } from '@/types';

vi.mock('@/lib/api', () => ({
  api: {
    getSandboxes: vi.fn(),
    getDashboardStats: vi.fn(),
    getTemplates: vi.fn(),
    createSandbox: vi.fn(),
    deleteSandbox: vi.fn(),
  },
}));

const template: SandboxTemplate = {
  id: 'template-1',
  name: 'ubuntu',
  displayName: 'Empty Ubuntu Sandbox',
  description: 'A blank Ubuntu 22.04 environment',
  dockerImage: 'ubuntu:22.04',
  defaultLimits: { cpu: '250m', memory: '256Mi' },
  defaultTtlMinutes: 120,
  privileged: false,
  command: null,
  isActive: true,
  createdAt: '2026-07-21T12:00:00.000Z',
};

const sandbox: Sandbox = {
  id: 'sandbox-42',
  userId: 'user-1',
  templateId: template.id,
  template,
  namespace: 'envops-sandbox',
  status: 'running',
  createdAt: '2026-07-21T12:00:00.000Z',
  expiresAt: '2099-07-21T14:30:00.000Z',
};

const stats: DashboardStats = {
  totalSandboxes: 1,
  provisioningSandboxes: 0,
  runningSandboxes: 1,
  failedSandboxes: 0,
  totalTemplates: 1,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads sandboxes and stats from the API', async () => {
    vi.mocked(api.getSandboxes).mockResolvedValue([sandbox]);
    vi.mocked(api.getDashboardStats).mockResolvedValue(stats);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Empty Ubuntu Sandbox' })).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText(/1 running sandbox/)).toBeInTheDocument();
    expect(screen.getByText('Total Sandboxes')).toBeInTheDocument();
  });

  it('creates a sandbox from a template with customizable resources and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getSandboxes).mockResolvedValue([]);
    vi.mocked(api.getDashboardStats).mockResolvedValue(stats);
    vi.mocked(api.getTemplates).mockResolvedValue([template]);
    vi.mocked(api.createSandbox).mockResolvedValue({ message: 'ok', sandbox });

    renderPage();

    await user.click(screen.getByRole('button', { name: 'New Sandbox' }));

    expect(await screen.findByRole('heading', { name: 'Empty Ubuntu Sandbox' })).toBeInTheDocument();
    expect(screen.getByText('ubuntu:22.04')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Empty Ubuntu Sandbox/ }));

    expect(screen.getByRole('heading', { name: 'Customize Sandbox' })).toBeInTheDocument();
    expect(screen.getByLabelText('CPU limit')).toHaveValue('250m');
    expect(screen.getByLabelText('Memory limit')).toHaveValue('256Mi');
    expect(screen.getByLabelText('Sandbox lifetime')).toHaveValue('120');

    await user.selectOptions(screen.getByLabelText('CPU limit'), '1');
    await user.selectOptions(screen.getByLabelText('Memory limit'), '1Gi');
    await user.selectOptions(screen.getByLabelText('Sandbox lifetime'), '90');
    await user.click(screen.getByRole('button', { name: 'Create Sandbox' }));

    expect(api.createSandbox).toHaveBeenCalledWith('template-1', {
      resources: { cpu: '1', memory: '1Gi' },
      ttlMinutes: 90,
    });
  });

  it('deletes a sandbox when the delete action is triggered', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getSandboxes).mockResolvedValue([sandbox]);
    vi.mocked(api.getDashboardStats).mockResolvedValue(stats);
    vi.mocked(api.deleteSandbox).mockResolvedValue({ message: 'ok', sandbox });

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete sandbox' }));
    expect(api.deleteSandbox).toHaveBeenCalledWith('sandbox-42');
  });
});
