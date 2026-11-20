/**
 * THE DECORATIONS a hero finds in the world's chests, and where each stands once found (owner:
 * "appear at set spots"). Pure data, client-safe, and imports nothing, so both the catalog of
 * locks (`world-objects.ts`, which re-exports it) and the copy that names a find
 * (`utils/world-lock-copy.ts`) can read it without importing each other.
 * `world-objects.test.ts` holds every spot to the clearance rules of the village.
 */

export type DecorId =
  | "stone-bench"
  | "sundial"
  | "flower-cart"
  | "bird-bath"
  | "weather-vane"
  | "hay-bales"
  | "scarecrow"
  | "barrel-stack"
  | "herb-planter"
  | "story-post";

/** Where each decoration stands once found, and how it faces. `label` is what a reward line calls it. */
export const DECOR: Readonly<Record<DecorId, { label: string; x: number; z: number; ry: number }>> = {
  "stone-bench": { label: "a stone bench", x: -18, z: 8, ry: Math.PI / 2 },
  sundial: { label: "a sundial", x: -20.5, z: 16, ry: 0 },
  "flower-cart": { label: "a flower cart", x: 18.5, z: 6.5, ry: -Math.PI / 2 },
  "bird-bath": { label: "a bird bath", x: 20.5, z: 13.5, ry: 0 },
  // Moved from (19, -5): a wild bush stood on its square, and the riding track runs 0.7 from it. East flank, 2.6 from the nearest track.
  "weather-vane": { label: "a weather vane", x: 21, z: 4, ry: 0 },
  "hay-bales": { label: "a stack of hay bales", x: 22, z: 1.5, ry: 0 },
  scarecrow: { label: "a scarecrow", x: 5, z: 17, ry: Math.PI },
  "barrel-stack": { label: "a stack of barrels", x: -3.25, z: 26.5, ry: 0 },
  "herb-planter": { label: "an herb planter", x: 7.5, z: -10.25, ry: 0 },
  "story-post": { label: "a story post", x: -15, z: -31, ry: 0 },
};

export const DECOR_IDS = Object.keys(DECOR) as DecorId[];
