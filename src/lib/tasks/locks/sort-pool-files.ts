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
export const SORT_POOL_FILES: readonly unknown[] = [];
