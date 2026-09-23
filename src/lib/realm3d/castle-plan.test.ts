import { describe, expect, it } from "vitest";
import { BUILDING_SLOTS, buildingFootprint, buildWorldLayout, CASTLE_POSITION, TERRAIN } from "@/lib/realm/layout";
import { castlePlan, CASTLE_TIERS, GATE_FRONT, ROAD_END, type CastleBlock } from "./castle-plan";

const HERO = 2.3;
const plan = castlePlan("castle");

/** Every village site's plinth, as the scene draws it: re-plotted 1.5x, plinth a shade wider. */
const sites = Object.entries(BUILDING_SLOTS).map(([id, s]) => {
  const f = buildingFootprint(id);
  const grow = id === "watchtower" ? 1.2 : 1.06;
  return { id, x: s.x - CASTLE_POSITION.x, z: s.z - CASTLE_POSITION.z, hw: (f.w * 1.5 * grow) / 2, hd: (f.d * 1.5 * grow) / 2 };
});

/** Gap between a castle block and an axis-aligned box; negative when they overlap. */
function gap(b: CastleBlock, r: { x: number; z: number; hw: number; hd: number }): number {
  if (b.round) {
    const dx = Math.max(0, Math.abs(b.x - r.x) - r.hw);
    const dz = Math.max(0, Math.abs(b.z - r.z) - r.hd);
    return Math.hypot(dx, dz) - b.hw;
  }
  const dx = Math.abs(b.x - r.x) - b.hw - r.hw;
  const dz = Math.abs(b.z - r.z) - b.hd - r.hd;
  return dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz);
}

describe("the castle", () => {
  it("dwarfs the child at every tier, even the first", () => {
    for (const tier of Object.keys(CASTLE_TIERS)) {
      const p = castlePlan(tier);
      const walls = p.parts.filter((q) => q.shape === "box" && q.color === "stone");
      expect(Math.max(...walls.map((q) => q.sy)), tier).toBeGreaterThanOrEqual(HERO * 2.9);
      expect(p.height, tier).toBeGreaterThan(HERO * 8);
    }
  });

  it("dwarfs the child who owns it", () => {
    const walls = plan.parts.filter((p) => p.shape === "box" && p.color === "stone");
    expect(Math.max(...walls.map((p) => p.sy))).toBeGreaterThanOrEqual(HERO * 4);
    expect(plan.height).toBeGreaterThan(HERO * 10);
    // ...and the gate is a gate a child walks up to, not a cat flap.
    const door = plan.parts.find((p) => p.color === "wood")!;
    expect(door.sy).toBeGreaterThan(HERO * 2);
  });

  it("stands clear of every building site in the village", () => {
    for (const b of plan.solids) for (const s of sites) expect(gap(b, s), `${s.id}`).toBeGreaterThan(0.05);
  });

  it("leaves the tracks out to Longwater and Highcairn open", () => {
    const trails = TERRAIN.filter((t) => t.kind === "trail");
    for (const b of plan.solids) {
      for (const t of trails) {
        const r = { x: t.position.x - CASTLE_POSITION.x, z: t.position.z - CASTLE_POSITION.z, hw: t.size.w / 2 + 0.6, hd: t.size.d / 2 + 0.6 };
        expect(gap(b, r), `trail at ${t.position.x},${t.position.z}`).toBeGreaterThan(0);
      }
    }
  });

  it("meets the road: flagstones run from the gate to where the last path tile ends", () => {
    const layout = buildWorldLayout({ castleType: "castle", buildings: [] });
    const roadEnd = Math.min(...layout.props.filter((p) => p.kind === "path").map((p) => p.position.z - p.size.d / 2)) - CASTLE_POSITION.z;
    expect(roadEnd).toBeGreaterThan(GATE_FRONT); // the road stops short of the doors...
    expect(Math.abs(roadEnd - ROAD_END)).toBeLessThan(0.3); // ...exactly where the apron ends
    const apron = plan.parts.find((p) => p.shape === "box" && p.sy < 0.2 && p.sz > 1 && p.z > GATE_FRONT)!;
    expect(apron.z - apron.sz / 2).toBeCloseTo(GATE_FRONT);
    expect(apron.z + apron.sz / 2).toBeCloseTo(ROAD_END);
  });

  it("puts the interact spot in front of the doors, outside every wall", () => {
    const g = plan.gate;
    for (const b of plan.solids) expect(gap(b, { x: g.x, z: g.z, hw: 0.01, hd: 0.01 })).toBeGreaterThan(-g.hd - 0.01);
    expect(g.z).toBeGreaterThan(GATE_FRONT);
  });

  it("gives the camera something taller than the walls to steer round, and the hero something to stop at", () => {
    expect(plan.solids.length).toBeGreaterThan(4);
    const tallestSolid = Math.max(...plan.solids.map((b) => b.top));
    const tallestOcc = Math.max(...plan.occluders.map((b) => b.top));
    expect(tallestOcc).toBeGreaterThan(tallestSolid);
  });

  it("hangs eight banners, and stands smaller for a smaller tier", () => {
    expect(plan.bannerSpots.length).toBe(8);
    const camp = castlePlan("campsite");
    expect(camp.height).toBeLessThan(plan.height);
    expect(camp.bounds.x1).toBeLessThan(plan.bounds.x1);
    for (const tier of Object.keys(CASTLE_TIERS)) {
      const p = castlePlan(tier);
      for (const b of p.solids) for (const s of sites) expect(gap(b, s), `${tier} vs ${s.id}`).toBeGreaterThan(0.05);
    }
  });
});
