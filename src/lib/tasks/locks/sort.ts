/**
 * The sort drawer (F6): a `sort` lock from the pools in `src/content/sorts/`. A skill that a pool
 * credits (science and vocabulary) presents as this lock; a skill with no pool plays as `choice`.
 *
 * One lock is one set of one pool: the rng picks a set, then 6 items (levels 0-1), 8 (levels 2-3) or
 * 10 (level 4), balanced between the two bins at ±1 of half. Items within one level of the drawn level
 * come first, and the rest fill in nearest-level first. Every item's bin is the pool's key, held in
 * `fits` and the stored `solution`, both server-only.
 *
 * The id is `<skill>:sort:<poolId>:<setId>:<opaque ids, comma-separated>`, in the order shown, and the
 * lock's view carries the same opaque ids (RF-h). An opaque id is `opaqueItemId(setId, itemId)`: 8 hex
 * characters that the server alone can map back to the author's item id (`sortTaskFromId`). Author ids
 * never reach the browser, because they can lean on the answer in ways no validator can list (q1/q3 in
 * one bin, q2/q4 in the other; a trailing a/b). The id names the items but never a bin, so it can be sent
 * to the browser. One id is one puzzle: the prompt, the bins and `fits` all follow from the pool.
 *
 * Seeded and pure: the `Rng` only, never `Math.random`. A pool that fails `validateSortPool` is never
 * loaded: it throws under test (so a bad file fails the suite) and is skipped, with a logged error,
 * in production (so one bad file cannot take the lock kind down).
 */
import { shuffle, type Rng } from "@/lib/utils/drill-generators";
import { formatSortProblems, opaqueItemId, validateSortPool, type SortPool, type SortPoolItem, type SortSet } from "@/lib/content/sort-pools";
import type { LockTask } from "../types";
import type { LockGenerator } from "./index";
import { SORT_POOL_FILES } from "./sort-pool-files";
import { clampLevel, pick } from "./util";

/** The pools that pass `validateSortPool`; the rest are dropped (strict: thrown, as under test). */
export function loadSortPools(raws: readonly unknown[], strict: boolean = process.env.NODE_ENV === "test"): SortPool[] {
  const loaded: SortPool[] = [];
  for (const raw of raws) {
    const problems = validateSortPool(raw);
    if (problems.length === 0) {
      loaded.push(raw as SortPool);
      continue;
    }
    const name = typeof raw === "object" && raw !== null && "poolId" in raw ? String((raw as { poolId: unknown }).poolId) : "a sort pool";
    const message = `${name} does not validate, so it is not loaded:\n${formatSortProblems(problems)}`;
    if (strict) throw new Error(message);
    console.error(message);
  }
  return loaded;
}

type Entry = { pool: SortPool; set: SortSet };
type Index = ReadonlyMap<string, readonly Entry[]>;

function indexPools(pools: readonly SortPool[]): Index {
  const bySkill = new Map<string, Entry[]>();
  for (const pool of pools) {
    const entries = bySkill.get(pool.skillId) ?? [];
    for (const set of pool.sets) entries.push({ pool, set });
    bySkill.set(pool.skillId, entries);
  }
  return bySkill;
}

let active: Index = indexPools(loadSortPools(SORT_POOL_FILES));

/** Test seam: draw from `raws` instead of the shipped pools (validated like them); `null` restores the shipped pools. */
export function __setSortPoolsForTest(raws: readonly unknown[] | null): void {
  active = indexPools(loadSortPools(raws ?? SORT_POOL_FILES));
}

const COUNT_AT_LEVEL = [6, 6, 8, 8, 10] as const;

/** `k` items of `items`: those within one level of `level` first (shuffled), then the rest, nearest level first. */
function take(items: readonly SortPoolItem[], k: number, level: number, rng: Rng): SortPoolItem[] {
  const near = shuffle(items.filter((i) => Math.abs(i.level - level) <= 1), rng);
  const far = shuffle(items.filter((i) => Math.abs(i.level - level) > 1), rng).sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level));
  return [...near, ...far].slice(0, k);
}

/** The task for these items of one set, in the order shown. Everything about it follows from the pool. */
function buildTask(skillId: string, pool: SortPool, set: SortSet, chosen: readonly SortPoolItem[]): LockTask {
  const opaque = chosen.map((i) => opaqueItemId(set.id, i.id));
  const [first, second] = set.categories;
  return {
    kind: "lock",
    id: `${skillId}:sort:${pool.poolId}:${set.id}:${opaque.join(",")}`,
    skillId,
    puzzle: "sort",
    prompt: `Sort these: ${first} or ${second}?`,
    categories: [first, second],
    items: chosen.map((i, n) => ({ id: opaque[n], label: i.label })),
    fits: chosen.map((i) => [i.category]),
    solution: { puzzle: "sort", cells: chosen.map((i) => i.category + 1) },
  } satisfies LockTask;
}

/**
 * The category set a sort id is drawn from, as "pool:set", or null for any other id. Read off the id
 * alone (no pool lookup), so a run can tell two sorts from one set apart (RF-j) before or after drawing.
 */
export function sortSetOfId(id: string): string | null {
  const parts = id.split(":");
  return parts.length === 5 && parts[1] === "sort" ? `${parts[2]}:${parts[3]}` : null;
}

/**
 * The task a sort id names, rebuilt from the pools: each opaque id is resolved back by hashing the set's
 * items. An id that is not ours, names no pool or set, repeats an item, names one the set lacks, or
 * lists fewer than 2 or more than 10 items gives null, as does a skill no pool credits.
 */
export function sortTaskFromId(id: string): LockTask | null {
  const parts = id.split(":");
  if (parts.length !== 5 || parts[1] !== "sort") return null;
  const [skillId, , poolId, setId, list] = parts;
  const entry = active.get(skillId)?.find((e) => e.pool.poolId === poolId && e.set.id === setId);
  if (!entry) return null;
  const byOpaque = new Map(entry.set.items.map((i) => [opaqueItemId(entry.set.id, i.id), i]));
  const opaque = list.split(",");
  if (opaque.length < 2 || opaque.length > 10 || new Set(opaque).size !== opaque.length) return null;
  const chosen: SortPoolItem[] = [];
  for (const o of opaque) {
    const item = byOpaque.get(o);
    if (!item) return null;
    chosen.push(item);
  }
  return buildTask(skillId, entry.pool, entry.set, chosen);
}

const drawSort: LockGenerator = (level, rng, skillId) => {
  const entries = active.get(skillId);
  if (!entries || entries.length === 0) return null;
  const l = clampLevel(level);
  const { pool, set } = pick(rng, entries);

  const n = COUNT_AT_LEVEL[l];
  // The clamp below relies on the validator's minimums: sets of at least 16 items with each bin 40-60%, so each bin has at least 7 and n/2 + 1 <= 6 always fits.
  const side = [set.items.filter((i) => i.category === 0), set.items.filter((i) => i.category === 1)];
  // Half and half, give or take one: always exactly half would itself be a tell.
  const zeros = Math.min(side[0].length, Math.max(n - side[1].length, n / 2 + pick(rng, [-1, 0, 0, 1])));
  const chosen = shuffle([...take(side[0], zeros, l, rng), ...take(side[1], n - zeros, l, rng)], rng);

  return buildTask(skillId, pool, set, chosen);
};

/** The drawer for a skill that a sort pool credits, else undefined (the skill plays as `choice`). Own keys only. */
export function sortFor(skillId: string): LockGenerator | undefined {
  return active.has(skillId) ? drawSort : undefined;
}
