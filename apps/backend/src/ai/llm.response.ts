export interface ParsedExplanation {
  explanation: string;
  suggestedFix: string;
}

/**
 * Extracts the assistant text from a raw gateway response. The ITI gateway's
 * response shape is not documented (the reference client just prints the JSON),
 * so this tolerates the common wrappers used by OpenAI-compatible and generic
 * chat gateways:
 *
 *  - { choices: [{ message: { content } }] }
 *  - { output_text } (ITI gateway)
 *  - { data: { output | response | content | message.content } }
 *  - { output | response | text | answer | content }
 *  - a bare string
 */
export function extractResponseText(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const text = extractResponseText(item);
      if (text) {
        return text;
      }
    }
    return "";
  }

  if (typeof raw !== "object" || raw === null) {
    return "";
  }

  const record = raw as Record<string, unknown>;

  // OpenAI-compatible: choices[0].message.content
  if (Array.isArray(record.choices)) {
    const first = record.choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    if (typeof message?.content === "string") {
      return message.content;
    }
    if (typeof first?.text === "string") {
      return first.text;
    }
  }

  // Common OpenAI-adjacent aliases on the top-level object.
  for (const key of ["content", "text", "response", "output", "output_text", "answer"]) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }

  // data wrapper.
  const data = record.data as Record<string, unknown> | undefined;
  if (data && typeof data === "object") {
    for (const key of ["content", "text", "response", "output", "output_text"]) {
      const value = data[key];
      if (typeof value === "string") {
        return value;
      }
    }
    const message = data.message as Record<string, unknown> | undefined;
    if (message && typeof message.content === "string") {
      return message.content;
    }
  }

  // Nested result wrapper.
  const result = record.result as Record<string, unknown> | undefined;
  if (result && typeof result === "object") {
    if (typeof result.content === "string") {
      return result.content;
    }
    if (typeof result.text === "string") {
      return result.text;
    }
    if (typeof result.output_text === "string") {
      return result.output_text;
    }
  }

  return "";
}

function splitByHeading(text: string, heading: string): string | undefined {
  const match = text.match(new RegExp(`##\\s*${heading}\\s*\\n+([\\s\\S]*?)(?=\\n+##\\s|$)`));

  if (!match) {
    return undefined;
  }

  const section = match[1].trim();

  return section || undefined;
}

/**
 * Splits the model output into the two constrained sections. The model is
 * instructed to produce exactly '## Diagnosis' and '## Suggested Fix'. If the
 * headings are missing (e.g. the model free-texted), the whole response is
 * treated as the explanation and the suggested fix is left empty rather than
 * dropping useful content.
 */
export function parseExplanation(text: string): ParsedExplanation {
  const clean = text.trim();

  const diagnosis = splitByHeading(clean, "Diagnosis");
  const suggestedFix = splitByHeading(clean, "Suggested Fix");

  if (diagnosis !== undefined || suggestedFix !== undefined) {
    return {
      explanation: diagnosis ?? "",
      suggestedFix: suggestedFix ?? "",
    };
  }

  return {
    explanation: clean,
    suggestedFix: "",
  };
}
