/**
 * The trail pools the game ships: static JSON imports, bundled into the server (this file is only
 * imported by `index.ts`, which only the trail kind and its drawer reach). Nothing here is trusted until
 * `loadTrailPools` has validated it, and a pool that fails is never loaded.
 *
 * ADDING A POOL (H5): drop `src/content/trails/<poolId>.json`, then add ONE import and ONE entry below,
 * and add the pool id to `EXPECTED_TRAIL_POOLS` in `src/lib/utils/trails-content.test.ts`. The content
 * test fails if the folder and this list disagree, so a pool cannot ship unloaded by accident.
 *
 *   import trailK1 from "@/content/trails/trail-k1.json";
 *   export const TRAIL_POOL_FILES: readonly unknown[] = [trailK1];
 */
import trailK1 from "@/content/trails/trail-k1.json";

export const TRAIL_POOL_FILES: readonly unknown[] = [trailK1];
