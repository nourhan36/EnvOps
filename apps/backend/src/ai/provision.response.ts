/**
 * Extracts the provisioning parameters JSON from the raw LLM text. The model
 * is instructed to return only JSON, but it frequently wraps it in markdown
 * fences or prose, so this tolerates those shapes while rejecting
 * empty/invalid payloads.
 */
export class ProvisionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisionParseError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function extractProvisionJson(text: string): unknown {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new ProvisionParseError("The model returned an empty response.");
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

  throw new ProvisionParseError("No JSON object was found in the model output.");
}

function parseJson(raw: string, source: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new ProvisionParseError(`The ${source} in the model output is not valid JSON.`);
  }
}