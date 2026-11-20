// Shared checks for anything the Realm stands on open ground: does it clear the sites, the road,
// the lap ring, the ceremony plaza and the village's own decorations? Pure; used by the
// improvement and keep-yard tests. The village's twelve decorations are held to the same rules in
// layout.test.ts, which spells them inline; these are the same constants, written as rectangles.
import { BUILDINGS } from "@/lib/utils/kingdom";
import { BUILDING_SLOTS, CASTLE_POSITION, COSMETIC_TERRAIN, DECOR_SPOTS, SCENERY, TERRAIN, buildingFootprint } from "@/lib/realm/layout";
import { KEEP_YARD, VILLAGE_DECOR_SPOTS, YARD_RADIUS } from "@/lib/realm/keep-yard";
import { IMPROVEMENT_IDS, IMPROVEMENTS } from "@/lib/realm/improvements";
import { VILLAGERS, villagerPosition } from "@/lib/realm/villagers";
import { improvementPlacements } from "@/lib/realm3d/improvement-spots";
import { VILLAGE_POST } from "@/lib/realm3d/travel";
import { ARCH, ARCH_HALF_SPAN } from "@/lib/realm3d/recess/course";
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

/**
 * Whether a rectangle shares area with a ground patch as it is drawn: turned by its `angle` about
 * its centre (natural ground, the grove floor among it, is never square to the world). The flat
 * scene lays a patch with Euler (-PI/2, 0, angle), which puts a patch-local (u, v) at world
 * (x + u cos + v sin, z - u sin + v cos). Separating axes: the world's two and the patch's two.
 */
export function overlapsPatch(rect: R, patch: { position: { x: number; z: number }; size: { w: number; d: number }; angle?: number }): boolean {
  const a = patch.angle ?? 0;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const hw = patch.size.w / 2;
  const hd = patch.size.d / 2;
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => ({ x: patch.position.x + u * c + v * s, z: patch.position.z - u * s + v * c }));
  const box = [{ x: rect.x0, z: rect.z0 }, { x: rect.x1, z: rect.z0 }, { x: rect.x1, z: rect.z1 }, { x: rect.x0, z: rect.z1 }];
  for (const axis of [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: c, z: -s }, { x: s, z: c }]) {
    const span = (pts: { x: number; z: number }[]) => {
      const d = pts.map((p) => p.x * axis.x + p.z * axis.z);
      return [Math.min(...d), Math.max(...d)];
    };
    const [a0, a1] = span(corners);
    const [b0, b1] = span(box);
    if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
  }
  return true;
}

/**
 * How far a scenery tree's crown reaches from its trunk, as the 3D scene draws it: the oak's widest
 * blob reaches 1.31 model units and the pine's lowest cone 1.0 (`geo-kit.ts`), scaled by the prop's
 * size and the scene's `TREE_SCALE` (spike-scene.tsx; a test holds the two equal). Null for anything
 * that is not a tree.
 */
export const TREE_SCALE = 1.25;
const CROWN_REACH: Record<string, number> = { oak: 1.31, pine: 1.0 };
export function canopyRadius(prop: { variant?: string; size: { h: number } }): number | null {
  const reach = prop.variant ? CROWN_REACH[prop.variant] : undefined;
  return reach === undefined ? null : reach * (prop.size.h / 1.4) * TREE_SCALE;
}

/** The road: two units wide, from the south gate to the nearest a castle's south face can be. */
export const ROAD: R = { x0: -1, x1: 1, z0: -14, z1: 18 };
/** The ceremony plaza: 4.5 either side of the middle, eight deep south of the castle's face, across every tier (checked with half a unit to spare). */
export const PLAZA: R = { x0: -4.5, x1: 4.5, z0: -13, z1: -2 };

/**
 * Every reason a rectangle on open ground may not stand where it does. `host` is a building whose
 * own site it belongs to. `canopyGap`, when given, also keeps it that far from any tree's crown
 * (0: never under one); the keep yard, which stands against the orchard oaks, asks for it.
 */
