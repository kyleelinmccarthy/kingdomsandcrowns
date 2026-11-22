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
import { box, type YardBox } from "./keep-yard-boxes";

const { stone: STONE, timber: TIMBER, plaster: PLASTER, roof: ROOF } = IMPROVEMENT_COLORS;
const DARK_TIMBER = "#6f4f2c";
const STRAW = "#d8b45a";
/** The top of a heap of hay, caught by the light. */
const STRAW_LIGHT = "#e6c873";
/** A trough's inside face, a shade darker than its timber. */
const WET_TIMBER = "#76552f";
/** Still water in a trough: blue, greyed, never the bright pool blue. */
const TROUGH_WATER = "#7d97a8";
/** A stake's ribbon, tied round its post: pale, so a search spot never reads as a site's post. */
const RIBBON = "#dcebf2";
/** A stake's sign, an open book in light parchment. */
const PARCHMENT = "#f3e6c4";
/** What a stake's flag and cap turn to once the clue is resolved and this was the answer: "It was here." */
const GOLD = "#e8b84a";

/**
 * The search stake: a stone footing, a post with a pale ribbon tied round it, a parchment sign (an
 * open book) and a cap, round the spot's centre and inside `ANCHOR_SPOT.radius`. Pale and never red,
 * so a search spot does not read as a building site's posts from a distance (H10 look pass); it is
 * drawn only while a walk is on, and all fourteen are alike. Revealed (the answer, on a miss), the
 * sign and cap are gold; nothing else about it changes.
 */
export function stakeBoxes(revealed: boolean): YardBox[] {
  const r = ANCHOR_SPOT.radius;
  return [
    box(STONE, 0, 0, 0.4, 0.4, 0, 0.12),
    box(DARK_TIMBER, 0, 0, 0.1, 0.1, 0.12, 1.18),
    box(RIBBON, 0, 0, 0.14, 0.14, 0.74, 0.08),
    box(revealed ? GOLD : PARCHMENT, r * 0.34, 0, 0.24, 0.03, 0.95, 0.28),
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

/**
 * A long open box on a low plinth: timber sides and ends to a rim, a darker inside face on its long
 * sides, and blue-grey water a hand below the rim (H10 look pass: it read as a bench).
 */
const WATER_TROUGH: readonly YardBox[] = [
  box(DARK_TIMBER, 0, 0, 1.56, 0.62, 0, 0.08),
  box(TIMBER, 0, -0.27, 1.5, 0.06, 0.08, 0.54),
  box(TIMBER, 0, 0.27, 1.5, 0.06, 0.08, 0.54),
  box(TIMBER, -0.72, 0, 0.06, 0.48, 0.08, 0.54),
  box(TIMBER, 0.72, 0, 0.06, 0.48, 0.08, 0.54),
  box(WET_TIMBER, 0, -0.22, 1.38, 0.04, 0.08, 0.5),
  box(WET_TIMBER, 0, 0.22, 1.38, 0.04, 0.08, 0.5),
  box(TROUGH_WATER, 0, 0, 1.38, 0.4, 0.44, 0.08),
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

/**
 * A cart on two wheels (each a spoked cross, 0.7 across) with its bed, a heap of hay in two tiers and
 * the shaft out front (H10 look pass: it read as a small brown box).
 */
const HAY_CART: readonly YardBox[] = [
  ...[-0.7, 0.7].flatMap((x) => [box(DARK_TIMBER, x, 0, 0.08, 0.24, 0, 0.7), box(DARK_TIMBER, x, 0, 0.08, 0.7, 0.23, 0.24)]),
  box(TIMBER, 0, 0, 1.2, 1.4, 0.4, 0.14),
  box(STRAW, 0, -0.05, 1.1, 1.25, 0.54, 0.4),
  box(STRAW_LIGHT, 0, -0.08, 0.8, 0.95, 0.94, 0.3),
  box(DARK_TIMBER, 0, 0.74, 0.08, 0.12, 0.42, 0.06),
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
