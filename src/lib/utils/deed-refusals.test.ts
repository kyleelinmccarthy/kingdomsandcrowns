import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { refuseRetry } from "./deed-attempts";
import {
  ALREADY_ANSWERED, BUILD_HERO_ONLY, CLOSED, deedErrorLine, HERO_ONLY, RUNE_FIXED, RUNE_HERO_ONLY, RUNES_OFF, TOWER_SHUT, WORLD_HERO_ONLY, WORLD_LOCKS_OFF, WORLD_OPEN,
} from "./deed-refusals";

const four = { id: "add-10:2:2", skillId: "add-10", prompt: "2 + 2 = ?", answer: "4", choices: ["1", "2", "3", "4"] };

describe("deedErrorLine", () => {
  it("shows our own refusal text when it is one we know", () => {
    expect(deedErrorLine(new Error(ALREADY_ANSWERED))).toBe(ALREADY_ANSWERED);
    expect(deedErrorLine(new Error(CLOSED))).toBe(CLOSED);
    expect(deedErrorLine(new Error(HERO_ONLY))).toBe(HERO_ONLY);
    expect(deedErrorLine(new Error(BUILD_HERO_ONLY))).toBe("Building is for the hero to do.");
    expect(deedErrorLine(new Error("Only the hero can choose what to build."))).toBe("Only the hero can choose what to build.");
    expect(deedErrorLine(new Error(refuseRetry(four, { first: "1", second: null }, true, "1")!))).toBe("Try a different answer this time.");
  });
  it("shows the world's lock refusals word for word (Part G)", () => {
    expect(deedErrorLine(new Error(WORLD_HERO_ONLY))).toBe("Locks are for the hero to open.");
    expect(deedErrorLine(new Error(WORLD_OPEN))).toBe("That's already open.");
    expect(deedErrorLine(new Error(WORLD_LOCKS_OFF))).toBe("The locks are resting for now.");
    expect(deedErrorLine(new Error(TOWER_SHUT))).toBe("That floor isn't open yet.");
  });
  it("shows the rune refusals word for word (Part I)", () => {
    expect(deedErrorLine(new Error(RUNE_HERO_ONLY))).toBe("Runes are for the hero to cast.");
    expect(deedErrorLine(new Error(RUNES_OFF))).toBe("The runes are resting for now.");
    expect(deedErrorLine(new Error(RUNE_FIXED))).toBe("That rune still holds.");
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
