import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { refuseRetry } from "./deed-attempts";
import { ALREADY_ANSWERED, CLOSED, deedErrorLine, HERO_ONLY } from "./deed-refusals";

const four = { answer: "4", choices: ["1", "2", "3", "4"] };

describe("deedErrorLine", () => {
  it("shows our own refusal text when it is one we know", () => {
    expect(deedErrorLine(new Error(ALREADY_ANSWERED))).toBe(ALREADY_ANSWERED);
    expect(deedErrorLine(new Error(CLOSED))).toBe(CLOSED);
    expect(deedErrorLine(new Error(HERO_ONLY))).toBe(HERO_ONLY);
    expect(deedErrorLine(new Error(refuseRetry(four, { first: "1", second: null }, true, "1")!))).toBe("Try a different answer this time.");
  });
  it("maps anything else — a production-redacted message, a non-Error — to one friendly line", () => {
    const redacted = new Error("An error occurred in the Server Components render. The specific message is omitted in production builds.");
    expect(deedErrorLine(redacted)).toBe("That didn't work.");
    expect(deedErrorLine("boom")).toBe("That didn't work.");
    expect(deedErrorLine(new Error("connect ECONNREFUSED"))).not.toMatch(/failed|ECONN/i);
  });
  it("covers every refusal the deed actions throw: none is a literal the mapper can't know", () => {
    const src = readFileSync(join(__dirname, "../actions/deeds.ts"), "utf8");
    expect(src).not.toMatch(/throw new Error\(\s*["'`]/);
  });
});
