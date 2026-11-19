import { describe, expect, it } from "vitest";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { BUILDING_SLOTS, buildingFootprint } from "@/lib/realm/layout";
import { KEEP_YARD, VILLAGE_DECOR_SPOTS } from "@/lib/realm/keep-yard";
import { IMPROVEMENTS, IMPROVEMENT_IDS, type ImprovementId } from "@/lib/realm/improvements";
import { VILLAGERS, villagerPosition } from "@/lib/realm/villagers";
import { clearanceFailures, distToRect, drawnSite, overlaps, rectAt } from "@/test/world-clearance";
import { hallFrameSlots, improvementPlacements, PLAQUE_BOXES } from "./improvement-spots";

const flat = () => 0;
const slope = (x: number, z: number) => 0.1 * x + 0.05 * z;
const WINGS = IMPROVEMENT_IDS.slice(0, 8);
const hostOf = (id: ImprovementId) => IMPROVEMENTS[id].host as string;

describe("improvementPlacements", () => {
  it("places nothing for a hero who has built nothing", () => {
    expect(improvementPlacements({}, flat)).toEqual([]);
  });

  it("is deterministic and follows catalog order", () => {
    const built = { "village-statue": 1, "well-house": 2, "chronicle-hall": 3 };
    const a = improvementPlacements(built, slope);
    expect(improvementPlacements(built, slope)).toEqual(a);
    expect(a.map((p) => p.id)).toEqual(["well-house", "chronicle-hall", "village-statue"]);
    expect(a.map((p) => p.level)).toEqual([2, 3, 1]);
  });

  it("stands a building's wing on the slot the scene draws the building at, beside the building", () => {
    const [p] = improvementPlacements({ "well-house": 3 }, flat);
    expect(p).toMatchObject({ id: "well-house", x: BUILDING_SLOTS.well.x, z: BUILDING_SLOTS.well.z });
    for (const id of WINGS) {
      const host = hostOf(id);
      const [w] = improvementPlacements({ [id]: 3 }, flat);
      expect(w.x, id).toBe(BUILDING_SLOTS[host].x);
      expect(w.z, id).toBe(BUILDING_SLOTS[host].z);
      for (const b of w.boxes) expect(overlaps(rectAt(b.x, b.z, b.sx, b.sz), drawnSite(host)), `${id} is inside its ${host}`).toBe(false);
    }
  });

  it("draws every level up to the built one, in world coordinates", () => {
    const [one] = improvementPlacements({ "well-house": 1 }, flat);
    const [three] = improvementPlacements({ "well-house": 3 }, flat);
    const local = IMPROVEMENTS["well-house"].levels;
    expect(one.boxes).toHaveLength(local[0].boxes.length);
    expect(three.boxes).toHaveLength(local.reduce((n, l) => n + l.boxes.length, 0));
    expect(three.boxes.slice(0, one.boxes.length)).toEqual(one.boxes);
    const first = local[0].boxes[0];
    expect(one.boxes[0]).toEqual({ ...first, x: first.x + BUILDING_SLOTS.well.x, z: first.z + BUILDING_SLOTS.well.z });
    // Heights stay in the host's frame: the scene adds the ground.
    expect(one.boxes[0].y).toBe(first.y);
  });

  it("puts the Chronicle Hall in the keep yard and each decoration on its own village spot", () => {
    expect(improvementPlacements({ "chronicle-hall": 1 }, flat)[0]).toMatchObject({ x: KEEP_YARD.chronicleHall.x, z: KEEP_YARD.chronicleHall.z });
    for (const id of ["village-banners", "village-lamps", "village-fountain", "village-statue"] as const) {
      expect(improvementPlacements({ [id]: 1 }, flat)[0], id).toMatchObject({ x: VILLAGE_DECOR_SPOTS[id].x, z: VILLAGE_DECOR_SPOTS[id].z });
    }
  });

  it("stands on the ground there", () => {
    const [p] = improvementPlacements({ "village-statue": 1 }, slope);
    const spot = VILLAGE_DECOR_SPOTS["village-statue"];
    expect(p.y).toBeCloseTo(slope(spot.x, spot.z));
  });

  it("ignores ids the catalog does not know and levels outside one to three", () => {
    const out = improvementPlacements(
      { moat: 2, "well-house": 0, "mill-granary": 4, "bridge-arches": -1, "chapel-windows": 1.5, "market-stalls": Number.NaN, "village-lamps": 2 },
      flat,
    );
    expect(out.map((p) => p.id)).toEqual(["village-lamps"]);
  });

  it("is not fooled by an id borrowed from Object.prototype", () => {
    expect(improvementPlacements({ constructor: 2, toString: 1 } as unknown as Record<string, number>, flat)).toEqual([]);
  });
});

