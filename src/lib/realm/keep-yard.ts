// Where the kingdom's plans stand: the keep yard, and the four village decorations.
// Pure and client-safe: coordinates only, in the world frame (x east, z south, like layout.ts).
import type { Vec2 } from "./layout";

/**
 * The keep yard: open ground just north of the castle, clear of the LARGEST tier's footprint (a
 * citadel's back wall is at z = -18), the lap ring's northern waypoints and the ceremony plaza,
 * and well off the road and every gate. There is no Keep until a hero is level 50, so the yard
 * stands from day one and is reached round either flank of the castle.
 *
 *   plansBoard     where a hero reads what the kingdom could build, and starts a build
 *   stockpile      six heaps, one per material, in `MATERIAL_IDS` order, stone first
 *   chronicleHall  the Chronicle Hall improvement is centred here
 *   lectern        where the Scribe's lectern stands (the Chronicle, a later slice)
 */
export const KEEP_YARD: {
  plansBoard: Vec2;
  stockpile: readonly Vec2[];
  chronicleHall: Vec2;
  lectern: Vec2;
} = {
  plansBoard: { x: -5, z: -22 },
  stockpile: [
    { x: -9, z: -25.5 },
    { x: -6.6, z: -25.5 },
    { x: -4.2, z: -25.5 },
    { x: -1.8, z: -25.5 },
    { x: 0.6, z: -25.5 },
    { x: 3, z: -25.5 },
  ],
  chronicleHall: { x: 8.5, z: -23 },
  lectern: { x: 3, z: -22 },
};

/** Where each village decoration stands: its boxes are centred here. Open ground in the south and the flanks of the village. */
export const VILLAGE_DECOR_SPOTS: Record<"village-banners" | "village-lamps" | "village-fountain" | "village-statue", Vec2> = {
  "village-banners": { x: -14, z: 9 },
  "village-lamps": { x: 14.5, z: 9.5 },
  "village-fountain": { x: -10, z: 16 },
  "village-statue": { x: 10, z: 16 },
};

/**
 * Half the side of the square each spot keeps for itself, in world units. The layout tests hold
 * every one of these squares clear of the sites, the road and the rest, and the improvement tests
 * hold every box inside its own spot's square.
 */
export const YARD_RADIUS = {
  plansBoard: 1.2,
  heap: 0.9,
  chronicleHall: 2.6,
  lectern: 0.8,
  "village-banners": 1.8,
  "village-lamps": 1.8,
  "village-fountain": 2,
  "village-statue": 1,
} as const;
