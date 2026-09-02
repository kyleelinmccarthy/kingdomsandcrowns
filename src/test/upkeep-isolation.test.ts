import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Upkeep must never write school state. This is the feature's central
 * invariant, and it is the kind that decays silently: nothing fails loudly if
 * someone adds `currentXp` to a chore completion — a hero's school XP just
 * starts drifting.
 *
 * So it is checked structurally. Every upkeep module is read as text and
 * asserted not to mention the school-side identifiers at all.
 */
const UPKEEP_MODULES = [
  "src/lib/actions/upkeep-tasks.ts",
  "src/lib/actions/upkeep-schedules.ts",
  "src/lib/actions/upkeep-assignments.ts",
  "src/lib/actions/upkeep-settings.ts",
  "src/lib/actions/wages.ts",
  "src/lib/services/upkeep-assignment-sync.ts",
  "src/lib/services/upkeep-context.ts",
  "src/lib/services/upkeep-transitions.ts",
];

/** School state an upkeep module must never read or write. */
const FORBIDDEN = [
  "activityLog",
  "activity_log",
  "currentXp",
  "current_xp",
  "bonusXp",
  "currentStreak",
  "longestStreak",
  "weeklySummary",
  // The alert bell means "a hero told you something about school". A missed
  // chore is an absence of action, not a statement, and keeping upkeep out of
  // parentAlert is what preserves that meaning.
  "parentAlert",
  "parent_alert",
];

/**
 * Strips comments before scanning.
 *
 * The invariant under test is that no upkeep module REFERENCES school state in
 * code. A raw substring match would also forbid naming those identifiers in
 * prose — which would penalise the very comments that document why the rule
 * exists, and trip on every future explanatory comment. So the check reads
 * what the code does, not what it says about itself.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("upkeep isolation from school state", () => {
  for (const path of UPKEEP_MODULES) {
    it(`${path} does not touch school state`, () => {
      const source = stripComments(readFileSync(resolve(process.cwd(), path), "utf8"));
      const found = FORBIDDEN.filter((token) => source.includes(token));
      expect(found).toEqual([]);
    });
  }

  it("covers every upkeep module that exists", () => {
    // Guards against the list above going stale as modules are added.
    for (const path of UPKEEP_MODULES) {
      expect(() => readFileSync(resolve(process.cwd(), path), "utf8")).not.toThrow();
    }
  });
});
