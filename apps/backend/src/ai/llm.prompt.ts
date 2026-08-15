export interface ExplainContext {
  command: string;
  stderr: string;
  environmentType: string;
  /**
   * Reserved extension point for the future RAG layer. When vectorized docs
   * + sandbox metadata are available, inject retrieved snippets here so they
   * are surfaced to the model before the error output.
   */
  ragContext?: string;
}

export const ERROR_INTERCEPTOR_SYSTEM_PROMPT = [
  "You are a Linux/DevOps troubleshooting assistant for ephemeral Kubernetes sandbox environments.",
  "A developer ran a command in a sandbox terminal and it failed.",
  "Diagnose the exact error and provide a concise, actionable fix.",
  "Rules:",
  "- Return only Markdown with exactly two sections, using the headings '## Diagnosis' and '## Suggested Fix'.",
  "- Be specific to the command and environment provided. Do not give generic filler or ask clarifying questions.",
  "- Keep each section short (a few sentences). Use code blocks only when a shell command is part of the fix.",
].join("\n");

export function buildExplainUserContent(context: ExplainContext): string {
  const sections: string[] = [
    `## Environment\n${context.environmentType || "Unknown sandbox template"}`,
    `## Command\n${context.command || "(unknown)"}`,
    `## Error Output\n${context.stderr || "(no error output captured)"}`,
  ];

  const rag = context.ragContext?.trim();

  if (rag) {
    sections.push(`## RAG Context\n${rag}`);
  }

  return sections.join("\n\n");
}

export function buildExplainMessages(context: ExplainContext) {
  return [
    {
      role: "user",
      content: buildExplainUserContent(context),
    },
  ];
}
