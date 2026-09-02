import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
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
    // The negative lookbehind keeps a `//` preceded by `:` intact, so a
    // scheme-relative or absolute URL inside a string literal (e.g.
    // "http://api.example.com") survives instead of swallowing the rest of
    // its line — including any real violation sitting after it.
    .replace(/(?<!:)\/\/.*$/gm, "");
}

describe("upkeep isolation from school state", () => {
  for (const path of UPKEEP_MODULES) {
    it(`${path} does not touch school state`, () => {
      const source = stripComments(readFileSync(resolve(process.cwd(), path), "utf8"));
      const found = FORBIDDEN.filter((token) => source.includes(token));
      expect(found).toEqual([]);
    });
  }

  it("scans every upkeep module on disk — a new one must be added to the list", () => {
    // The hardcoded list above is what actually gets scanned, so a new upkeep
    // module that nobody adds to it would be silently unprotected. This finds
    // them on disk instead, so forgetting shows up as a failing test.
    const discovered: string[] = [];
    for (const dir of ["src/lib/actions", "src/lib/services"]) {
      for (const file of readdirSync(resolve(process.cwd(), dir))) {
        if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
        if (file.startsWith("upkeep-") || file === "wages.ts") {
          discovered.push(`${dir}/${file}`);
        }
      }
    }
    expect(discovered.sort()).toEqual([...UPKEEP_MODULES].sort());
  });
});
