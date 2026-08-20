import type { Sandbox } from '@/types';

/** The container image actually running for a sandbox (dynamic images have no template). */
export function sandboxImage(sandbox: Sandbox): string {
  return sandbox.dockerImage ?? sandbox.template?.dockerImage ?? 'unknown';
}

/** A human-friendly title: the template display name, or the image for prompt-created sandboxes. */
export function sandboxDisplayName(sandbox: Sandbox): string {
  return sandbox.template?.displayName ?? sandbox.dockerImage ?? 'Sandbox';
}