// Where the kingdom's plans stand: the keep yard, and the four village decorations.
// Pure and client-safe: coordinates only, in the world frame (x east, z south, like layout.ts).
import type { Vec2 } from "./layout";

/**
 * The keep yard: open, level ground just south of the village gate, beside the road the hero
 * walks in on (`SPAWN` is (0, 15)), so it is in view on every visit. It is NOT beside the castle:
 * the castle as drawn (`castlePlan`) is a walled compound some thirty units deep behind its
 * gate, with a solid curtain interior, and it does not exist for a hero below level 50 anyway.
 * The yard keeps well clear of every tier of it, of the road (including the south road, x within
 * 3 of 0), of every site and decoration, of the grove floor to the west (as it is drawn, turned),
 * from under the crowns of the orchard oaks that hedge the village at z 27 (their crowns reach
 * about two units, to z 24.9), and stands where the ground is flat.
 *
 *   plansBoard     where a hero reads what the kingdom could build, and starts a build
 *   stockpile      six heaps, one per material, in `MATERIAL_IDS` order, stone first: two rows
 *                  of three west of the board, nearest the board first (D16 smoke: a single row
 *                  at z 24.8 stood under the oaks and on the grove's edge)
 *   chronicleHall  the Chronicle Hall improvement is centred here, its tallest level kept 1.5
 *                  clear of the oaks' crowns (D16 smoke: its roof ran into them at z 23.5), and
 *                  east of the statue so it stands 1.5 clear of it and its plaque
 *   lectern        where the Scribe's lectern stands (the Chronicle, a later slice)
 */
export const KEEP_YARD: {
  plansBoard: Vec2;
  stockpile: readonly Vec2[];
  chronicleHall: Vec2;
  lectern: Vec2;
} = {
  plansBoard: { x: -6, z: 21.5 },
  stockpile: [
    { x: -8.8, z: 21 },
    { x: -11.2, z: 21 },
    { x: -13.6, z: 21 },
    { x: -8.8, z: 23.4 },
    { x: -11.2, z: 23.4 },
    { x: -13.6, z: 23.4 },
  ],
  chronicleHall: { x: 14.8, z: 20.75 },
  lectern: { x: 5.5, z: 22.5 },
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
