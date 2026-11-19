// Shared checks for anything the Realm stands on open ground: does it clear the sites, the road,
// the lap ring, the ceremony plaza and the village's own decorations? Pure; used by the
// improvement and keep-yard tests. The village's twelve decorations are held to the same rules in
// layout.test.ts, which spells them inline; these are the same constants, written as rectangles.
import { BUILDINGS } from "@/lib/utils/kingdom";
import { BUILDING_SLOTS, CASTLE_POSITION, COSMETIC_TERRAIN, DECOR_SPOTS, SCENERY, TERRAIN, buildingFootprint } from "@/lib/realm/layout";
import { LAP_WAYPOINTS } from "@/lib/realm/recess/recess";
import { CASTLE_TIERS, castlePlan } from "@/lib/realm3d/castle-plan";
import { heightAt } from "@/lib/realm3d/heightfield";
import { PLOT_SCALE } from "@/lib/realm3d/lead";

/** The scene draws every building and foundation this many times wider and deeper than its slot (`SITE_PLAN` in spike-scene.tsx; a test holds the two equal). */
export const DRAWN = PLOT_SCALE;

export type R = { x0: number; x1: number; z0: number; z1: number };
export const rectAt = (x: number, z: number, w: number, d: number): R => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
export const grow = (r: R, pad: number): R => ({ x0: r.x0 - pad, x1: r.x1 + pad, z0: r.z0 - pad, z1: r.z1 + pad });
/** True when the two rectangles share area (touching edges do not count). */
export const overlaps = (a: R, b: R): boolean => a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.z0 < b.z1 - 1e-9 && b.z0 < a.z1 - 1e-9;
export const hasPoint = (r: R, p: { x: number; z: number }): boolean => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
export const distToRect = (r: R, p: { x: number; z: number }): number => Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.z0 - p.z, 0, p.z - r.z1));

/** A building as the scene draws it. */
export function drawnSite(id: string): R {
  const f = buildingFootprint(id);
  const s = BUILDING_SLOTS[id];
  return rectAt(s.x, s.z, f.w * DRAWN, f.d * DRAWN);
}

/**
 * The castle as the scene draws and collides with it: `castlePlan(tier).bounds` (local to the
 * castle's position, +z the gate side) for every tier, moved to the world. This is far bigger than
 * the layout's `CASTLE_FOOTPRINTS`: the curtain wall runs about thirty units back from the gate.
 */
export function castleBounds(tier: string): R {
  const b = castlePlan(tier).bounds;
  return { x0: CASTLE_POSITION.x + b.x0, x1: CASTLE_POSITION.x + b.x1, z0: CASTLE_POSITION.z + b.z0, z1: CASTLE_POSITION.z + b.z1 };
}
export const CASTLE_TIER_IDS = Object.keys(CASTLE_TIERS);

/** The village floor is held at height 0 (the generator keeps it nearly flat out to `FLAT_RADIUS`); this is how far a corner may sit from it before something stands crooked. */
export const LEVEL_TOLERANCE = 0.3;
/** Why a rectangle does not stand on level ground: its corners and middle, against the village floor. */
export function levelFailures(what: string, rect: R): string[] {
  const out: string[] = [];
  for (const [x, z] of [[rect.x0, rect.z0], [rect.x0, rect.z1], [rect.x1, rect.z0], [rect.x1, rect.z1], [(rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2]]) {
    const h = heightAt(x, z);
    if (Math.abs(h) > LEVEL_TOLERANCE) out.push(`${what} stands on sloping ground (${h.toFixed(2)}) at ${x.toFixed(1)},${z.toFixed(1)}`);
  }
  return out;
}

/** The road: two units wide, from the south gate to the nearest a castle's south face can be. */
export const ROAD: R = { x0: -1, x1: 1, z0: -14, z1: 18 };
/** The ceremony plaza: 4.5 either side of the middle, eight deep south of the castle's face, across every tier (checked with half a unit to spare). */
export const PLAZA: R = { x0: -4.5, x1: 4.5, z0: -13, z1: -2 };

/** Every reason a rectangle on open ground may not stand where it does. `host` is a building whose own site it belongs to. */
export function clearanceFailures(what: string, rect: R, host?: string): string[] {
  const out: string[] = [];
  for (const b of BUILDINGS) {
    if (b.id === host) {
      if (overlaps(rect, drawnSite(b.id))) out.push(`${what} is inside its own ${b.id}`);
    } else if (overlaps(rect, grow(drawnSite(b.id), 2))) out.push(`${what} is within 2 of the ${b.id} site`);
  }
  for (const tier of CASTLE_TIER_IDS) if (overlaps(rect, grow(castleBounds(tier), 1))) out.push(`${what} is within 1 of the ${tier} castle`);
  if (overlaps(rect, grow(ROAD, 1))) out.push(`${what} is on the road`);
  if (overlaps(rect, grow(PLAZA, 0.5))) out.push(`${what} is on the ceremony plaza`);
  for (const w of LAP_WAYPOINTS) if (distToRect(rect, w) < 2) out.push(`${what} is on the lap ring at ${w.x},${w.z}`);
  for (const d of DECOR_SPOTS) if (hasPoint(grow(rect, 1), d)) out.push(`${what} is by the ${d.kind} at ${d.x},${d.z}`);
  for (const d of SCENERY) if (hasPoint(grow(rect, 0.5), d.position)) out.push(`${what} is on scenery ${d.id}`);
  for (const t of TERRAIN) {
    if (COSMETIC_TERRAIN.includes(t.kind)) continue;
    if (overlaps(rect, rectAt(t.position.x, t.position.z, t.size.w, t.size.d))) out.push(`${what} is on ${t.kind} ${t.id}`);
  }
  return out;
}
