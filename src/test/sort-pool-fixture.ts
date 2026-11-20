/**
 * A valid sort pool for tests (the validator, the sheet round-trip, the drawer). It is NOT content:
 * it lives here so `src/content/sorts/` stays exactly what F7 ships. It credits `science-g23`
 * (grade 2) and passes `validateSortPool` unchanged; the validator tests break it one rule at a time.
 */
import type { SortPool } from "@/lib/content/sort-pools";

const LIVING = ["dog", "oak tree", "frog", "mushroom", "ant", "daisy", "whale", "moss", "bee", "fern", "snail", "eagle"];
const THINGS = ["rock", "spoon", "cloud", "brick", "coin", "chair", "glass jar", "pencil", "sand", "bicycle", "river stone", "candle"];
const SOLIDS = ["ice cube", "rock", "wood", "brick", "coin", "spoon", "chalk", "glass", "key", "shoe"];
const LIQUIDS = ["water", "milk", "juice", "oil", "honey", "soup", "rain", "syrup", "tea", "ink"];

type Item = SortPool["sets"][number]["items"][number];

/** Items for one set: the first list is category 0, the second category 1; levels cycle 0-4 down each list. */
function itemsOf(prefix: string, zero: string[], one: string[]): Item[] {
  const make = (labels: string[], category: 0 | 1): Item[] =>
    labels.map((label, i) => ({
      // Ids come from the label, so they do not run in bin order (see the `id-tells-category` rule).
      id: `${prefix}-${label.replace(/ /g, "-")}`,
      label,
      category,
      level: (i % 5) as 0 | 1 | 2 | 3 | 4,
    }));
  return [...make(zero, 0), ...make(one, 1)];
}

export const FIXTURE_POOL_ID = "sort-science-g23";
export const FIXTURE_SKILL_ID = "science-g23";

export function fixtureSortPool(): SortPool {
  return {
    poolId: FIXTURE_POOL_ID,
    skillId: FIXTURE_SKILL_ID,
    grade: "2",
    sets: [
      { id: "living", categories: ["Living", "Non-living"], items: itemsOf("liv", LIVING, THINGS) },
      { id: "state", categories: ["Solid", "Liquid"], items: itemsOf("sta", SOLIDS, LIQUIDS) },
    ],
  };
}
