/**
 * The week harness (R-I19): how many rune entries a hero meets over a week of rune runs, run against
 * the drawer alone. A test helper, kept out of production code. The database-path version of the
 * same bar (21 completed rune runs, with objects fixed and `runePassOver` skewing the effects) is I11's.
 */
import type { RunePool } from "@/lib/content/rune-pools";
import { drawFromRunePool } from "@/lib/tasks/runes/draw";
import { seededRng } from "@/lib/utils/drill-generators";
import { findSkill } from "@/lib/utils/skills";

/**
 * `runs` successive draws of `perRun` words from `pool` at `level`, one `seed` for the lot, drawn as
 * `pool.skillIds[0]`: the entry keys (`<poolId>/<entryId>`) each run drew, in order, each run avoiding
 * every earlier run's keys. That is what the memory window does (`RUNE_MEMORY_RUNS`, 21 runs = a week
 * of three a day), so a key that turns up twice is a word repeated within the week.
 */
export function simulateRuneWeek(pool: RunePool, level: number, seed: number, perRun = 3, runs = 21): string[][] {
  const rng = seededRng(seed);
  const skill = findSkill(pool.skillIds[0]);
  if (!skill) throw new Error(`${pool.poolId} credits no catalog skill first`);
  const avoid = new Set<string>();
  const week: string[][] = [];
  for (let run = 0; run < runs; run++) {
    const keys = drawFromRunePool(pool, skill.id, level, perRun, rng, new Set(), avoid).map((t) => t.entry);
    week.push(keys);
    for (const key of keys) avoid.add(key);
  }
  return week;
}
