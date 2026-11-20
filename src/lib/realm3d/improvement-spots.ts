/**
 * WHERE BUILT PLANS STAND (D13): every improvement the hero has built, with its boxes moved to the
 * world and the point in front of it where its plaque is read. Pure, so the placing is tested
 * without three; `components/realm3d/improvements.tsx` only paints and merges what this returns.
 *
 * A building's wing uses `BUILDING_SLOTS[host]`, the very centre the scene draws the building at.
 * The Chronicle Hall stands on its keep-yard spot and each village decoration on its own spot.
 * The catalog's boxes are already held clear of the sites, the road and the rest (`improvements.test.ts`),
 * so this adds only the offset.
 */

import { IMPROVEMENT_IDS, IMPROVEMENTS, LEVELS, type ImprovementBox, type ImprovementId } from "@/lib/realm/improvements";
import { KEEP_YARD, VILLAGE_DECOR_SPOTS } from "@/lib/realm/keep-yard";
import { BUILDING_SLOTS, type Vec2 } from "@/lib/realm/layout";

export type Placement = {
  id: ImprovementId;
  /** The highest built level: its boxes and every earlier level's are in `boxes`. */
  level: number;
  /** The host's centre on the ground, and the ground's height there. */
  x: number;
  y: number;
  z: number;
  /** Every built level's boxes, `x`/`z` in the world and `y` still in the host's frame (the scene adds `y` above). */
  boxes: ImprovementBox[];
  /** Where the plaque stands and is read: a step in front (toward +z) of the improvement, or beside it on the east when the front is not open ground. */
  plaque: Vec2;
};

/** How far past the improvement's front (or east) edge the plaque stone stands, edge to centre. */
const PLAQUE_GAP = 0.8;

/**
 * Plans whose front is not open ground (the granary's faces its mill, the arches' stands on a trail, the
 * reading wing's is crowded by the garden, the hall's meets the oaks, the beacon loft's is grove floor as
 * it is drawn, turned; the fountain's and the statue's face the keep yard): their plaque stands on the
 * east side instead. `improvement-spots.test.ts` holds every plaque spot clear of the world, and
 * `keep-yard.test.ts` holds them 1.5 from the yard, so a change that closes a side fails there.
 */
const PLAQUE_ON_EAST: ReadonlySet<ImprovementId> = new Set(["mill-granary", "bridge-arches", "library-reading-wing", "chronicle-hall", "watchtower-beacon", "village-fountain", "village-statue"]);

/** The plaque stone, in its own frame (centre on the ground; it fits a 0.7 square): a pedestal and a gold plate on its front. */
export const PLAQUE_BOXES: readonly ImprovementBox[] = [
  { x: 0, y: 0.35, z: 0, sx: 0.5, sy: 0.7, sz: 0.3, color: "stone" },
  { x: 0, y: 0.5, z: 0.16, sx: 0.4, sy: 0.3, sz: 0.04, color: "gold" },
];

function originOf(id: ImprovementId): Vec2 | null {
  const host = IMPROVEMENTS[id].host;
  if (host === "keep") return KEEP_YARD.chronicleHall;
  if (host === "village") return VILLAGE_DECOR_SPOTS[id as keyof typeof VILLAGE_DECOR_SPOTS] ?? null;
  return BUILDING_SLOTS[host] ?? null;
}

/** One hung frame in the world: (`x`, `z`) the back of the frame on its wall, `y` its centre height, `ry` its facing. */
export type FrameSlot = { x: number; y: number; z: number; ry: number };

/**
 * Where the Chronicle Hall's frames hang for a hall of `level` (0 = not built): every built
 * level's frames, in catalog order, in the world. Slot i is the hero's i-th newest drawing, and the
 * earlier slots never move as the hall grows. A level that is not a whole number from 1 to 3 hangs none.
 */
export function hallFrameSlots(level: number, heightAt: (x: number, z: number) => number): FrameSlot[] {
  if (!Number.isInteger(level) || level < 1) return [];
  const origin = KEEP_YARD.chronicleHall;
  const ground = heightAt(origin.x, origin.z);
  return IMPROVEMENTS["chronicle-hall"].levels
    .slice(0, Math.min(level, LEVELS))
    .flatMap((l) => l.frames ?? [])
    .map((f) => ({ x: origin.x + f.x, y: ground + f.y, z: origin.z + f.z, ry: f.ry }));
}

export function improvementPlacements(built: Readonly<Record<string, number>>, heightAt: (x: number, z: number) => number): Placement[] {
  const out: Placement[] = [];
  for (const id of IMPROVEMENT_IDS) {
    const level = Object.hasOwn(built, id) ? built[id] : 0;
    if (!Number.isInteger(level) || level < 1 || level > LEVELS) continue;
    const origin = originOf(id);
    if (!origin) continue;
    const levels = IMPROVEMENTS[id].levels;
    const boxes = levels.slice(0, level).flatMap((l) => l.boxes.map((b) => ({ ...b, x: b.x + origin.x, z: b.z + origin.z })));
    // The plaque sits off the whole plan, not what stands so far, so it stays put as levels go up.
    const all = levels.flatMap((l) => l.boxes);
    const left = Math.min(...all.map((b) => b.x - b.sx / 2));
    const right = Math.max(...all.map((b) => b.x + b.sx / 2));
    const front = Math.max(...all.map((b) => b.z + b.sz / 2));
    const back = Math.min(...all.map((b) => b.z - b.sz / 2));
    const plaque = PLAQUE_ON_EAST.has(id)
      ? { x: origin.x + right + PLAQUE_GAP, z: origin.z + (front + back) / 2 }
      : { x: origin.x + (left + right) / 2, z: origin.z + front + PLAQUE_GAP };
    out.push({
      id,
      level,
      x: origin.x,
      y: heightAt(origin.x, origin.z),
      z: origin.z,
      boxes,
      plaque,
    });
  }
  return out;
}
