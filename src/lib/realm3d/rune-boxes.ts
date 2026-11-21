/**
 * THE RUNE OBJECTS' SHAPES, as boxes the scene merges (`components/realm3d/rune-objects.tsx`): a
 * low-poly pair for each of the five effects, broken and fixed, and the mark that floats over each
 * stop the walk is still going to. Pure, so that every box keeps to its footprint and its height is tested here
 * (`rune-boxes.test.ts`) and the scene only paints and merges. Boxes are in the thing's own frame,
 * front to +z: `x`/`z` the centre on the ground, `y` the centre height, `sx`/`sy`/`sz` the size
 * (`YardBox`). One shape serves every object of an effect: the label says which it is, never the
 * shape. Nothing here is solid.
 */

import { IMPROVEMENT_COLORS } from "@/lib/realm/improvements";
import type { RuneEffect } from "@/lib/realm/rune-objects";
import { box, type YardBox } from "./keep-yard-boxes";

const { stone: STONE, timber: TIMBER, gold: GOLD } = IMPROVEMENT_COLORS;
const DARK_TIMBER = "#6f4f2c";
/** Splintered, bleached timber: what a broken thing is made of. */
const SPLINTER = "#b59a72";
const ASH = "#4a4742";
const FLAME = "#f08a2e";
const FLAME_TIP = "#f6d365";
const DRY_SOIL = "#b89a68";
const WET_SOIL = "#5a4128";
const STALK_DRY = "#a99a5a";
const STALK = "#4f8f3f";
const LEAF = "#3f8a3a";
const LEAF_DRY = "#9a8a4a";
const BLOOM = "#d9658b";
const BARK = "#6b4a2a";
const IRON = "#58606a";
const LATCH = "#b8483f";

/**
 * A cart on two wheels. Broken: one wheel gone and lying flat on the ground, the bed dropped at that
 * end, a plank beside it. Fixed: both wheels on, the bed level, a rail along each side.
 */
const MEND_BROKEN: readonly YardBox[] = [
  box(DARK_TIMBER, -0.6, 0, 0.08, 0.24, 0, 0.7),
  box(DARK_TIMBER, -0.6, 0, 0.08, 0.7, 0.23, 0.24),
  box(TIMBER, -0.1, 0, 1.0, 1.2, 0.2, 0.12),
  box(SPLINTER, 0.3, 0, 0.4, 1.2, 0.08, 0.12),
  box(DARK_TIMBER, 0.42, 0.45, 0.5, 0.5, 0, 0.08),
  box(SPLINTER, -0.4, -0.7, 0.14, 0.06, 0, 0.5),
];

const MEND_FIXED: readonly YardBox[] = [
  ...[-0.6, 0.6].flatMap((x) => [box(DARK_TIMBER, x, 0, 0.08, 0.24, 0, 0.7), box(DARK_TIMBER, x, 0, 0.08, 0.7, 0.23, 0.24)]),
  box(TIMBER, 0, 0, 1.1, 1.2, 0.4, 0.12),
  box(TIMBER, -0.5, 0, 0.06, 1.2, 0.52, 0.34),
  box(TIMBER, 0.5, 0, 0.06, 1.2, 0.52, 0.34),
];

/** A lamp or a brazier: a stone stand and a bowl. Broken: cold ash. Fixed: flames, the tip pale gold. */
const LIGHT_BROKEN: readonly YardBox[] = [
  box(STONE, 0, 0, 0.5, 0.5, 0, 0.14),
  box(DARK_TIMBER, 0, 0, 0.12, 0.12, 0.14, 1.0),
  box(IRON, 0, 0, 0.6, 0.6, 1.14, 0.2),
  box(ASH, 0, 0, 0.44, 0.44, 1.34, 0.08),
];

const LIGHT_FIXED: readonly YardBox[] = [
  box(STONE, 0, 0, 0.5, 0.5, 0, 0.14),
  box(DARK_TIMBER, 0, 0, 0.12, 0.12, 0.14, 1.0),
  box(IRON, 0, 0, 0.6, 0.6, 1.14, 0.2),
  box(FLAME, 0, 0, 0.36, 0.36, 1.34, 0.3),
  box(FLAME_TIP, 0, 0, 0.18, 0.18, 1.64, 0.3),
  box(GOLD, 0, 0, 0.1, 0.1, 1.94, 0.18),
];

/** A raised bed: a timber frame round soil. Broken: dry, pale soil and two limp stalks. Fixed: dark soil, green stems and a bloom each. */
const frame = (): YardBox[] => [
  box(TIMBER, 0, -0.55, 1.5, 0.1, 0, 0.3),
  box(TIMBER, 0, 0.55, 1.5, 0.1, 0, 0.3),
  box(TIMBER, -0.7, 0, 0.1, 1.0, 0, 0.3),
  box(TIMBER, 0.7, 0, 0.1, 1.0, 0, 0.3),
];

const WATER_BROKEN: readonly YardBox[] = [
  ...frame(),
  box(DRY_SOIL, 0, 0, 1.3, 1.0, 0.1, 0.12),
  box(STALK_DRY, -0.3, 0.1, 0.08, 0.08, 0.22, 0.3),
  box(STALK_DRY, 0.3, -0.1, 0.08, 0.08, 0.22, 0.24),
];

