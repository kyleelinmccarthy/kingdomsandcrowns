/**
 * The rune pools the game ships: static JSON imports, bundled into the server (this file is only
 * imported by `index.ts`, which only the rune kind and its drawer reach). Nothing here is trusted until
 * `loadRunePools` has validated it, and a pool that fails is never loaded.
 *
 * ADDING A POOL: drop `src/content/runes/<poolId>.json`, then add ONE import and ONE entry below, and
 * add the pool id to `EXPECTED_RUNE_POOLS` in `src/lib/utils/runes-content.test.ts`. The content test
 * fails if the folder and this list disagree, so a pool cannot ship unloaded by accident.
 */
import runeG23 from "@/content/runes/rune-g23.json";
import runeG45 from "@/content/runes/rune-g45.json";
import runeG68 from "@/content/runes/rune-g68.json";
import runeG912 from "@/content/runes/rune-g912.json";
import runeK1 from "@/content/runes/rune-k1.json";

export const RUNE_POOL_FILES: readonly unknown[] = [runeK1, runeG23, runeG45, runeG68, runeG912];
