import { describe, expect, it } from "vitest";
import { extractResponseText, parseExplanation } from "./llm.response";

describe("extractResponseText", () => {
  it("handles OpenAI-compatible shape", () => {
    const raw = {
      choices: [{ message: { role: "assistant", content: "## Diagnosis\ntext" } }],
    };
    expect(extractResponseText(raw)).toBe("## Diagnosis\ntext");
  });

  it("handles a data wrapper", () => {
    expect(extractResponseText({ data: { output: "hello" } })).toBe("hello");
    expect(extractResponseText({ data: { message: { content: "world" } } })).toBe("world");
  });

  it("handles top-level aliases", () => {
    expect(extractResponseText({ response: "a" })).toBe("a");
    expect(extractResponseText({ answer: "b" })).toBe("b");
  });

  it("handles a nested result wrapper", () => {
    expect(extractResponseText({ result: { content: "c" } })).toBe("c");
  });

  it("handles the ITI gateway output_text shape", () => {
    expect(extractResponseText({ output_text: "boom" })).toBe("boom");
    expect(extractResponseText({ data: { output_text: "deep" } })).toBe("deep");
  });

  it("handles a bare string", () => {
    expect(extractResponseText("plain")).toBe("plain");
  });

  it("returns empty string for unknown shapes", () => {
    expect(extractResponseText({})).toBe("");
    expect(extractResponseText(null)).toBe("");
    expect(extractResponseText(42)).toBe("");
  });
});

describe("parseExplanation", () => {
  it("splits the two constrained sections", () => {
    const parsed = parseExplanation(
      "## Diagnosis\nPort 5432 is already bound.\n\n## Suggested Fix\n```bash\nkill $(lsof -t -i:5432)\n```\n",
    );
    expect(parsed.explanation).toBe("Port 5432 is already bound.");
    expect(parsed.suggestedFix).toContain("kill $(lsof -t -i:5432)");
  });

  it("returns the whole response as explanation when headings are missing", () => {
    const parsed = parseExplanation("Something failed. Try again.");
    expect(parsed.explanation).toBe("Something failed. Try again.");
    expect(parsed.suggestedFix).toBe("");
  });
});
