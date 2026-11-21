/**
 * The trail pools a run draws from (slice 5, R-H12): the loader, the lookup `TASK_KINDS.trail.presents`
 * reads, and the clue's task. Server-only, like the registry: a pool holds every answer.
 *
 * A skill that a pool credits (`trailPoolFor`) is played as trails; a skill with no pool is not
 * presented by this kind, so a run plays it as it always did. A pool that fails `validateTrailPool` is
 * never loaded: it throws under test (so a bad file fails the suite) and is skipped, with a logged
 * error, in production (so one bad file cannot take the kind down).
 */
import { formatTrailProblems, opaqueClueId, trailKey, validateTrailPool, type Trail, type TrailPool } from "@/lib/content/trail-pools";
import type { AnchorId } from "@/lib/realm/anchors";
import { TRAIL_GENERIC_WHY } from "../trail-copy";
import type { TrailTask } from "../types";
import { TRAIL_POOL_FILES } from "./trail-pool-files";

/** The pools that pass `validateTrailPool`; the rest are dropped (strict: thrown, as under test). */
export function loadTrailPools(raws: readonly unknown[], strict: boolean = process.env.NODE_ENV === "test"): TrailPool[] {
  const loaded: TrailPool[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    const problems = validateTrailPool(raw);
    const name = typeof raw === "object" && raw !== null && "poolId" in raw ? String((raw as { poolId: unknown }).poolId) : "a trail pool";
    if (problems.length === 0 && seen.has(name)) problems.push({ itemId: null, rule: "duplicate-pool", detail: `${name} is listed twice` });
    if (problems.length === 0) {
      seen.add(name);
      loaded.push(raw as TrailPool);
      continue;
    }
    const message = `${name} does not validate, so it is not loaded:\n${formatTrailProblems(problems)}`;
    if (strict) throw new Error(message);
    console.error(message);
  }
  return loaded;
}

const indexPools = (pools: readonly TrailPool[]): ReadonlyMap<string, TrailPool> => new Map(pools.map((p) => [p.skillId, p]));

let active: ReadonlyMap<string, TrailPool> = indexPools(loadTrailPools(TRAIL_POOL_FILES));

/** Test seam: draw from `raws` instead of the shipped pools (validated like them); `null` restores the shipped pools. */
export function __setTrailPoolsForTest(raws: readonly unknown[] | null): void {
  active = indexPools(loadTrailPools(raws ?? TRAIL_POOL_FILES));
}

/** The pool that credits a skill, if any. A map, so "toString" is no skill. */
export function trailPoolFor(skillId: string): TrailPool | undefined {
  return active.get(skillId);
}

/**
 * The task for one clue of a trail. The id is `<skillId>:trail:<8 hex>`: opaque (RF-h), because an
 * author's trail id can lean on the answer. `explain` is the clue's `why`, else the band's generic
 * line, so a resolved miss never falls back to the skill hint (F-20). Everything else about it
 * follows from the pool, and none of it but `prompt` and `readAloud` ever reaches the browser.
 */
export function trailTaskOf(pool: TrailPool, trail: Trail, index: number): TrailTask {
  const clue = trail.clues[index];
  return {
    kind: "trail",
    id: `${pool.skillId}:trail:${opaqueClueId(pool.poolId, trail.id, index)}`,
    skillId: pool.skillId,
    prompt: clue.text,
    ...(clue.readAloud !== undefined ? { readAloud: clue.readAloud } : {}),
    answer: clue.answer as AnchorId,
    redirect: clue.redirect,
    ...(clue.redirects !== undefined ? { redirects: { ...clue.redirects } as Partial<Record<AnchorId, string>> } : {}),
    trail: trailKey(pool.poolId, trail.id),
    explain: clue.why ?? TRAIL_GENERIC_WHY[pool.band],
  };
}
