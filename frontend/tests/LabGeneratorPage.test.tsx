import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LabGeneratorPage from '@/pages/LabGeneratorPage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

describe('LabGeneratorPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits a trimmed prompt and displays the generated lab', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'lab-99',
        status: 'ready',
        title: 'Kubernetes foundations',
        description: 'A ready-to-run Kubernetes lab.',
        sandboxId: 'sandbox-99',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<LabGeneratorPage />);

    await user.type(screen.getByLabelText('Natural Language Training Request'), '  Create a Kubernetes lab  ');
    await user.click(screen.getByRole('button', { name: 'Generate Lab' }));

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/api/labs/generate`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'Create a Kubernetes lab' }),
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Kubernetes foundations' })).toBeInTheDocument();
    expect(screen.getByText(/Status:\s*ready/)).toBeInTheDocument();
    expect(screen.getByText(/Sandbox: sandbox-99/)).toBeInTheDocument();
  });

  it('shows the offline status when generation cannot reach the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup();
    render(<LabGeneratorPage />);

    await user.type(screen.getByLabelText('Natural Language Training Request'), 'Docker lab');
    await user.click(screen.getByRole('button', { name: 'Generate Lab' }));

    expect(
      await screen.findByRole('heading', { name: 'Lab generation started (offline mode)' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Status: generating')).toBeInTheDocument();
  });
});
