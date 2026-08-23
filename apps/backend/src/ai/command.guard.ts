/**
 * Server-side safety net scanned over every LLM-translated command before it
 * reaches the client. The prompt already instructs the model to avoid these,
 * but the model output is untrusted: this rejects catastrophic or
 * container-escape patterns regardless of what the model returned.
 *
 * Commands run inside an ephemeral sandbox pod, so most of these cannot harm
 * the host - they are rejected because they are never a faithful translation
 * of a legitimate intent and indicate prompt abuse.
 */
interface DenyRule {
  id: string;
  message: string;
  pattern: RegExp;
}

const DENY_RULES: DenyRule[] = [
  {
    id: "fork-bomb",
    message: "Fork bombs are not allowed.",
    // Classic ":(){ :|:& };:" and brace-style ":{ :|:& };:" variants: a shell
    // function whose body pipes itself into a background process, looping.
    pattern: /(?:\(\s*\))?\{[^{}]*\|[^{}]*&[^{}]*\}\s*;\s*:/,
  },
  {
    id: "wipe-root",
    message: "Commands that delete filesystem roots are not allowed.",
    // "rm" with recursive/force flags anywhere on the line targeting a bare
    // "/" or glob root ("/*"). Forward-scanning lookaheads keep flag/target
    // order flexible while allowing paths like /tmp/cache or ./build.
    pattern: /\brm\b(?=[^;&|]*\s-{1,2}[a-zA-Z]*[rf][a-zA-Z]*(?:\s|$))(?=[^;&|]*(?:^|\s)(?:\/\*|\*(?![\w.-])|\/(?![\w.{,-]))(?:\s|$))/,
  },
  {
    id: "format-disk",
    message: "Disk formatting commands are not allowed.",
    pattern: /\bmkfs(?:\.[a-z0-9]+)?\b/,
  },
  {
    id: "raw-device-write",
    message: "Writing to raw devices is not allowed.",
    pattern:
      /(?:\bdd\b[^;&|]*of=\/dev\/|>\s*\/dev\/(?:sd[a-z]|nvme|hd[a-z]|vda)|shred\s+[^;&|]*\/dev\/)/,
  },
  {
    id: "host-mount",
    message: "Host filesystem or container escape attempts are not allowed.",
    pattern:
      /\b(nsenter|unshare|chroot\b|mount[^;&|]*\/host|\/proc\/1\/root|\/proc\/sys\/kernel)\b/,
  },
  {
    id: "remote-script-exec",
    message: "Piping remote scripts into a shell is not allowed.",
    pattern:
      /\b(curl|wget)\b[^;&|]*\|\s*(?:sudo\s+)?(ba|z|da)?sh\b|\bbase64\s+-d\b[^;&|]*\|\s*(?:sudo\s+)?(ba|z|da)?sh\b/,
  },
  {
    id: "chmod-root",
    message: "Recursive permission changes on / are not allowed.",
    pattern: /\bchmod\s+(?:-{1,2}[a-zA-Z-]+\s+)*-R\s+[0-7]{3,4}\s+\/(?:\s|$)/,
  },
];

export interface UnsafeCommandResult {
  safe: false;
  ruleId: string;
  message: string;
}

export type CommandSafetyResult =
  | { safe: true }
  | UnsafeCommandResult;

export function scanCommandSafety(command: string): CommandSafetyResult {
  for (const rule of DENY_RULES) {
    if (rule.pattern.test(command)) {
      return { safe: false, ruleId: rule.id, message: rule.message };
    }
  }

  return { safe: true };
}
