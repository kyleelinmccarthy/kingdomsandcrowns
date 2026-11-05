import { describe, expect, it } from "vitest";
import { GRADES } from "./grade-levels";
import { GENERIC_HINT, hintFor, SKILL_HINTS } from "./skill-hints";
import { SKILLS, skillsFor } from "./skills";

// Whole words only, so "already" or "leveled-off" style substrings do not trip the guard.
const BANNED = ["behind", "ahead", "level", "grade", "rung", "review", "failed"];
const bannedRe = new RegExp(`\\b(${BANNED.join("|")})\\b`, "i");

const servable = SKILLS.filter((s) => GRADES.some((g) => skillsFor(s.area, g).some((x) => x.id === s.id)));

describe("skill hints", () => {
  it("covers every servable skill", () => {
    expect(servable.filter((s) => !SKILL_HINTS[s.id]).map((s) => s.id)).toEqual([]);
  });

  it.each(servable.map((s) => [s.id] as const))("%s has a short, safe, specific hint", (id) => {
    const hint = SKILL_HINTS[id];
    expect(hint).toBeTruthy();
    expect(hint).not.toBe(GENERIC_HINT);
    expect(hint.length).toBeLessThanOrEqual(160);
    expect(hint).not.toMatch(bannedRe);
    expect(hint).not.toMatch(/\d/); // a digit would be a fact from some question
  });

  it("has no hint for an id that is not a skill", () => {
    const ids = new Set(SKILLS.map((s) => s.id));
    expect(Object.keys(SKILL_HINTS).filter((k) => !ids.has(k))).toEqual([]);
  });

  it("falls back to the generic hint, which obeys the same rules", () => {
    expect(hintFor("no-such-skill")).toBe(GENERIC_HINT);
    expect(hintFor("mul-facts")).toBe(SKILL_HINTS["mul-facts"]);
    expect(GENERIC_HINT.length).toBeLessThanOrEqual(160);
    expect(GENERIC_HINT).not.toMatch(bannedRe);
  });

  it("the banned-word guard matches whole words only", () => {
    expect(bannedRe.test("Look ahead.")).toBe(true);
    expect(bannedRe.test("Next Grade!")).toBe(true);
    expect(bannedRe.test("Bring it to the stand already")).toBe(false);
  });
});
