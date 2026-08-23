/**
 * Extracts the translated-command JSON from the raw LLM text. The model is
 * instructed to return only JSON, but it frequently wraps it in markdown
 * fences or prose, so this tolerates those shapes while rejecting
 * empty/invalid payloads.
 */
export class TranslationParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationParseError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function extractTranslationJson(text: string): unknown {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new TranslationParseError("The model returned an empty response.");
  }

  // Strip a single markdown code fence if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    return parseJson(fenced[1], "fenced code block");
  }

  // The model may wrap the JSON in prose; pull the first balanced JSON object.
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    return parseJson(trimmed.slice(objectStart, objectEnd + 1), "JSON object");
  }

  throw new TranslationParseError(
    "No JSON object was found in the model output.",
  );
}

function parseJson(raw: string, source: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new TranslationParseError(
      `The ${source} in the model output is not valid JSON.`,
    );
  }
}

/**
 * Removes an unquoted trailing shell comment ("cmd  # note") while leaving
 * hashes inside quotes or parameter expansions intact ('grep #' file',
 * ${var#prefix}, echo '#tag'). A hash only counts as a comment when it starts
 * the line or is preceded by whitespace outside any quoting.
 */
export function stripTrailingComment(command: string): string {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (ch === '"' && !inSingle && (i === 0 || command[i - 1] !== "\\")) {
      inDouble = !inDouble;
      continue;
    }

    if (ch === "#" && !inSingle && !inDouble) {
      const prev = i === 0 ? "" : command[i - 1];
      if (prev === "" || /\s/.test(prev)) {
        return command.slice(0, i).trimEnd();
      }
    }
  }

  return command;
}

/**
 * Normalizes a raw model-produced command before schema validation:
 * unwraps stray markdown backticks and strips trailing comments.
 * Returns an empty string when nothing executable remains (e.g. the whole
 * value was just a comment), which callers treat as a parse failure so the
 * corrective retry kicks in.
 */
export function normalizeTranslatedCommand(rawCommand: string): string {
  let command = rawCommand.trim();

  const wrapped = command.match(/^(?:```(?:bash|sh|shell)?|`)([\s\S]*?)(?:```|`)$/);
  if (wrapped) {
    command = wrapped[1].trim();
  }

  return stripTrailingComment(command);
}
