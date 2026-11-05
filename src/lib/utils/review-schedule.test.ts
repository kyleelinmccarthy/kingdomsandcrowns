import { describe, it, expect } from "vitest";
import { REVIEW, dueSkills, overdueSkills } from "./review-schedule";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
const row = (skillId: string, level: number, daysAgo: number | null) => ({
  skillId, level, lastPracticedAt: daysAgo === null ? null : NOW - daysAgo * DAY,
});
const ids = ["a", "b", "c", "d"];

describe("REVIEW", () => {
  it("pins the spec's numbers", () => {
    expect(REVIEW.maxDue).toBe(2);
    expect(REVIEW.maxTotal).toBe(3);
    expect([...REVIEW.intervalDays]).toEqual([Infinity, 2, 4, 7, 14]);
  });
});

describe("dueSkills", () => {
  it("never calls a level-0 skill due", () => {
    expect(dueSkills([row("a", 0, 400)], ids, [], NOW)).toEqual([]);
  });
  it("is due once the level's interval has passed, and not before", () => {
    expect(dueSkills([row("a", 2, 3)], ids, [], NOW)).toEqual([]);
    expect(dueSkills([row("a", 2, 4)], ids, [], NOW)).toEqual(["a"]);
    expect(dueSkills([row("a", 1, 2)], ids, [], NOW)).toEqual(["a"]);
    expect(dueSkills([row("a", 4, 13)], ids, [], NOW)).toEqual([]);
    expect(dueSkills([row("a", 4, 14)], ids, [], NOW)).toEqual(["a"]);
  });
  it("never calls a skill with no practice date due", () => {
    expect(dueSkills([row("a", 3, null)], ids, [], NOW)).toEqual([]);
  });
  it("only offers candidates, and skips the excluded", () => {
    const rows = [row("a", 1, 9), row("b", 1, 9), row("zzz", 1, 9)];
    expect(dueSkills(rows, ["a", "b"], ["a"], NOW)).toEqual(["b"]);
  });
  it("puts the most overdue first (elapsed over interval)", () => {
    // a: 4/2 = 2.0, b: 14/7 = 2.0 -> tie keeps row order; c: 12/2 = 6 first.
    const rows = [row("a", 1, 4), row("c", 1, 12), row("b", 3, 14)];
    expect(dueSkills(rows, ids, [], NOW)).toEqual(["c", "a"]);
  });
  it("caps at the most that can come back", () => {
    const rows = [row("a", 1, 9), row("b", 1, 8), row("c", 1, 7), row("d", 1, 6)];
    expect(dueSkills(rows, ids, [], NOW)).toEqual(["a", "b"]);
  });
});

describe("overdueSkills", () => {
  it("is the same ordered list with no cap", () => {
    const rows = [row("a", 1, 9), row("b", 1, 8), row("c", 1, 7), row("d", 1, 6)];
    expect(overdueSkills(rows, ids, [], NOW)).toEqual(["a", "b", "c", "d"]);
    expect(dueSkills(rows, ids, [], NOW)).toEqual(overdueSkills(rows, ids, [], NOW).slice(0, REVIEW.maxDue));
  });
});
