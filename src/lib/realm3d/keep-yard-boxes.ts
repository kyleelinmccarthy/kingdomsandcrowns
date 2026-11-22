/**
 * THE KEEP YARD'S SHAPES, as boxes the scene merges (`components/realm3d/keep-yard.tsx`): the plans
 * board, and the stockpile's heaps sized by what the hero holds (`heapSize`). Pure, so the sizes and
 * the placing are tested here and the scene only paints and merges. Boxes are in their spot's own
 * frame: `x`/`z` the centre on the ground plane, `y` the centre height, `sx`/`sy`/`sz` the size.
 */

import { IMPROVEMENT_COLORS } from "@/lib/realm/improvements";
import { KEEP_YARD } from "@/lib/realm/keep-yard";
import { SPAWN } from "@/lib/realm/layout";
import { heapSize, MATERIALS, MATERIAL_IDS, type MaterialId } from "@/lib/realm/materials";

export type YardBox = { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: string };

/** A box by its centre on the ground, footprint, the height of its bottom, and its height. */
export const box = (color: string, x: number, z: number, sx: number, sz: number, y0: number, sy: number): YardBox => ({ x, y: y0 + sy / 2, z, sx, sy, sz, color });

const LAYER_H = 0.3;

/** A heap's box: its shape alone, since the heap's material gives every box its colour. */
export type HeapBox = Omit<YardBox, "color">;

/**
 * One heap: a stack of layers, each a little narrower than the one under it and set a touch
 * off-centre, so it reads as a pile rather than a plinth. Size 0 is nothing; 1 to 3 add a layer and
 * widen the base, the widest still inside the heap's spot (`YARD_RADIUS.heap`).
 */
export function heapBoxes(size: 0 | 1 | 2 | 3): HeapBox[] {
  if (size === 0) return [];
  const base = 0.8 + 0.33 * size;
  const out: HeapBox[] = [];
  for (let i = 0; i <= size; i++) {
    const w = base * (1 - 0.2 * i);
    const shift = i === 0 ? 0 : (i % 2 === 1 ? 1 : -1) * 0.06;
    out.push({ x: shift, y: i * LAYER_H + LAYER_H / 2, z: -shift, sx: w, sy: LAYER_H, sz: w * 0.8 });
  }
  return out;
}

export type Heap = { id: MaterialId; x: number; z: number; size: 1 | 2 | 3; color: string };

/** The heaps worth drawing: one per material the hero holds, on its own spot, in catalog order. */
export function stockpileHeaps(balance: Readonly<Record<MaterialId, number>>): Heap[] {
  const out: Heap[] = [];
  MATERIAL_IDS.forEach((id, i) => {
    const size = heapSize(balance[id] ?? 0);
    if (size === 0) return;
    const spot = KEEP_YARD.stockpile[i];
    out.push({ id, x: spot.x, z: spot.z, size, color: MATERIALS[id].color });
  });
  return out;
}

const PARCHMENT = "#efe1bd";
const PLANK = "#6e5032";

/**
 * The plans board, front to +z: two posts, a plank board, three pinned sheets (one sealed in gold)
 * and a little roof to keep the rain off. It fits its spot (`YARD_RADIUS.plansBoard`) at any turn.
 */
export const PLANS_BOARD_BOXES: readonly YardBox[] = [
  box(IMPROVEMENT_COLORS.timber, -0.8, 0, 0.14, 0.14, 0, 2.05),
  box(IMPROVEMENT_COLORS.timber, 0.8, 0, 0.14, 0.14, 0, 2.05),
  box(PLANK, 0, 0, 1.8, 0.08, 0.75, 1.1),
  box(PARCHMENT, -0.52, 0.055, 0.42, 0.03, 1.1, 0.55),
  box(PARCHMENT, 0.02, 0.055, 0.42, 0.03, 0.95, 0.6),
  box(PARCHMENT, 0.54, 0.055, 0.38, 0.03, 1.15, 0.5),
  box(IMPROVEMENT_COLORS.gold, 0.02, 0.08, 0.1, 0.03, 1.4, 0.1),
  box(IMPROVEMENT_COLORS.roof, 0, 0, 2, 0.36, 2.05, 0.14),
];

/** The board faces the road the hero walks in on, so its sheets are what they see from the spawn. */
export const PLANS_BOARD_YAW = Math.atan2(SPAWN.x - KEEP_YARD.plansBoard.x, SPAWN.z - KEEP_YARD.plansBoard.z);

const LEATHER = "#5b3a24";

/**
 * The Scribe's lectern, front to +z: a low plank base, a post, a stepped desk top (the back higher,
 * so the book leans toward the reader) and an open book on it, two parchment pages over a leather
 * cover with a red ribbon. A little under hero height, so the hero sees over it. It fits its spot
 * (`YARD_RADIUS.lectern`) at any turn.
 */
export const LECTERN_BOXES: readonly YardBox[] = [
  box(PLANK, 0, 0, 0.7, 0.6, 0, 0.08),
  box(IMPROVEMENT_COLORS.timber, 0, 0, 0.2, 0.2, 0.08, 0.78),
  box(PLANK, 0, -0.1, 1, 0.3, 0.86, 0.14),
  box(PLANK, 0, 0.14, 1, 0.22, 0.86, 0.08),
  box(LEATHER, 0, -0.04, 0.96, 0.44, 1, 0.04),
  box(PARCHMENT, -0.23, -0.04, 0.42, 0.36, 1.04, 0.03),
  box(PARCHMENT, 0.23, -0.04, 0.42, 0.36, 1.04, 0.03),
  box(LEATHER, 0, -0.04, 0.04, 0.38, 1.04, 0.04),
  box(IMPROVEMENT_COLORS.cloth, 0.04, 0.17, 0.04, 0.1, 1.04, 0.02),
];

/**
 * The lectern's open book faces +z: the default camera stands south of the hero looking north, so
 * a child walking up sees the pages, not the back of the desk (as doors face +z for the same reason).
 */
export const LECTERN_YAW = 0;
