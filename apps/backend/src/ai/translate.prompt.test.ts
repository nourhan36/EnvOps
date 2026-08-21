import { describe, expect, it } from "vitest";
import {
  buildTranslateUserContent,
  COMMAND_TRANSLATE_SYSTEM_PROMPT,
  sanitizeForGateway,
} from "./translate.prompt";

describe("sanitizeForGateway", () => {
  it("splits combined rm flags that trip the gateway WAF", () => {
    expect(sanitizeForGateway("rm -rf /")).toBe("rm -r -f /");
    expect(sanitizeForGateway("rm -fr ./build")).toBe("rm -f -r ./build");
    expect(sanitizeForGateway("sudo rm -RF node_modules")).toBe(
      "sudo rm -R -F node_modules",
    );
  });

  it("leaves non-matching commands untouched", () => {
    expect(sanitizeForGateway("rm file.txt")).toBe("rm file.txt");
    expect(sanitizeForGateway("rm -r folder")).toBe("rm -r folder");
    expect(sanitizeForGateway("ls -la && confirm")).toBe("ls -la && confirm");
  });

  it("is case-insensitive", () => {
    expect(sanitizeForGateway("RM -RF /tmp/x")).toBe("RM -R -F /tmp/x");
  });
});

describe("translate prompt", () => {
  it("does not contain literal WAF trigger signatures", () => {
    expect(COMMAND_TRANSLATE_SYSTEM_PROMPT).not.toMatch(/rm\s+-[a-z]*[rf]/i);
  });

  it("wraps the intent as untrusted user content", () => {
    const content = buildTranslateUserContent("list files");
    expect(content).toContain("<user_intent>");
    expect(content).toContain("</user_intent>");
    expect(buildTranslateUserContent("  show disk usage  ")).toContain(
      "show disk usage",
    );
  });
});
