/**
 * THE ANCHORS' SHAPES, as boxes the scene merges (`components/realm3d/trail-stakes.tsx` and
 * `trail-objects.tsx`): the search stake that stands at each of the fourteen places a reading clue
 * can lead to, and the four small objects (notice board, water trough, beehives, hay cart). Pure,
 * so that every box keeps to its footprint and its height is tested here (`anchor-boxes.test.ts`)
 * and the scene only paints and merges. Boxes are in the thing's own frame, front to +z: `x`/`z`
 * the centre on the ground, `y` the centre height, `sx`/`sy`/`sz` the size (`YardBox`). Nothing
 * here is solid, and nothing here tells one anchor's stake from another's.
 */

import { ANCHOR_SPOT, type ObjectAnchorId } from "@/lib/realm/anchors";
import { IMPROVEMENT_COLORS } from "@/lib/realm/improvements";
import type { YardBox } from "./keep-yard-boxes";

const { stone: STONE, timber: TIMBER, plaster: PLASTER, roof: ROOF, cloth: CLOTH, water: WATER } = IMPROVEMENT_COLORS;
const DARK_TIMBER = "#6f4f2c";
const STRAW = "#d8b45a";
/** What a stake's flag and cap turn to once the clue is resolved and this was the answer: "It was here." */
const GOLD = "#e8b84a";

/** A box by its centre on the ground, footprint, the height of its bottom, and its height. */
const box = (color: string, x: number, z: number, sx: number, sz: number, y0: number, sy: number): YardBox => ({ x, y: y0 + sy / 2, z, sx, sy, sz, color });

/**
 * The search stake: a stone footing, a post, a cloth flag and a cap, round the spot's centre and
 * inside `ANCHOR_SPOT.radius`. Revealed (the answer, on a miss), the flag and cap are gold; nothing
 * else about it changes.
 */
export function stakeBoxes(revealed: boolean): YardBox[] {
  const r = ANCHOR_SPOT.radius;
  return [
    box(STONE, 0, 0, 0.4, 0.4, 0, 0.12),
    box(DARK_TIMBER, 0, 0, 0.1, 0.1, 0.12, 1.18),
    box(revealed ? GOLD : CLOTH, r * 0.34, 0, 0.24, 0.03, 0.95, 0.28),
    box(revealed ? GOLD : DARK_TIMBER, 0, 0, 0.16, 0.16, 1.3, 0.1),
  ];
}

const NOTICE_BOARD: readonly YardBox[] = [
  box(TIMBER, -0.55, 0, 0.12, 0.12, 0, 1.7),
  box(TIMBER, 0.55, 0, 0.12, 0.12, 0, 1.7),
  box("#b08a5a", 0, 0, 1.3, 0.08, 0.9, 0.8),
  box(ROOF, 0, 0.04, 1.5, 0.3, 1.7, 0.1),
  box(PLASTER, -0.3, 0.05, 0.3, 0.02, 1.3, 0.35),
  box(PLASTER, 0.25, 0.05, 0.3, 0.02, 1.05, 0.3),
];

const WATER_TROUGH: readonly YardBox[] = [
  box(TIMBER, 0, 0, 1.5, 0.55, 0.25, 0.35),
  box(WATER, 0, 0, 1.3, 0.4, 0.55, 0.04),
  box(DARK_TIMBER, -0.55, 0, 0.12, 0.45, 0, 0.25),
  box(DARK_TIMBER, 0.55, 0, 0.12, 0.45, 0, 0.25),
];

const BEEHIVES: readonly YardBox[] = [
  box(TIMBER, 0, 0, 1.5, 0.6, 0.4, 0.08),
  box(DARK_TIMBER, -0.6, 0, 0.1, 0.5, 0, 0.4),
  box(DARK_TIMBER, 0.6, 0, 0.1, 0.5, 0, 0.4),
  box(STRAW, -0.4, 0, 0.5, 0.5, 0.48, 0.5),
  box(ROOF, -0.4, 0, 0.56, 0.56, 0.98, 0.1),
  box(STRAW, 0.35, 0, 0.5, 0.5, 0.48, 0.5),
  box(ROOF, 0.35, 0, 0.56, 0.56, 0.98, 0.1),
];

const HAY_CART: readonly YardBox[] = [
  box(TIMBER, 0, 0, 1.1, 1.4, 0.35, 0.3),
  box(STRAW, 0, 0, 0.9, 1.2, 0.65, 0.55),
  box(DARK_TIMBER, -0.58, 0, 0.1, 0.5, 0, 0.5),
  box(DARK_TIMBER, 0.58, 0, 0.1, 0.5, 0, 0.5),
  box(DARK_TIMBER, 0, 0.6, 0.08, 0.4, 0.35, 0.06),
];

const OBJECT_BOXES: Readonly<Record<ObjectAnchorId, readonly YardBox[]>> = {
  "object:notice-board": NOTICE_BOARD,
  "object:water-trough": WATER_TROUGH,
  "object:beehives": BEEHIVES,
  "object:hay-cart": HAY_CART,
};

/** One small object's boxes in its own frame (front to +z), inside a 1.6 by 1.6 footprint and at most 2.2 tall. */
export function trailObjectBoxes(id: ObjectAnchorId): YardBox[] {
  return OBJECT_BOXES[id].map((b) => ({ ...b }));
}
