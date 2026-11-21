/**
 * The trail drawer (slice 5, R-H9, R-H11): the clues of whole trails, in order, from the pool that
 * credits a skill. Unlike the other drawers it draws a run's tasks together, because a trail is a
 * run of clues told one after another, and so it is a `RunDrawer` (`TASK_RUN_DRAWERS.trail`).
 *
 * Which trails, for `count` clues:
 *
 *   1. The candidates are the pool's trails with none of their clues in `exclude` (an excluded clue
 *      drops its whole trail).
 *   2. They are shuffled in two lists, trails not in `avoid` and trails in `avoid` (met in the hero's
 *      last reading side quests, R-H11), each with the trails near the hero's level first (within one)
 *      and the rest after. `avoid` is used only once every other trail is used.
 *   3. Within a list, whole trails are taken while they fit in what is left of `count`; one that does
 *      not fit is passed over. Then the leading clues of the next untaken trail fill what is left,
 *      before the other list is touched. So at 4, a run uses at most 2 trails.
 *   4. Clues come back in trail order, never more than `count`.
 *
 * Seeded and pure: the `Rng` only, never `Math.random`. A task id names exactly its clue.
 */
import { trailKey, type Trail, type TrailPool } from "@/lib/content/trail-pools";
import { shuffle, type Rng } from "@/lib/utils/drill-generators";
import type { Skill } from "@/lib/utils/skills";
import type { TrailTask } from "../types";
import { trailPoolFor, trailTaskOf } from "./index";

/** A trail is near the hero's level when it is within this many rungs of it. */
const NEAR = 1;

/**
 * `count` clues from `trails` in this order: whole trails that fit while any does, then the leading
 * clues of the next untaken trail. Returns what was taken and how many clues it left over.
 */
function takeFrom(pool: TrailPool, trails: readonly Trail[], count: number): { tasks: TrailTask[]; left: number } {
  const tasks: TrailTask[] = [];
  const taken = new Set<Trail>();
  let left = count;
  for (const trail of trails) {
    if (left <= 0) break;
    if (trail.clues.length > left) continue; // passed over
    trail.clues.forEach((_, i) => tasks.push(trailTaskOf(pool, trail, i)));
    taken.add(trail);
    left -= trail.clues.length;
  }
  const next = left > 0 ? trails.find((t) => !taken.has(t)) : undefined;
  if (next) {
    for (let i = 0; i < left; i++) tasks.push(trailTaskOf(pool, next, i));
    left = 0;
  }
  return { tasks, left };
}

/** The same draw from an explicit pool (what `drawTrailClues` does for the skill's pool, and what the week harness runs). */
export function drawFromPool(pool: TrailPool, level: number, count: number, rng: Rng, exclude: ReadonlySet<string>, avoid: ReadonlySet<string>): TrailTask[] {
  if (count <= 0) return [];
  const candidates = pool.trails.filter((t) => !t.clues.some((_, i) => exclude.has(trailTaskOf(pool, t, i).id)));
  // Four lists shuffled in a fixed order, so one seed is one run.
  const near = (t: Trail): boolean => Math.abs(t.level - level) <= NEAR;
  const fresh = candidates.filter((t) => !avoid.has(trailKey(pool.poolId, t.id)));
  const met = candidates.filter((t) => avoid.has(trailKey(pool.poolId, t.id)));
  const nearFresh = shuffle(fresh.filter(near), rng);
  const farFresh = shuffle(fresh.filter((t) => !near(t)), rng);
  const nearMet = shuffle(met.filter(near), rng);
  const farMet = shuffle(met.filter((t) => !near(t)), rng);

  const first = takeFrom(pool, [...nearFresh, ...farFresh], count);
  if (first.left <= 0) return first.tasks;
  const second = takeFrom(pool, [...nearMet, ...farMet], first.left);
  return [...first.tasks, ...second.tasks];
}

/** `count` clues for a skill from the pool that credits it, or none when no pool does. */
export function drawTrailClues(skill: Skill, level: number, count: number, rng: Rng, exclude: ReadonlySet<string>, avoid: ReadonlySet<string>): TrailTask[] {
  const pool = trailPoolFor(skill.id);
  return pool ? drawFromPool(pool, level, count, rng, exclude, avoid) : [];
}
