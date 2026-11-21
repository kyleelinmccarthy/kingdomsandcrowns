/**
 * The rune drawer (slice 6, R-I19, R-I22): the words of a rune run, from the pool that credits a skill,
 * spread over the effects. It draws a run's tasks together, so it is a `RunDrawer`
 * (`TASK_RUN_DRAWERS.rune`); one task is the same draw at a count of one.
 *
 * Which entries, for `count` words:
 *
 *   1. The candidates are the pool's entries whose task id is not in `exclude`.
 *   2. An entry is fresh when its `runeKey` is not in `avoid` (met in the hero's last rune runs, R-I19),
 *      and near when its level is within one of the hero's.
 *   3. The effects are shuffled, then stably sorted: effects whose `effectKey` is not in `avoid` first
 *      (an effect with no broken object to bind to is passed over, R-I22), then by how many fresh
 *      candidates each has, most first. So a week of runs spreads its words over all five.
 *   4. Each of `count` slots takes the next effect in that order, cycling, and that effect's first
 *      untaken entry in tier order: near and fresh, far and fresh, near and met, far and met, each tier
 *      shuffled once. An effect with none left passes to the next.
 *
 * At most `count` tasks, in slot order. Seeded and pure: the `Rng` only, never `Math.random`.
 */
import { effectKey, runeKey, type RuneEntry, type RunePool } from "@/lib/content/rune-pools";
import { RUNE_EFFECT_IDS, type RuneEffect } from "@/lib/realm/rune-objects";
import { shuffle, type Rng } from "@/lib/utils/drill-generators";
import type { Skill } from "@/lib/utils/skills";
import type { RuneTask } from "../types";
import { runePoolFor, runeTaskId, runeTaskOf } from "./index";

export { fallbackTiles, shuffleTiles } from "@/lib/content/rune-pools";

/** An entry is near the hero's level when it is within this many rungs of it. */
const NEAR = 1;

/** One effect's entries in the order they are taken: near and fresh, far and fresh, near and met, far and met, each tier shuffled. */
function tiersOf(pool: RunePool, entries: readonly RuneEntry[], level: number, rng: Rng, avoid: ReadonlySet<string>): RuneEntry[] {
  const near = (e: RuneEntry): boolean => Math.abs(e.level - level) <= NEAR;
  const met = (e: RuneEntry): boolean => avoid.has(runeKey(pool.poolId, e.id));
  const fresh = entries.filter((e) => !met(e));
  const seen = entries.filter(met);
  return [...shuffle(fresh.filter(near), rng), ...shuffle(fresh.filter((e) => !near(e)), rng), ...shuffle(seen.filter(near), rng), ...shuffle(seen.filter((e) => !near(e)), rng)];
}

/** The same draw from an explicit pool, as `skillId` (what `drawRuneWords` does for the skill's pool, and what the week harness runs). */
export function drawFromRunePool(pool: RunePool, skillId: string, level: number, count: number, rng: Rng, exclude: ReadonlySet<string>, avoid: ReadonlySet<string>): RuneTask[] {
  if (count <= 0) return [];
  const candidates = pool.entries.filter((e) => !exclude.has(runeTaskId(pool, e, skillId)));
  const freshOf = (effect: RuneEffect): number => candidates.filter((e) => e.effect === effect && !avoid.has(runeKey(pool.poolId, e.id))).length;
  const passedOver = (effect: RuneEffect): number => (avoid.has(effectKey(effect)) ? 1 : 0);
  const effects = shuffle([...RUNE_EFFECT_IDS], rng).sort((a, b) => passedOver(a) - passedOver(b) || freshOf(b) - freshOf(a));
  // Each effect's queue, built in the order of `effects`, so one seed is one run.
  const queues = new Map(effects.map((effect) => [effect, tiersOf(pool, candidates.filter((e) => e.effect === effect), level, rng, avoid)] as const));

  const picked: RuneEntry[] = [];
  let next = 0;
  for (let slot = 0; slot < count; slot++) {
    let taken: RuneEntry | undefined;
    for (let step = 0; step < effects.length && !taken; step++) {
      const at = (next + step) % effects.length;
      taken = queues.get(effects[at])!.shift();
      if (taken) next = (at + 1) % effects.length;
    }
    if (!taken) break;
    picked.push(taken);
  }
  return picked.map((entry) => runeTaskOf(pool, entry, skillId, rng));
}

/** `count` words for a skill from the pool that credits it, or none when no pool does. */
export function drawRuneWords(skill: Skill, level: number, count: number, rng: Rng, exclude: ReadonlySet<string>, avoid: ReadonlySet<string>): RuneTask[] {
  const pool = runePoolFor(skill.id);
  return pool ? drawFromRunePool(pool, skill.id, level, count, rng, exclude, avoid) : [];
}

/**
 * One word of `effect` for a skill, in the same tiers (near and fresh first, met last), or null when
 * no pool credits the skill or the effect has no entry. What a rune world run draws (I7).
 */
export function drawRuneFor(skill: Skill, level: number, effect: RuneEffect, rng: Rng, avoid: ReadonlySet<string>): RuneTask | null {
  const pool = runePoolFor(skill.id);
  if (!pool) return null;
  const [entry] = tiersOf(pool, pool.entries.filter((e) => e.effect === effect), level, rng, avoid);
  return entry ? runeTaskOf(pool, entry, skill.id, rng) : null;
}
