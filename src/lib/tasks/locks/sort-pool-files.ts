/**
 * The sort pools the game ships: static JSON imports, bundled into the server (this file is only
 * imported by `sort.ts`, which only the lock kind reaches). Nothing here is trusted until
 * `loadSortPools` has validated it, and a pool that fails is never loaded.
 *
 * ADDING A POOL (F7): drop `src/content/sorts/<poolId>.json`, then add ONE import and ONE entry below,
 * and add the pool id to `EXPECTED_SORT_POOLS` in `src/lib/utils/sorts-content.test.ts`. The content
 * test fails if the folder and this list disagree, so a pool cannot ship unloaded by accident.
 *
 *   import sortScienceG23 from "@/content/sorts/sort-science-g23.json";
 *   export const SORT_POOL_FILES: readonly unknown[] = [sortScienceG23];
 */
import sortScienceK1 from "@/content/sorts/sort-science-k1.json";
import sortScienceG23 from "@/content/sorts/sort-science-g23.json";
import sortScienceG45 from "@/content/sorts/sort-science-g45.json";
import sortScienceG68 from "@/content/sorts/sort-science-g68.json";
import sortScienceG912 from "@/content/sorts/sort-science-g912.json";
import sortVocabG45 from "@/content/sorts/sort-vocab-g45.json";
import sortVocabG68 from "@/content/sorts/sort-vocab-g68.json";
import sortVocabG912 from "@/content/sorts/sort-vocab-g912.json";

export const SORT_POOL_FILES: readonly unknown[] = [
  sortScienceK1,
  sortScienceG23,
  sortScienceG45,
  sortScienceG68,
  sortScienceG912,
  sortVocabG45,
  sortVocabG68,
  sortVocabG912,
];
