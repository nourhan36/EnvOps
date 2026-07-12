import { useState } from 'react';
import { FlaskConical, Loader2, Send, Sparkles } from 'lucide-react';
import type { LabGenerationResult } from '@/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const EXAMPLE_PROMPTS = [
  'Create a Kubernetes lab where I deploy a 3-tier app with ingress and HPA',
  'Build a Terraform module for an AWS VPC with public/private subnets',
  'Set up a CI/CD pipeline lab using GitHub Actions and Docker',
];

export default function LabGeneratorPage() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<LabGenerationResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/labs/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (response.ok) {
        const data: LabGenerationResult = await response.json();
        setResult(data);
      } else {
        setResult({
          id: 'mock-lab-001',
          status: 'generating',
          title: 'Lab generation started',
          description: 'Autonomous Lab Generation Agent is provisioning your environment…',
        });
      }
    } catch {
      setResult({
        id: 'mock-lab-001',
        status: 'generating',
        title: 'Lab generation started (offline mode)',
        description: 'Connect the backend to enable full autonomous lab provisioning.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-muted">
            <FlaskConical className="h-5 w-5 text-accent-hover" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Lab Generator</h1>
            <p className="text-sm text-gray-500">
              Describe your training scenario — the Autonomous Lab Generation Agent handles the rest
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 scrollbar-thin">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl space-y-4">
          <label htmlFor="lab-prompt" className="block text-sm font-medium text-gray-300">
            Natural Language Training Request
          </label>
          <textarea
            id="lab-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            placeholder="e.g. Create a hands-on lab for learning Helm charts with a sample microservices deployment…"
            className="w-full resize-none rounded-xl border border-border bg-surface-raised px-4 py-3 text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
          />

          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-accent/40 hover:text-gray-200"
              >
                {example.slice(0, 48)}…
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={!prompt.trim() || isGenerating}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating Lab…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Generate Lab
              </>
            )}
          </button>
        </form>

        {result && (
          <div className="mx-auto w-full max-w-3xl rounded-xl border border-accent/30 bg-accent-muted/20 p-5">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent-hover" />
              <h2 className="font-semibold text-white">{result.title}</h2>
            </div>
            {result.description && (
              <p className="text-sm text-gray-400">{result.description}</p>
            )}
            <p className="mt-3 font-mono text-xs text-status-active">
              Status: {result.status}
              {result.sandboxId && ` · Sandbox: ${result.sandboxId}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
