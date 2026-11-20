/**
 * THE WORLD'S LOCKS' SHAPES, as boxes the scene merges (`components/realm3d/world-locks.tsx`): an
 * old chest and a vault door, each shut or open. Pure, so how they open and that they keep to
 * their footprint are tested here (`world-lock-boxes.test.ts`) and the scene only paints, turns
 * and merges. Boxes are in the lock's own frame, front to +z: `x`/`z` the centre on the ground,
 * `y` the centre height, `sx`/`sy`/`sz` the size (`YardBox`). `part` names what moves.
 */

import { IMPROVEMENT_COLORS } from "@/lib/realm/improvements";
import type { YardBox } from "./keep-yard-boxes";

/** `lid` and `leaf` are what open; `inside` is what an open chest shows. Untagged boxes never move. */
export type LockBox = YardBox & { part?: "lid" | "leaf" | "inside" };

/** How far each lock's boxes reach from its centre, shut or open: the chest's matches its E spot's box. */
export const CHEST_FOOTPRINT = { hw: 0.55, hd: 0.4 } as const;
export const DOOR_FOOTPRINT = { hw: 0.8, hd: 0.5 } as const;
/** The vault door's opening between its pillars, in the frame's own plane: a shut leaf stands in it. */
export const DOOR_OPENING = { hw: 0.5, hd: 0.2 } as const;

const WOOD = "#7a5232";
const LID_WOOD = "#8a5d38";
const IRON = "#3d3b3a";
const DARK_STONE = "#6f6a60";
const VOID = "#151214";
const { gold: GOLD, stone: STONE } = IMPROVEMENT_COLORS;

/** A box by its centre on the ground, footprint, the height of its bottom, and its height. */
const box = (color: string, x: number, z: number, sx: number, sz: number, y0: number, sy: number, part?: LockBox["part"]): LockBox => ({
  x, y: y0 + sy / 2, z, sx, sy, sz, color, ...(part ? { part } : {}),
});

const CHEST_BODY: readonly LockBox[] = [
  box(WOOD, 0, 0, 1.0, 0.7, 0, 0.5),
  // Two iron bands round the body, and the lock plate on its front.
  box(IRON, -0.3, 0, 0.08, 0.74, 0, 0.52),
  box(IRON, 0.3, 0, 0.08, 0.74, 0, 0.52),
  box(GOLD, 0, 0.36, 0.16, 0.04, 0.22, 0.16),
];

/** Shut, the lid sits on the body; open, it stands up at the back and the gold inside shows. */
const LID_SHUT = box(LID_WOOD, 0, 0, 1.04, 0.74, 0.5, 0.16, "lid");
const LID_OPEN = box(LID_WOOD, 0, -0.33, 1.04, 0.1, 0.5, 0.7, "lid");
const GOLD_INSIDE = box(GOLD, 0, 0.02, 0.8, 0.5, 0.44, 0.08, "inside");

export function chestBoxes(open: boolean): LockBox[] {
  return open ? [...CHEST_BODY, LID_OPEN, GOLD_INSIDE] : [...CHEST_BODY, LID_SHUT];
}

/** The stone frame: two pillars, a lintel with its keystone, a step, and the dark of the vault behind the leaves. */
const DOOR_FRAME: readonly LockBox[] = [
  box(STONE, -0.62, 0, 0.26, 0.4, 0, 2.3),
  box(STONE, 0.62, 0, 0.26, 0.4, 0, 2.3),
  box(STONE, 0, 0, 1.5, 0.44, 2.3, 0.3),
  box(DARK_STONE, 0, 0, 0.3, 0.48, 2.4, 0.36),
  box(DARK_STONE, 0, 0, 1.0, 0.4, 0, 0.08),
  box(VOID, 0, -0.12, 0.98, 0.04, 0.08, 2.2),
];

/** One leaf, hinge at the origin, reaching along +x: the planks, two iron bands, and half the gold ring at its free edge. */
const LEAF: readonly LockBox[] = [
  box(WOOD, 0.24, 0, 0.48, 0.1, 0.08, 2.2, "leaf"),
  box(IRON, 0.24, 0, 0.48, 0.12, 0.5, 0.08, "leaf"),
  box(IRON, 0.24, 0, 0.48, 0.12, 1.75, 0.08, "leaf"),
  box(GOLD, 0.42, 0, 0.08, 0.14, 1.0, 0.2, "leaf"),
];
const HINGE = { x: 0.49, z: 0.02 };

/**
 * The two leaves, hinged at the pillars. Shut, they meet in the middle of the opening; open, each
 * has swung a quarter turn out toward the hero, and stands square to the frame at its own pillar.
 */
function leaves(open: boolean): LockBox[] {
  const out: LockBox[] = [];
  for (const side of [-1, 1]) {
    for (const b of LEAF) {
      // The left leaf (side -1) reaches right from its hinge, the right leaf left; open, both reach out along +z.
      out.push(
        open
          ? { ...b, x: side * HINGE.x - side * b.z, z: HINGE.z + b.x, sx: b.sz, sz: b.sx }
          : { ...b, x: side * HINGE.x - side * b.x, z: HINGE.z + b.z },
      );
    }
  }
  return out;
}

export function vaultDoorBoxes(open: boolean): LockBox[] {
  return [...DOOR_FRAME, ...leaves(open)];
}
