/**
 * THE PICTURE RUN'S MAP: the village seen from above, north up, for answering a reading clue off
 * the Realm (slice 5). Pure and client-safe: a projection from world units to map pixels and the
 * backdrop drawn under the buttons (the eight sites, the castle's front, the Tower's plot, the
 * road). The map's controls are real buttons laid over the picture at `trailMapPoint`, each
 * `TRAIL_MAP_HIT` pixels from its centre to its edge; `trail-map.test.ts` holds the fit at 360 wide.
 */

import { BUILDINGS } from "@/lib/utils/kingdom";
import { BUILDING_SLOTS, buildingFootprint, CASTLE_POSITION, SPAWN } from "./layout";
import { PUZZLE_TOWER } from "./puzzle-tower";
import { ANCHORS, ANCHOR_IDS } from "./anchors";
import { GATE_FRONT } from "@/lib/realm3d/castle-plan";
import { PLOT_SCALE } from "@/lib/realm3d/lead";

/** A button's half-size in map pixels: no two anchors are closer than twice this, and none is nearer the edge. */
export const TRAIL_MAP_HIT = 20;

type Box = { id: string; x0: number; x1: number; z0: number; z1: number };

/** The castle as the map draws it: a fixed 8 by 4 block at its south front, not the whole compound. */
const CASTLE_BLOCK = { w: 8, d: 4 };

/** Every plot the backdrop draws, in world units: the eight sites as the scene draws them, the castle's front, the Tower's plot. */
const WORLD_PLOTS: readonly Box[] = [
  ...BUILDINGS.map((b): Box => {
    const s = BUILDING_SLOTS[b.id];
    const f = buildingFootprint(b.id);
    const hw = (f.w * PLOT_SCALE) / 2;
    const hd = (f.d * PLOT_SCALE) / 2;
    return { id: b.id, x0: s.x - hw, x1: s.x + hw, z0: s.z - hd, z1: s.z + hd };
  }),
  (() => {
    const front = CASTLE_POSITION.z + GATE_FRONT;
    return { id: "castle", x0: CASTLE_POSITION.x - CASTLE_BLOCK.w / 2, x1: CASTLE_POSITION.x + CASTLE_BLOCK.w / 2, z0: front - CASTLE_BLOCK.d, z1: front };
  })(),
  { id: "tower", x0: PUZZLE_TOWER.x - PUZZLE_TOWER.plot / 2, x1: PUZZLE_TOWER.x + PUZZLE_TOWER.plot / 2, z0: PUZZLE_TOWER.z - PUZZLE_TOWER.plot / 2, z1: PUZZLE_TOWER.z + PUZZLE_TOWER.plot / 2 },
];

/** The world rectangle the picture covers: the anchors' stakes and objects, every plot and the spawn, then a button's reach all round. */
const EXTENT = (() => {
  const xs = [...WORLD_PLOTS.flatMap((p) => [p.x0, p.x1]), ...ANCHOR_IDS.map((id) => ANCHORS[id].x), SPAWN.x];
  const zs = [...WORLD_PLOTS.flatMap((p) => [p.z0, p.z1]), ...ANCHOR_IDS.map((id) => ANCHORS[id].z), SPAWN.z];
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
})();

const W = 360;
/** Pixels per world unit, the same both ways: the width fitted, with a button's reach spare either side. */
const SCALE = (W - 2 * TRAIL_MAP_HIT) / (EXTENT.x1 - EXTENT.x0);

/** The picture's size: 360 wide, as tall as the village's extent needs. */
export const TRAIL_MAP_VIEW = { w: W, h: Math.ceil((EXTENT.z1 - EXTENT.z0) * SCALE + 2 * TRAIL_MAP_HIT) } as const;

/** Where a world point falls on the map: north (smaller z) is up, east (larger x) is right. */
export function trailMapPoint(x: number, z: number): { x: number; y: number } {
  return { x: TRAIL_MAP_HIT + (x - EXTENT.x0) * SCALE, y: TRAIL_MAP_HIT + (z - EXTENT.z0) * SCALE };
}

/** What the map draws under its buttons, in map pixels: the road from the spawn to the castle's front, and the ten plots. */
export function trailMapBackdrop(): {
  road: { x1: number; y1: number; x2: number; y2: number }[];
  plots: { id: string; x: number; y: number; w: number; h: number }[];
} {
  const castle = WORLD_PLOTS.find((p) => p.id === "castle")!;
  const from = trailMapPoint(SPAWN.x, SPAWN.z);
  const to = trailMapPoint(SPAWN.x, castle.z1);
  return {
    road: [{ x1: from.x, y1: from.y, x2: to.x, y2: to.y }],
    plots: WORLD_PLOTS.map((p) => {
      const a = trailMapPoint(p.x0, p.z0);
      const b = trailMapPoint(p.x1, p.z1);
      return { id: p.id, x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
    }),
  };
}
