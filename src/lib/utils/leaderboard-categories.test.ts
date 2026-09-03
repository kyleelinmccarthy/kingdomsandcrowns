import { describe, it, expect } from "vitest";
import {
  LEADERBOARD_CATEGORIES,
  type LeaderboardCategory,
} from "./leaderboard-categories";

const ALL: LeaderboardCategory[] = ["xp", "streak", "longestStreak", "badges", "upkeep"];

describe("LEADERBOARD_CATEGORIES", () => {
  it("configures every category", () => {
    expect(Object.keys(LEADERBOARD_CATEGORIES).sort()).toEqual([...ALL].sort());
  });

  it("ranks chore XP by upkeepXp and school XP by currentXp — never the same column", () => {
    // The whole point of a separate Steward's Renown board: chore XP must not
    // be ranked by, or contribute to, the school XP column.
    expect(LEADERBOARD_CATEGORIES.upkeep.rankBy).toBe("upkeepXp");
    expect(LEADERBOARD_CATEGORIES.xp.rankBy).toBe("currentXp");
  });

  it("gives every ranking category its own distinct column", () => {
    const columns = ALL.map((c) => LEADERBOARD_CATEGORIES[c].rankBy).filter(Boolean);
    expect(new Set(columns).size).toBe(columns.length);
  });

  it("treats badges as the one aggregate category with no rank column", () => {
    expect(LEADERBOARD_CATEGORIES.badges.rankBy).toBeNull();
    const aggregates = ALL.filter((c) => LEADERBOARD_CATEGORIES[c].rankBy === null);
    expect(aggregates).toEqual(["badges"]);
  });

  it("applies the positive-only filter to upkeep alone", () => {
    // Scoping matters both ways. Without it on upkeep, every family that never
    // enabled chores pads the board with zeroes. With it on any OTHER category,
    // children currently on those boards would silently vanish from them.
    const filtered = ALL.filter((c) => LEADERBOARD_CATEGORIES[c].onlyPositive);
    expect(filtered).toEqual(["upkeep"]);
  });

  it("never ranks by a money column", () => {
    // The community board spans families; ranking children by household money
    // is out of bounds. XP only.
    const columns = ALL.map((c) => LEADERBOARD_CATEGORIES[c].rankBy ?? "");
    expect(columns.some((c) => /cents|wage|balance/i.test(c))).toBe(false);
  });
});
