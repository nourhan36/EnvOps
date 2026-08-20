import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AIPanel from '@/components/terminal/AIPanel';
import { api } from '@/lib/api';
import type { AIErrorDetected, ExplainErrorResponse, SandboxTemplate } from '@/types';

vi.mock('@/lib/api', () => ({
  api: {
    explainError: vi.fn(),
  },
}));

const template: SandboxTemplate = {
  id: 'template-1',
  name: 'node-postgres',
  displayName: 'Node.js + PostgreSQL on Ubuntu',
  description: '',
  dockerImage: 'node:20',
  defaultLimits: { cpu: '250m', memory: '256Mi' },
  defaultTtlMinutes: 120,
  isActive: true,
  createdAt: '2026-07-21T12:00:00.000Z',
};

const available: ExplainErrorResponse = {
  status: 'available',
  explanation: '## Diagnosis\nPort 5432 is already bound on the host.',
  suggestedFix: '```bash\nkill $(lsof -t -i:5432)\n```\nRun the command again.',
  model: 'deepseek.v3.2',
  generatedAt: '2026-08-15T10:00:00.000Z',
};

const unavailable: ExplainErrorResponse = {
  status: 'unavailable',
  reason: 'timeout',
  retryable: true,
};

function createFakeSocket() {
  const handlers = new Map<string, (payload: unknown) => void>();

  return {
    connected: true,
    on: vi.fn((event: string, cb: (payload: unknown) => void) => {
      handlers.set(event, cb);
    }),
    off: vi.fn((event: string) => {
      handlers.delete(event);
    }),
    emit: vi.fn(),
    emitEvent: (event: string, payload: unknown) => handlers.get(event)?.(payload),
  };
}

const failure: AIErrorDetected = {
  sandboxId: 'sandbox-42',
  command: 'npm install',
  stderrPreview: 'npm ERR! code ERESOLVE',
  signature: 'npm error',
  detectedAt: '2026-08-15T10:00:00.000Z',
};

function renderPanel(socket: ReturnType<typeof createFakeSocket>, open = true) {
  return render(
    <AIPanel
      socket={socket as never}
      isOpen={open}
      onToggle={() => {}}
      sandboxId="sandbox-42"
      template={template}
    />,
  );
}

describe('AIPanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the collapsed trigger when closed', () => {
    renderPanel(createFakeSocket(), false);
    expect(screen.getByRole('button', { name: 'Open AI panel' })).toBeInTheDocument();
  });

  it('renders the template environment in the header', () => {
    renderPanel(createFakeSocket());
    expect(screen.getByText('Node.js + PostgreSQL on Ubuntu')).toBeInTheDocument();
  });

  it('surfaces a detected failure without auto-calling the model, then explains on click', async () => {
    vi.mocked(api.explainError).mockResolvedValue(available);
    const socket = createFakeSocket();
    const user = userEvent.setup();

    renderPanel(socket);
    act(() => socket.emitEvent('ai:error-detected', failure));

    expect(await screen.findByText(/npm install/)).toBeInTheDocument();
    expect(screen.getByText('npm ERR! code ERESOLVE')).toBeInTheDocument();
    expect(api.explainError).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Explain This Failure/ }));

    await waitFor(() => {
      expect(api.explainError).toHaveBeenCalledWith('sandbox-42', {
        environmentType: 'Node.js + PostgreSQL on Ubuntu',
      });
    });

    expect(await screen.findByText('Port 5432 is already bound on the host.')).toBeInTheDocument();
    expect(screen.getByText('kill $(lsof -t -i:5432)')).toBeInTheDocument();
    expect(screen.getByText(/deepseek.v3.2/)).toBeInTheDocument();
  });

  it('never calls the model from detection events, even when repeated', () => {
    const socket = createFakeSocket();

    renderPanel(socket);
    act(() => socket.emitEvent('ai:error-detected', failure));
    act(() => socket.emitEvent('ai:error-detected', failure));
    act(() => socket.emitEvent('ai:error-detected', failure));

    expect(api.explainError).not.toHaveBeenCalled();
  });

  it('shows a retryable unavailable state when the model call fails', async () => {
    vi.mocked(api.explainError).mockResolvedValue(unavailable);
    const socket = createFakeSocket();
    const user = userEvent.setup();

    renderPanel(socket);
    await user.click(screen.getByRole('button', { name: /Explain This Failure/ }));

    expect(await screen.findByText('AI explanation unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows an error state when the API request itself fails', async () => {
    vi.mocked(api.explainError).mockRejectedValue(new Error('Unable to reach the EnvOps backend.'));
    const socket = createFakeSocket();
    const user = userEvent.setup();

    renderPanel(socket);
    await user.click(screen.getByRole('button', { name: /Explain This Failure/ }));

    expect(await screen.findByText('AI explanation unavailable')).toBeInTheDocument();
  });

  it('triggers a manual explanation on button click', async () => {
    vi.mocked(api.explainError).mockResolvedValue(available);
    const socket = createFakeSocket();
    const user = userEvent.setup();

    renderPanel(socket);

    await user.click(screen.getByRole('button', { name: /Explain This Failure/ }));
    await waitFor(() => {
      expect(api.explainError).toHaveBeenCalledWith('sandbox-42', {
        environmentType: 'Node.js + PostgreSQL on Ubuntu',
      });
    });
  });
});
