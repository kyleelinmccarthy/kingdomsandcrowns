/**
 * The sort drawer (F6): a `sort` lock from the pools in `src/content/sorts/`. A skill that a pool
 * credits (science and vocabulary) presents as this lock; a skill with no pool plays as `choice`.
 *
 * One lock is one set of one pool: the rng picks a set, then 6 items (levels 0-1), 8 (levels 2-3) or
 * 10 (level 4), balanced between the two bins at ±1 of half. Items within one level of the drawn level
 * come first, and the rest fill in nearest-level first. Every item's bin is the pool's key, held in
 * `fits` and the stored `solution`, both server-only.
 *
 * The id is `<skill>:sort:<poolId>:<setId>:<item ids, comma-separated>`, in the order shown: it names
 * the items but never a bin, so it can be sent to the browser. (An item id must not give a bin away
 * either; `validateSortPool` checks the ids as well as the labels.) One id is one puzzle: the prompt,
 * the bins and `fits` all follow from the pool.
 *
 * Seeded and pure: the `Rng` only, never `Math.random`. A pool that fails `validateSortPool` is never
 * loaded: it throws under test (so a bad file fails the suite) and is skipped, with a logged error,
 * in production (so one bad file cannot take the lock kind down).
 */
import { shuffle, type Rng } from "@/lib/utils/drill-generators";
import { formatSortProblems, validateSortPool, type SortPool, type SortPoolItem, type SortSet } from "@/lib/content/sort-pools";
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

const drawSort: LockGenerator = (level, rng, skillId) => {
  const entries = active.get(skillId);
  if (!entries || entries.length === 0) return null;
  const l = clampLevel(level);
  const { pool, set } = pick(rng, entries);

  const n = COUNT_AT_LEVEL[l];
  const side = [set.items.filter((i) => i.category === 0), set.items.filter((i) => i.category === 1)];
  // Half and half, give or take one: always exactly half would itself be a tell.
  const zeros = Math.min(side[0].length, Math.max(n - side[1].length, n / 2 + pick(rng, [-1, 0, 0, 1])));
  const chosen = shuffle([...take(side[0], zeros, l, rng), ...take(side[1], n - zeros, l, rng)], rng);

  const [first, second] = set.categories;
  return {
    kind: "lock",
    id: `${skillId}:sort:${pool.poolId}:${set.id}:${chosen.map((i) => i.id).join(",")}`,
    skillId,
    puzzle: "sort",
    prompt: `Sort these: ${first} or ${second}?`,
    categories: [first, second],
    items: chosen.map((i) => ({ id: i.id, label: i.label })),
    fits: chosen.map((i) => [i.category]),
    solution: { puzzle: "sort", cells: chosen.map((i) => i.category + 1) },
  } satisfies LockTask;
};

/** The drawer for a skill that a sort pool credits, else undefined (the skill plays as `choice`). Own keys only. */
export function sortFor(skillId: string): LockGenerator | undefined {
  return active.has(skillId) ? drawSort : undefined;
}
