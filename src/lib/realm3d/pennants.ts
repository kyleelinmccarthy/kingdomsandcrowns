/**
 * WHERE A GILDED BUILDING'S PENNANT FLIES: the foot of its pole, on top of the roof the scene
 * draws. Pure, so the rule is tested without three; `gilded-pennants.tsx` only draws it.
 *
 * Not from the prop's `size.h` alone: that is the old sprite's height (2.5 for a cottage), and
 * `spike-scene.tsx` draws every building at absolute heights measured against the hero. So the
 * scene hands in its own plan (`SITE_PLAN`, `WALL_H`, `ROOF_H`), the way `buildColliders` in
 * `collision.ts` takes it, and every height here is derived from that plan and the prop.
 */

import type { Prop } from "@/lib/realm/layout";
import type { PlanOpts } from "./collision";

export type PennantSpot = { id: string; x: number; y: number; z: number };
export type PennantPlan = Pick<PlanOpts, "sitePlan" | "wallH" | "roofH">;

/** The well's pyramid cap tops out at 4.5 (spike-scene's `Well`: a 1.5 cone centred at 3.75). */
const WELL_TOP = 4.5;
/** The chapel's steeple tip: spike-scene's `Chapel`, a 2.9 cone centred at 6.9. */
const STEEPLE_TOP = 8.35;
/** The watchtower's cap slab sits on its walls, 0.3 thick (spike-scene's `Watchtower`). */
const TOWER_CAP = 0.3;

/**
 * Where the pole stands on one building, relative to its slot and its ground. The chapel's goes on
 * its steeple, set off the back of the nave as `collision.ts` places it, so it is not lost against
 * the spire; the garden has no roof, so its pole stands in the beds.
 */
function top(p: Prop, o: PennantPlan): { y: number; dz: number } {
  if (p.id === "well") return { y: WELL_TOP, dz: 0 };
  if (p.id === "garden") return { y: 0, dz: 0 };
  if (p.id === "watchtower") return { y: p.size.h * 1.5 + TOWER_CAP, dz: 0 };
  if (p.id === "chapel") return { y: STEEPLE_TOP, dz: -((p.size.d * o.sitePlan) / 2 + 0.5) };
  return { y: o.wallH + o.roofH, dz: 0 };
}

export function pennantSpots(props: readonly Prop[], gilded: readonly string[], groundAt: (x: number, z: number) => number, o: PennantPlan): PennantSpot[] {
  if (gilded.length === 0) return [];
  const out: PennantSpot[] = [];
  for (const p of props) {
    if (p.kind !== "building" || !gilded.includes(p.id)) continue;
    const { y, dz } = top(p, o);
    const { x, z } = p.position;
    out.push({ id: p.id, x, y: groundAt(x, z) + y, z: z + dz });
  }
  return out;
}
