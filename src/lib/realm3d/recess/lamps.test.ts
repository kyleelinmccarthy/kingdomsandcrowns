import { describe, expect, it } from "vitest";
import { buildWorldLayout, BUILDING_SLOTS, CASTLE_FOOTPRINTS } from "@/lib/realm/layout";
import { buildColliders, type Collider } from "../collision";
import { castlePlan } from "../castle-plan";
import { heightAt } from "../heightfield";
import { realmWorld } from "../worldgen";
import { ARCH, ARCH_HALF_SPAN, buildLapCourse, POST_RADIUS } from "./course";
import { LAMP_COUNT, LAMP_POST_GAP, ringLamps, roadLamps } from "./lamps";

const world = realmWorld();
const course = buildLapCourse();
const lamps = roadLamps();

/** Everything solid, as the scene builds it, with every building raised and the castle at `tier`. */
function solidsFor(tier: string): Collider[] {
  const layout = buildWorldLayout({
    castleType: tier,
    buildings: Object.keys(BUILDING_SLOTS).map((id) => ({ id, done: 3, total: 3, complete: true })),
    villagers: true,
    banners: 8,
    decor: true,
    objectiveIds: [],
  });
  const built = buildColliders(layout.props.filter((p) => p.kind !== "castle"), layout.scenery, { sitePlan: 1.5, wallH: 3.1, roofH: 2.25, treeScale: 1.25, patchHalf: 80 });
  const castle = layout.props.find((p) => p.kind === "castle")!;
  const plan = castlePlan(tier);
  const g = heightAt(castle.position.x, castle.position.z);
  for (const b of plan.solids) built.solids.push({ x: castle.position.x + b.x, z: castle.position.z + b.z, hw: b.hw, hd: b.hd, round: b.round, base: g + b.base, top: g + b.top });
  world.forEachPropNear(-25, 3, 60, (p) => {
    if (!p.solid) return;
    const tree = p.variant === "oak" || p.variant === "pine";
    const r = tree ? 0.42 * p.scale : p.variant === "menhir" ? 0.32 * p.scale : 0.62 * p.scale;
    built.solids.push({ x: p.x, z: p.z, hw: Math.max(0.35, r), hd: Math.max(0.35, r), round: true, base: p.y, top: p.y + 2.4 * p.scale });
  });
  return built.solids;
}

function clearance(solids: readonly Collider[], x: number, z: number): number {
  let best = Infinity;
  for (const c of solids) {
    const d = c.round ? Math.hypot(c.x - x, c.z - z) - c.hw : Math.hypot(Math.max(0, Math.abs(x - c.x) - c.hw), Math.max(0, Math.abs(z - c.z) - c.hd));
    best = Math.min(best, d);
  }
  return best;
}

/** Distance from a point to the Ring's own line. */
function offRing(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < course.path.length - 1; i++) {
    const a = course.path[i];
    const b = course.path[i + 1];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(a.x + vx * t - x, a.z + vz * t - z));
  }
  return best;
}

describe("the road's lamps", () => {
  it("are twelve, numbered in the order they light, and the same row every time", () => {
    expect(lamps).toHaveLength(LAMP_COUNT);
    lamps.forEach((l, i) => expect(l.index).toBe(i));
    expect(roadLamps()).toEqual(lamps);
    expect(ringLamps()).toBe(ringLamps());
  });

  it("run OUT of the village: each lamp further from the arch than the one before", () => {
    const from = (l: { x: number; z: number }) => Math.hypot(l.x - ARCH.x, l.z - ARCH.z);
    for (let i = 1; i < lamps.length; i++) expect(from(lamps[i])).toBeGreaterThan(from(lamps[i - 1]));
    // The first is a few steps west of the arch, where the spawn can see it; the last is out by the Ringstones.
    expect(from(lamps[0])).toBeLessThan(8);
    expect(lamps[0].x).toBeLessThan(ARCH.x - ARCH_HALF_SPAN);
    const ringstones = world.landmarks.find((l) => l.id === "ringstones")!;
    expect(Math.hypot(lamps[lamps.length - 1].x - ringstones.position.x, lamps[lamps.length - 1].z - ringstones.position.z)).toBeLessThan(ringstones.radius);
  });

  it.each(Object.keys(CASTLE_FOOTPRINTS))("stand clear of every wall, tree and stone (castle: %s)", (tier) => {
    const solids = solidsFor(tier);
    for (const l of lamps) expect(clearance(solids, l.x, l.z), `lamp ${l.index}`).toBeGreaterThan(0.6);
  });

  it("stand on dry ground, a step off the Ring's line, and out of every post's ring", () => {
    for (const l of lamps) {
      expect(world.waterLevelAt(l.x, l.z) - world.heightAt(l.x, l.z), `lamp ${l.index}`).toBeLessThan(0);
      expect(offRing(l.x, l.z), `lamp ${l.index}`).toBeGreaterThan(1.2);
      for (const p of course.posts) expect(Math.hypot(p.position.x - l.x, p.position.z - l.z)).toBeGreaterThanOrEqual(Math.max(LAMP_POST_GAP, POST_RADIUS));
    }
  });

  it("keep out of the arch's way", () => {
    for (const l of lamps) expect(Math.hypot(l.x - (ARCH.x - ARCH_HALF_SPAN), l.z - ARCH.z)).toBeGreaterThan(1.5);
  });
});