export function clearanceFailures(what: string, rect: R, host?: string, canopyGap: number | null = null): string[] {
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
  for (const d of SCENERY) {
    if (hasPoint(grow(rect, 0.5), d.position)) out.push(`${what} is on scenery ${d.id}`);
    // A tree's crown hangs over more than its trunk: when asked, nothing stands under one.
    else if (canopyGap !== null) {
      const crown = canopyRadius(d);
      if (crown !== null && distToRect(rect, d.position) < crown + canopyGap) out.push(`${what} is under the crown of ${d.variant} ${d.id} at ${d.position.x.toFixed(1)},${d.position.z.toFixed(1)}`);
    }
  }
  for (const t of TERRAIN) {
    if (COSMETIC_TERRAIN.includes(t.kind)) continue;
    if (overlapsPatch(rect, t)) out.push(`${what} is on ${t.kind} ${t.id}`);
  }
  return out;
}

/** The gap between two rectangles: 0 when they touch or share area. */
export const gap = (a: R, b: R): number => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));

/** The distance from a point to the segment a-b. */
export function segmentDistance(p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/** A named rectangle the village or the keep yard keeps for itself. */
export type Piece = { what: string; rect: R };

const spotBox = (what: string, at: { x: number; z: number }, radius: number): Piece => ({ what, rect: rectAt(at.x, at.z, radius * 2, radius * 2) });

/** The four village decorations' own squares (`YARD_RADIUS`). */
export function villageDecorPieces(): Piece[] {
  return (["village-banners", "village-lamps", "village-fountain", "village-statue"] as const).map((id) => spotBox(id, VILLAGE_DECOR_SPOTS[id], YARD_RADIUS[id]));
}

/** The keep yard's own spots (board, six heaps, hall, lectern), every box of the Chronicle Hall (all three levels) and its plaque. */
export function yardPieces(): Piece[] {
  const hall = KEEP_YARD.chronicleHall;
  return [
    spotBox("plansBoard", KEEP_YARD.plansBoard, YARD_RADIUS.plansBoard),
    ...KEEP_YARD.stockpile.map((s, i) => spotBox(`heap ${i}`, s, YARD_RADIUS.heap)),
    spotBox("chronicleHall", hall, YARD_RADIUS.chronicleHall),
    spotBox("lectern", KEEP_YARD.lectern, YARD_RADIUS.lectern),
    ...IMPROVEMENTS["chronicle-hall"].levels.flatMap((l, li) => l.boxes.map((b, bi) => ({ what: `hall L${li + 1} box ${bi}`, rect: rectAt(hall.x + b.x, hall.z + b.z, b.sx, b.sz) }))),
    ...improvementPlacements({ "chronicle-hall": 3 }, () => 0).map((p) => ({ what: "hall plaque", rect: rectAt(p.plaque.x, p.plaque.z, 0.7, 0.7) })),
  ];
}

/**
 * Everything else the village stands on open ground: the four decorations, every improvement's
 * boxes and plaque built to the top (the hall's belong to the yard), every villager, the village's
 * hitching post and the Ring's arch.
 */
export function villagePieces(): Piece[] {
  const built = improvementPlacements(Object.fromEntries(IMPROVEMENT_IDS.map((id) => [id, 3])), () => 0).filter((p) => p.id !== "chronicle-hall");
  return [
    ...villageDecorPieces(),
    ...built.flatMap((p) => [
      ...p.boxes.map((b, i) => ({ what: `${p.id} box ${i}`, rect: rectAt(b.x, b.z, b.sx, b.sz) })),
      { what: `${p.id} plaque`, rect: rectAt(p.plaque.x, p.plaque.z, 0.7, 0.7) },
    ]),
    ...VILLAGERS.flatMap((v) => {
      const slot = BUILDING_SLOTS[v.buildingId];
      if (!slot) return [];
      const at = villagerPosition(slot, buildingFootprint(v.buildingId));
      return [{ what: `villager ${v.id}`, rect: rectAt(at.x, at.z, 0.9, 0.9) }];
    }),
    { what: "hitching post", rect: rectAt(VILLAGE_POST.x, VILLAGE_POST.z, 0.8, 0.8) },
    { what: "arch", rect: rectAt(ARCH.x, ARCH.z, ARCH_HALF_SPAN * 2, 0.8) },
  ];
}
