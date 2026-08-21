import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NewSandboxModal from '@/components/dashboard/NewSandboxModal';
import { api } from '@/lib/api';
import type { SandboxTemplate } from '@/types';

vi.mock('@/lib/api', () => ({
  api: {
    getTemplates: vi.fn(),
    createSandbox: vi.fn(),
    createSandboxFromPrompt: vi.fn(),
  },
}));

const ubuntu: SandboxTemplate = {
  id: 'template-ubuntu',
  name: 'ubuntu',
  displayName: 'Empty Ubuntu Sandbox',
  description: 'A blank Ubuntu environment',
  dockerImage: 'ubuntu:22.04',
  defaultLimits: { cpu: '250m', memory: '256Mi' },
  defaultTtlMinutes: 60,
  securityMode: 'hardened',
  command: null,
  isActive: true,
  createdAt: '2026-07-21T12:00:00.000Z',
};

const docker: SandboxTemplate = {
  id: 'template-docker',
  name: 'docker',
  displayName: 'Docker Playground',
  description: 'Docker-in-Docker sandbox',
  dockerImage: 'docker:dind',
  defaultLimits: { cpu: '1', memory: '1Gi' },
  defaultTtlMinutes: 120,
  securityMode: 'privileged',
  command: ['/bin/sh', '-c', 'dockerd-entrypoint.sh & sleep infinity'],
  isActive: true,
  createdAt: '2026-07-21T12:00:00.000Z',
};

function renderModal(overrides: Partial<React.ComponentProps<typeof NewSandboxModal>> = {}) {
  return render(
    <NewSandboxModal open onClose={vi.fn()} onCreated={vi.fn()} {...overrides} />,
  );
}

describe('NewSandboxModal', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders active templates as image options', async () => {
    vi.mocked(api.getTemplates).mockResolvedValue([ubuntu, docker]);
    renderModal();

    expect(await screen.findByRole('heading', { name: 'Empty Ubuntu Sandbox' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Docker Playground' })).toBeInTheDocument();
    expect(api.getTemplates).toHaveBeenCalled();
  });

  it('filters out inactive templates', async () => {
    vi.mocked(api.getTemplates).mockResolvedValue([{ ...ubuntu, isActive: false }]);
    renderModal();

    await screen.findByText(/No templates available/);
    expect(screen.queryByRole('heading', { name: 'Empty Ubuntu Sandbox' })).not.toBeInTheDocument();
  });

  it('flags elevated templates with a warning badge and a security notice', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getTemplates).mockResolvedValue([ubuntu, docker]);
    renderModal();

    await screen.findByRole('heading', { name: 'Docker Playground' });
    expect(screen.getByText('Elevated')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Docker Playground/ }));

    expect(screen.getByText(/runs with elevated privileges/)).toBeInTheDocument();
  });

  it('prefills resource controls from the selected template defaults', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getTemplates).mockResolvedValue([ubuntu, docker]);
    renderModal();

    await screen.findByRole('heading', { name: 'Empty Ubuntu Sandbox' });
    await user.click(screen.getByRole('button', { name: /Empty Ubuntu Sandbox/ }));

    expect(screen.getByLabelText('CPU limit')).toHaveValue('250m');
    expect(screen.getByLabelText('Memory limit')).toHaveValue('256Mi');
    expect(screen.getByLabelText('Sandbox lifetime')).toHaveValue('60');
  });

  it('sends the selected image, resources and TTL when creating', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    vi.mocked(api.getTemplates).mockResolvedValue([ubuntu, docker]);
    vi.mocked(api.createSandbox).mockResolvedValue({
      message: 'ok',
      sandbox: { id: 'sandbox-1' } as never,
    });

    renderModal({ onCreated });
    await screen.findByRole('heading', { name: 'Docker Playground' });
    await user.click(screen.getByRole('button', { name: /Docker Playground/ }));

    await user.selectOptions(screen.getByLabelText('CPU limit'), '2');
    await user.selectOptions(screen.getByLabelText('Memory limit'), '2Gi');
    await user.selectOptions(screen.getByLabelText('Sandbox lifetime'), '180');
    await user.click(screen.getByRole('button', { name: 'Create Sandbox' }));

    expect(api.createSandbox).toHaveBeenCalledWith('template-docker', {
      resources: { cpu: '2', memory: '2Gi' },
      ttlMinutes: 180,
    });
    expect(onCreated).toHaveBeenCalledWith('sandbox-1');
  });

  it('keeps the modal open and surfaces errors when creation fails', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    vi.mocked(api.getTemplates).mockResolvedValue([ubuntu]);
    vi.mocked(api.createSandbox).mockRejectedValue(new Error('Provisioning failed'));

    renderModal({ onCreated });
    await screen.findByRole('heading', { name: 'Empty Ubuntu Sandbox' });
    await user.click(screen.getByRole('button', { name: /Empty Ubuntu Sandbox/ }));
    await user.click(screen.getByRole('button', { name: 'Create Sandbox' }));

    expect(await screen.findByText('Provisioning failed')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('allows going back to the image list without creating', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getTemplates).mockResolvedValue([ubuntu, docker]);
    renderModal();

    await screen.findByRole('heading', { name: 'Empty Ubuntu Sandbox' });
    await user.click(screen.getByRole('button', { name: /Empty Ubuntu Sandbox/ }));
    expect(screen.getByRole('heading', { name: 'Customize Sandbox' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Choose a different image/ }));
    expect(screen.getByRole('heading', { name: 'Create a Sandbox' })).toBeInTheDocument();
    expect(api.createSandbox).not.toHaveBeenCalled();
  });

  it('provisions a sandbox from a natural language prompt', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    vi.mocked(api.getTemplates).mockResolvedValue([ubuntu]);
    vi.mocked(api.createSandboxFromPrompt).mockResolvedValue({
      message: 'ok',
      sandbox: { id: 'sandbox-prompt-1' } as never,
    });

    renderModal({ onCreated });
    await screen.findByRole('heading', { name: 'Empty Ubuntu Sandbox' });

    await user.click(screen.getByRole('button', { name: /Describe it/ }));
    expect(screen.getByRole('heading', { name: 'Describe your sandbox' })).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/Natural Language Request/),
      'Launch an Ubuntu 22.04 pod with 1 core and 2GB for 45 minutes',
    );
    await user.click(screen.getByRole('button', { name: 'Create Sandbox' }));

    expect(api.createSandboxFromPrompt).toHaveBeenCalledWith(
      'Launch an Ubuntu 22.04 pod with 1 core and 2GB for 45 minutes',
    );
    expect(onCreated).toHaveBeenCalledWith('sandbox-prompt-1');
  });

  it('surfaces errors when prompt-based provisioning fails', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    vi.mocked(api.getTemplates).mockResolvedValue([ubuntu]);
    vi.mocked(api.createSandboxFromPrompt).mockRejectedValue(new Error('Model failed to parse'));

    renderModal({ onCreated });
    await screen.findByRole('heading', { name: 'Empty Ubuntu Sandbox' });

    await user.click(screen.getByRole('button', { name: /Describe it/ }));
    await user.type(screen.getByLabelText(/Natural Language Request/), 'spin up python');
    await user.click(screen.getByRole('button', { name: 'Create Sandbox' }));

    expect(await screen.findByText('Model failed to parse')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});