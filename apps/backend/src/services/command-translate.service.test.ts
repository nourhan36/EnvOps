import { describe, expect, it, vi } from "vitest";
import { LlmClient, LlmError } from "../ai/deepseek.client";
import { CommandTranslateService } from "./command-translate.service";

const READY_TEXT = JSON.stringify({
  command: "du -ah /var/log | sort -rh | head -n 10",
  is_destructive: false,
  explanation: "Lists the largest files under /var/log.",
});

function service(complete: LlmClient["complete"]) {
  return new CommandTranslateService({ complete });
}

describe("CommandTranslateService.translate", () => {
  it("returns a ready translation for valid model output", async () => {
    const complete = vi.fn(async () => ({ text: READY_TEXT, model: "deepseek.test" }));
    const result = await service(complete).translate("find big log files");

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.translation.command).toBe(
      "du -ah /var/log | sort -rh | head -n 10",
    );
    expect(result.translation.is_destructive).toBe(false);
    expect(result.model).toBe("deepseek.test");
  });

  it("wraps the intent as untrusted user content", async () => {
    const complete = vi.fn(async () => ({ text: READY_TEXT, model: "m" }));
    await service(complete).translate("list running containers");

    const [input] = complete.mock.calls[0];
    expect(input.systemPrompt).toContain("command translation engine");
    expect(input.userContent).toContain("<user_intent>");
    expect(input.userContent).toContain("list running containers");
  });

  it("retries once with a corrective nudge after invalid JSON", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({
        text: "I put the command in prose instead of JSON",
        model: "m",
      })
      .mockResolvedValueOnce({ text: READY_TEXT, model: "m" });

    const result = await service(complete).translate("show disk usage");

    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.translation.command).toContain("du -ah");
    // The second attempt carries the corrective instruction.
    expect(complete.mock.calls[1][0].userContent).toContain(
      "your previous reply was not valid",
    );
  });

  it("fails after the retry when both attempts are unparseable", async () => {
    const complete = vi
      .fn()
      .mockResolvedValue({ text: "still not json", model: "m" });

    const result = await service(complete).translate("show disk usage");

    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.reason).toBe("bad_response");
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("strips decorated comments from the command before returning it", async () => {
    const decorated = JSON.stringify({
      command: "df -h # disk usage summary",
      is_destructive: false,
      explanation: "Shows disk usage.",
    });
    const complete = vi.fn(async () => ({ text: decorated, model: "m" }));

    const result = await service(complete).translate("check disk space");

    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.translation.command).toBe("df -h");
  });

  it("retries when the model returns a comment instead of a command", async () => {
    const commentOnly = JSON.stringify({
      command: "# this lists files",
      is_destructive: false,
      explanation: "Lists files.",
    });
    const complete = vi
      .fn()
      .mockResolvedValueOnce({ text: commentOnly, model: "m" })
      .mockResolvedValueOnce({ text: READY_TEXT, model: "m" });

    const result = await service(complete).translate("list files");

    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.translation.command.startsWith("#")).toBe(false);
  });

  it("fails after retries when every attempt is comment-only", async () => {
    const commentOnly = JSON.stringify({
      command: "# still not a command",
      is_destructive: false,
      explanation: "nope",
    });
    const complete = vi.fn(async () => ({ text: commentOnly, model: "m" }));

    const result = await service(complete).translate("list files");

    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    // Comment-only commands are rejected as unparseable responses.
    expect(result.reason).toBe("bad_response");
  });

  it("rejects schema violations such as embedded newlines", async () => {
    const multiline = JSON.stringify({
      command: "echo one\necho two",
      is_destructive: false,
      explanation: "two lines",
    });
    const complete = vi.fn(async () => ({ text: multiline, model: "m" }));

    const result = await service(complete).translate("print two lines");

    // Both attempts fail validation (the retry gets the same bad shape here).
    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.reason).toBe("validation");
  });

  it("does not retry transport-level LLM failures", async () => {
    const complete = vi
      .fn()
      .mockRejectedValue(new LlmError("timeout", "LLM request timed out."));

    const result = await service(complete).translate("list files");

    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.retryable).toBe(true);
  });

  it("marks key failures as non-retryable", async () => {
    const complete = vi
      .fn()
      .mockRejectedValue(new LlmError("invalid_key", "Bad key."));

    const result = await service(complete).translate("list files");

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.retryable).toBe(false);
  });
});
