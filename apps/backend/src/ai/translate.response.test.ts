import { describe, expect, it } from "vitest";
import {
  extractTranslationJson,
  normalizeTranslatedCommand,
  stripTrailingComment,
  TranslationParseError,
} from "./translate.response";

const VALID = JSON.stringify({
  command: "du -ah /var/log | sort -rh | head -n 10",
  is_destructive: false,
  explanation: "Lists the largest files.",
});

describe("extractTranslationJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractTranslationJson(VALID)).toEqual(JSON.parse(VALID));
  });

  it("parses JSON inside a markdown fence", () => {
    const fenced = "```json\n" + VALID + "\n```";
    expect(extractTranslationJson(fenced)).toEqual(JSON.parse(VALID));
  });

  it("parses JSON wrapped in prose", () => {
    const wrapped = `Here is the command:\n${VALID}\nLet me know if you need anything else.`;
    expect(extractTranslationJson(wrapped)).toEqual(JSON.parse(VALID));
  });

  it("throws on empty input", () => {
    expect(() => extractTranslationJson("   ")).toThrow(TranslationParseError);
  });

  it("throws when no JSON object exists", () => {
    expect(() => extractTranslationJson("no json here")).toThrow(
      TranslationParseError,
    );
  });

  it("throws on malformed JSON", () => {
    expect(() => extractTranslationJson("{ command: oops }")).toThrow(
      TranslationParseError,
    );
  });
});

describe("stripTrailingComment", () => {
  const stripped: Array<[string, string]> = [
    ["df -h # disk usage summary", "df -h"],
    ["ls -la   ## list everything", "ls -la"],
    ["# just a comment", ""],
    ["ps aux | grep '[n]ode' # running node procs", "ps aux | grep '[n]ode'"],
    ['grep "path # not comment" file.txt', 'grep "path # not comment" file.txt'],
    ["echo '#tag' # show tag", "echo '#tag'"],
    ["x=${1#-} # strip dash", "x=${1#-}"],
  ];

  it.each(stripped)("strips %s -> %s", (input, expected) => {
    expect(stripTrailingComment(input)).toBe(expected);
  });

  const preserved: string[] = [
    "grep '#' secrets.txt",
    "echo keep ${PATH##*/}",
    "curl -H 'X-Tag: #anchor' https://example.com",
  ];

  it.each(preserved)("preserves hashes in %s", (command) => {
    expect(stripTrailingComment(command)).toBe(command);
  });
});

describe("normalizeTranslatedCommand", () => {
  it("unwraps markdown code fences around the command", () => {
    expect(normalizeTranslatedCommand("```bash\ndf -h\n```")).toBe("df -h");
    expect(normalizeTranslatedCommand("`ls -la`")).toBe("ls -la");
  });

  it("returns empty when only a comment remains after stripping", () => {
    expect(normalizeTranslatedCommand("# nothing but commentary")).toBe("");
    expect(normalizeTranslatedCommand("du -h # sizes")).toBe("du -h");
  });
});
