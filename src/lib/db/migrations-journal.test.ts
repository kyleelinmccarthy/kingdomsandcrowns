import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * drizzle's libsql migrator keeps ONE high-water mark: it applies every migration whose journal
 * `when` is later than the newest row in `__drizzle_migrations`, and silently skips the rest.
 *
 * Production's mark was moved past our 0021–0023 by another branch's migrations (the
 * excused-days branch's 0021_makeup_days and 0022_parallel_the_spike, last one
 * 2026-09-07T23:27:54.605Z), applied by a branch deploy before production-only migrations were
 * enforced. The main deploy then skipped 0021 (which creates `season`) and failed on 0024's
 * `ALTER TABLE season`. So 0021–0023 are dated just before 0024 — after that mark, still in order.
 */
const journal = JSON.parse(readFileSync(join(process.cwd(), "src/lib/db/migrations/meta/_journal.json"), "utf8")) as {
  entries: { tag: string; when: number }[];
};

/** Newest migration production is known to hold that is not one of ours. */
const PRODUCTION_FOREIGN_MARK = Date.parse("2026-09-07T23:27:54.605Z");

describe("the migration journal", () => {
  it("dates every migration strictly after the one before it", () => {
    for (let i = 1; i < journal.entries.length; i++) {
      expect(journal.entries[i].when, journal.entries[i].tag).toBeGreaterThan(journal.entries[i - 1].when);
    }
  });

  it("dates 0021–0023 after production's foreign high-water mark, so production applies them", () => {
    for (const tag of ["0021_round_the_initiative", "0022_furry_rachel_grey", "0023_blushing_menace"]) {
      const entry = journal.entries.find((e) => e.tag === tag);
      expect(entry, tag).toBeDefined();
      expect(entry!.when, tag).toBeGreaterThan(PRODUCTION_FOREIGN_MARK);
    }
  });
});