const WATER_FIXED: readonly YardBox[] = [
  ...frame(),
  box(WET_SOIL, 0, 0, 1.3, 1.0, 0.1, 0.18),
  box(STALK, -0.3, 0.1, 0.08, 0.08, 0.28, 0.7),
  box(STALK, 0.3, -0.1, 0.08, 0.08, 0.28, 0.6),
  box(BLOOM, -0.3, 0.1, 0.26, 0.26, 0.98, 0.2),
];

/** A gate between two posts. Broken: shut, barred and latched. Fixed: the bar gone and the gate swung wide. */
const OPEN_BROKEN: readonly YardBox[] = [
  box(DARK_TIMBER, -0.7, 0, 0.14, 0.14, 0, 1.4),
  box(DARK_TIMBER, 0.7, 0, 0.14, 0.14, 0, 1.4),
  box(TIMBER, 0, 0, 1.26, 0.07, 0.2, 0.9),
  box(IRON, 0, 0.06, 1.3, 0.05, 0.62, 0.1),
  box(LATCH, 0, 0.1, 0.16, 0.06, 0.58, 0.18),
];

const OPEN_FIXED: readonly YardBox[] = [
  box(DARK_TIMBER, -0.7, 0, 0.14, 0.14, 0, 1.4),
  box(DARK_TIMBER, 0.7, 0, 0.14, 0.14, 0, 1.4),
  box(TIMBER, -0.7, 0.4, 0.07, 0.6, 0.2, 0.9),
  box(IRON, -0.7, 0.4, 0.05, 0.6, 0.62, 0.1),
];

/** A tree on a mound. Broken: a short bare trunk and a drooping, yellowed crown. Fixed: a tall green crown. */
const GROW_BROKEN: readonly YardBox[] = [
  box(BARK, 0, 0, 0.26, 0.26, 0, 0.9),
  box(LEAF_DRY, 0, 0, 0.9, 0.9, 0.7, 0.3),
  box(LEAF_DRY, 0.45, 0, 0.3, 0.5, 0.45, 0.3),
  box(LEAF_DRY, -0.45, 0, 0.3, 0.5, 0.4, 0.3),
];

const GROW_FIXED: readonly YardBox[] = [
  box(BARK, 0, 0, 0.3, 0.3, 0, 1.4),
  box(LEAF, 0, 0, 1.4, 1.4, 1.1, 0.6),
  box(LEAF, 0, 0, 1.0, 1.0, 1.7, 0.5),
  box(LEAF, 0, 0, 0.6, 0.6, 2.15, 0.2),
];

const OBJECT_BOXES: Readonly<Record<RuneEffect, { broken: readonly YardBox[]; fixed: readonly YardBox[] }>> = {
  mend: { broken: MEND_BROKEN, fixed: MEND_FIXED },
  light: { broken: LIGHT_BROKEN, fixed: LIGHT_FIXED },
  water: { broken: WATER_BROKEN, fixed: WATER_FIXED },
  open: { broken: OPEN_BROKEN, fixed: OPEN_FIXED },
  grow: { broken: GROW_BROKEN, fixed: GROW_FIXED },
};

/** One effect's object, broken or fixed, in its own frame (front to +z), inside a 1.6 by 1.6 footprint and at most 2.4 tall. A fresh copy each call. */
export function runeObjectBoxes(effect: RuneEffect, fixed: boolean): YardBox[] {
  return OBJECT_BOXES[effect][fixed ? "fixed" : "broken"].map((b) => ({ ...b }));
}

/**
 * The mark that floats over each stop the walk is still going to: a gold arrow pointing down, between 2.0 and 3.0
 * above the ground and under 0.6 across, so it reads from across the village and never hides the object.
 */
export function runeMarkBoxes(): YardBox[] {
  return [box(GOLD, 0, 0, 0.12, 0.12, 2.45, 0.45), box(GOLD, 0, 0, 0.3, 0.3, 2.3, 0.15), box(GOLD, 0, 0, 0.16, 0.16, 2.15, 0.15)];
}

/** One object as the painter places it: where it stands, its turn, and its boxes in its own frame. */
export type RunePaint = { id: string; x: number; z: number; ry: number; boxes: YardBox[] };

/**
 * What the painter (`rune-objects.tsx`) draws for each rune object, pure so it is tested here
 * without `three`. An object is drawn fixed when its record says so or it was `mended` on this walk
 * (R-I21: the right cast shows at once, before the record lands). A `named` object the walk is still
 * going to, and not yet mended, wears the gold mark over it; the frame hands every one of them over
 * broken, whatever its record says (`withRuneWalk`, owner 2026-11-21). With runes off the canvas lists
 * no runes, so nothing is drawn.
 */
export function runeObjectPaint(
  runes: readonly { id: string; effect: RuneEffect; x: number; z: number; ry: number; fixed: boolean }[] | undefined,
  named: readonly string[] = [],
  mended: readonly string[] = [],
): RunePaint[] {
  return (runes ?? []).map((r) => {
    const done = mended.includes(r.id);
    const boxes = runeObjectBoxes(r.effect, r.fixed || done);
    if (named.includes(r.id) && !done) boxes.push(...runeMarkBoxes());
    return { id: r.id, x: r.x, z: r.z, ry: r.ry, boxes };
  });
}
