/**
 * The rune pools a run draws from (slice 6, R-I6): the loader, the lookup `TASK_KINDS.rune.presents`
 * reads, and an entry's task. Server-only, like the registry: a pool holds every word.
 *
 * A skill that a pool credits (`runePoolFor`) is played as runes; a skill with no pool is not
 * presented by this kind, so a run plays it as it always did. A pool that fails `validateRunePool` is
 * never loaded: it throws under test (so a bad file fails the suite) and is skipped, with a logged
 * error, in production (so one bad file cannot take the kind down).
 */
import { LISTEN_BANDS, formatRuneProblems, opaqueRuneId, runeKey, shuffleTiles, validateRunePool, type RuneEntry, type RunePool } from "@/lib/content/rune-pools";
import type { Rng } from "@/lib/utils/drill-generators";
import { RUNE_GENERIC_WHY } from "../rune-copy";
import type { RuneTask } from "../types";
import { RUNE_POOL_FILES } from "./rune-pool-files";

/** The pools that pass `validateRunePool`; the rest are dropped (strict: thrown, as under test). */
export function loadRunePools(raws: readonly unknown[], strict: boolean = process.env.NODE_ENV === "test"): RunePool[] {
  const loaded: RunePool[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    const problems = validateRunePool(raw);
    const name = typeof raw === "object" && raw !== null && "poolId" in raw ? String((raw as { poolId: unknown }).poolId) : "a rune pool";
    if (problems.length === 0 && seen.has(name)) problems.push({ itemId: null, rule: "duplicate-pool", detail: `${name} is listed twice` });
    if (problems.length === 0) {
      seen.add(name);
      loaded.push(raw as RunePool);
      continue;
    }
    const message = `${name} does not validate, so it is not loaded:\n${formatRuneProblems(problems)}`;
    if (strict) throw new Error(message);
    console.error(message);
  }
  return loaded;
}

/** Each credited skill to its pool. A pool credits one or two skills, and each skill is credited by one band (`RUNE_SKILLS`). */
const indexPools = (pools: readonly RunePool[]): ReadonlyMap<string, RunePool> => new Map(pools.flatMap((p) => p.skillIds.map((id) => [id, p] as const)));

let active: ReadonlyMap<string, RunePool> = indexPools(loadRunePools(RUNE_POOL_FILES));

/** Test seam: draw from `raws` instead of the shipped pools (validated like them); `null` restores the shipped pools. */
export function __setRunePoolsForTest(raws: readonly unknown[] | null): void {
  active = indexPools(loadRunePools(raws ?? RUNE_POOL_FILES));
}

/** The pool that credits a skill, if any. A map, so "toString" is no skill. */
export function runePoolFor(skillId: string): RunePool | undefined {
  return active.get(skillId);
}

/** An entry's task id when drawn for `skillId`: `<skillId>:rune:<8 hex>`. Opaque (RF-h): an author's entry id can lean on the word. */
export const runeTaskId = (pool: RunePool, entry: RuneEntry, skillId: string): string => `${skillId}:rune:${opaqueRuneId(pool.poolId, entry.id)}`;

/**
 * The task for one entry, drawn for `skillId`. The tiles are shown in an order that spells no word
 * (`shuffleTiles`, from the run's `Rng`) and stored so, so a resume shows the same tray. The object is
 * bound later, at the run's start (R-I22). `explain` is the entry's `why`, else the band's generic
 * line, so a resolved miss never falls back to the skill hint (F-20). The words, the hint and the
 * entry key stay on the server (R-I17); the view is built by `runeKind.toView`.
 */
export function runeTaskOf(pool: RunePool, entry: RuneEntry, skillId: string, rng: Rng): RuneTask {
  return {
    kind: "rune",
    id: runeTaskId(pool, entry, skillId),
    skillId,
    prompt: entry.prompt,
    ...(entry.readAloud !== undefined ? { readAloud: entry.readAloud } : {}),
    effect: entry.effect,
    object: null,
    tiles: shuffleTiles(entry.tiles, entry.words, rng),
    listen: LISTEN_BANDS.includes(pool.band),
    words: [...entry.words],
    hint: entry.hint,
    entry: runeKey(pool.poolId, entry.id),
    explain: entry.why ?? RUNE_GENERIC_WHY[pool.band],
  };
}
