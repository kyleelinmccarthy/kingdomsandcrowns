/**
 * The week harness (F-21): how many trails a hero meets over a week of reading side quests, run
 * against the drawer alone. A test helper, kept out of production code. The database-path version of
 * the same bar (7 days of three reading side quests a day) is H7's.
 */
import type { TrailPool } from "@/lib/content/trail-pools";
import { drawFromPool } from "@/lib/tasks/trails/draw";
import { seededRng } from "@/lib/utils/drill-generators";

/**
 * `runs` successive draws of `perRun` clues from `pool` at `level`, one `seed` for the lot: the trail
 * keys (`<poolId>/<trailId>`) each run drew, in order, each run avoiding every earlier run's keys. That
 * is what the memory window does (`TRAIL_MEMORY_RUNS`, 21 runs = a week of three a day), so a key that
 * turns up twice is a trail repeated within the week.
 */
export function simulateTrailWeek(pool: TrailPool, level: number, seed: number, perRun: number, runs = 21): string[][] {
  const rng = seededRng(seed);
  const avoid = new Set<string>();
  const week: string[][] = [];
  for (let run = 0; run < runs; run++) {
    const keys = [...new Set(drawFromPool(pool, level, perRun, rng, new Set(), avoid).map((t) => t.trail))];
    week.push(keys);
    for (const key of keys) avoid.add(key);
  }
  return week;
}
