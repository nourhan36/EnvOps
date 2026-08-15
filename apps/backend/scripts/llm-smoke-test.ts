import "dotenv/config";
import { env } from "../src/config/env";
import { DeepSeekClient } from "../src/ai/deepseek.client";
import {
  buildExplainUserContent,
  ERROR_INTERCEPTOR_SYSTEM_PROMPT,
} from "../src/ai/llm.prompt";
import { extractResponseText, parseExplanation } from "../src/ai/llm.response";

/**
 * One-off verification script for the ITI LLM gateway. Prints the raw text
 * returned by the model so the tolerant response parser can be confirmed
 * against the live response shape.
 *
 * Usage: SBG_API_KEY=... npm run llm:smoke
 */
async function main(): Promise<void> {
  if (!env.llmApiKey) {
    console.error("SBG_API_KEY is not set. Add it to the backend .env file.");
    process.exit(1);
  }

  const client = new DeepSeekClient({
    baseUrl: env.llmBaseUrl,
    modelId: env.llmModelId,
    apiKey: env.llmApiKey,
    timeoutMs: env.llmTimeoutMs,
    maxRetries: 0,
  });

  const userContent = buildExplainUserContent({
    command: "npm install",
    stderr: "npm ERR! code ERESOLVE\nnpm ERR! ERESOLVE unable to resolve dependency tree",
    environmentType: "Node.js + PostgreSQL (image node:20)",
  });

  console.log(`Calling ${env.llmBaseUrl}/student/chat with model ${env.llmModelId}...`);

  const { text, model } = await client.complete({
    systemPrompt: ERROR_INTERCEPTOR_SYSTEM_PROMPT,
    userContent,
  });

  console.log(`\n--- Raw model output (${model}) ---\n`);
  console.log(text);

  const parsed = parseExplanation(text);
  console.log("\n--- Parsed ---\n");
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exit(1);
});