describe("the plaque spot", () => {
  it("does not move as the levels go up", () => {
    for (const id of IMPROVEMENT_IDS) {
      const [one] = improvementPlacements({ [id]: 1 }, flat);
      const [three] = improvementPlacements({ [id]: 3 }, flat);
      expect(one.plaque, id).toEqual(three.plaque);
    }
  });

  it("stands clear of its host's footprint and of the host's villager", () => {
    for (const id of WINGS) {
      const host = hostOf(id);
      const [p] = improvementPlacements({ [id]: 3 }, flat);
      expect(distToRect(drawnSite(host), p.plaque), `${id} plaque beside the ${host}`).toBeGreaterThan(0.5);
      const villager = VILLAGERS.find((v) => v.buildingId === host)!;
      const spot = villagerPosition(BUILDING_SLOTS[host], buildingFootprint(host));
      expect(Math.hypot(p.plaque.x - spot.x, p.plaque.z - spot.z), `${id} plaque from ${villager.name}`).toBeGreaterThan(1.5);
    }
  });

  it("is in front (toward +z) of every box of the improvement, or past its east edge, and not under one", () => {
    for (const id of IMPROVEMENT_IDS) {
      const [p] = improvementPlacements({ [id]: 3 }, flat);
      const front = Math.max(...p.boxes.map((b) => b.z + b.sz / 2));
      const east = Math.max(...p.boxes.map((b) => b.x + b.sx / 2));
      expect(p.plaque.z > front || p.plaque.x > east, id).toBe(true);
      for (const b of p.boxes) expect(overlaps(rectAt(p.plaque.x, p.plaque.z, 0.7, 0.7), rectAt(b.x, b.z, b.sx, b.sz)), `${id} plaque under a box`).toBe(false);
    }
  });

  it("is on open ground a hero can walk to: clear of the sites, the road, the castle and the scenery", () => {
    const failures: string[] = [];
    for (const id of IMPROVEMENT_IDS) {
      const [p] = improvementPlacements({ [id]: 3 }, flat);
      const host = BUILDINGS.some((b) => b.id === hostOf(id)) ? hostOf(id) : undefined;
      failures.push(...clearanceFailures(`${id} plaque`, rectAt(p.plaque.x, p.plaque.z, 0.7, 0.7), host));
    }
    expect(failures).toEqual([]);
  });

  it("has a plaque stone that fits inside the clear square it is held to", () => {
    for (const b of PLAQUE_BOXES) {
      expect(Math.abs(b.x) + b.sx / 2).toBeLessThanOrEqual(0.35);
      expect(Math.abs(b.z) + b.sz / 2).toBeLessThanOrEqual(0.35);
    }
  });
});

describe("hallFrameSlots", () => {
  const hall = KEEP_YARD.chronicleHall;

  it("hangs two frames per built level, none before the hall stands", () => {
    expect(hallFrameSlots(0, flat)).toEqual([]);
    expect([1, 2, 3].map((n) => hallFrameSlots(n, flat).length)).toEqual([2, 4, 6]);
  });

  it("holds a level's frames in place as the hall grows, so a drawing keeps its slot", () => {
    const three = hallFrameSlots(3, flat);
    expect(hallFrameSlots(1, flat)).toEqual(three.slice(0, 2));
    expect(hallFrameSlots(2, flat)).toEqual(three.slice(0, 4));
  });

  it("clamps a level that is not 0 to 3 whole, rather than inventing frames", () => {
    expect(hallFrameSlots(9, flat)).toHaveLength(6);
    expect(hallFrameSlots(-1, flat)).toEqual([]);
    expect(hallFrameSlots(Number.NaN, flat)).toEqual([]);
    expect(hallFrameSlots(1.5, flat)).toEqual([]);
  });

  it("moves each frame to the hall's spot in the world and its height above the ground there", () => {
    const [first] = hallFrameSlots(1, slope);
    const catalog = IMPROVEMENTS["chronicle-hall"].levels[0].frames![0];
    expect(first).toEqual({ x: hall.x + catalog.x, y: slope(hall.x, hall.z) + catalog.y, z: hall.z + catalog.z, ry: catalog.ry });
  });
});
