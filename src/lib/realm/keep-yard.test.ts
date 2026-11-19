import { describe, expect, it } from "vitest";
import { SPAWN } from "./layout";
import { castlePlan } from "@/lib/realm3d/castle-plan";
import { CASTLE_POSITION } from "./layout";
import { MATERIAL_IDS } from "./materials";
import { KEEP_YARD, VILLAGE_DECOR_SPOTS, YARD_RADIUS } from "./keep-yard";
import { IMPROVEMENT_IDS, IMPROVEMENTS } from "./improvements";
import { improvementPlacements } from "@/lib/realm3d/improvement-spots";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CASTLE_TIER_IDS, canopyRadius, clearanceFailures, levelFailures, overlaps, overlapsPatch, ROAD, grow, rectAt, TREE_SCALE, type R } from "@/test/world-clearance";

type Spot = { what: string; x: number; z: number; r: number };
const yardSpots = (): Spot[] => [
  { what: "plansBoard", ...KEEP_YARD.plansBoard, r: YARD_RADIUS.plansBoard },
  ...KEEP_YARD.stockpile.map((s, i) => ({ what: `heap ${i}`, ...s, r: YARD_RADIUS.heap })),
  { what: "chronicleHall", ...KEEP_YARD.chronicleHall, r: YARD_RADIUS.chronicleHall },
  { what: "lectern", ...KEEP_YARD.lectern, r: YARD_RADIUS.lectern },
];
const villageSpots = (): Spot[] =>
  (["village-banners", "village-lamps", "village-fountain", "village-statue"] as const).map((id) => ({ what: id, ...VILLAGE_DECOR_SPOTS[id], r: YARD_RADIUS[id] }));
const box = (s: Spot): R => rectAt(s.x, s.z, s.r * 2, s.r * 2);

describe("the keep yard", () => {
  it("has a board, a hall, a lectern and one heap per material in catalog order", () => {
    expect(KEEP_YARD.stockpile).toHaveLength(6);
    expect(KEEP_YARD.stockpile).toHaveLength(MATERIAL_IDS.length);
    expect(Object.keys(KEEP_YARD).sort()).toEqual(["chronicleHall", "lectern", "plansBoard", "stockpile"]);
  });

  it("is findable: the plans board is a short walk from where the hero arrives, and off the road", () => {
    expect(Math.hypot(KEEP_YARD.plansBoard.x - SPAWN.x, KEEP_YARD.plansBoard.z - SPAWN.z)).toBeLessThanOrEqual(14);
    for (const s of yardSpots()) expect(overlaps(box(s), grow(ROAD, 1)), s.what).toBe(false);
  });

  it("clears the castle as it is really drawn, at every tier, with a margin of 1", () => {
    for (const tier of CASTLE_TIER_IDS) {
      const b = castlePlan(tier).bounds;
      const castle: R = { x0: CASTLE_POSITION.x + b.x0, x1: CASTLE_POSITION.x + b.x1, z0: CASTLE_POSITION.z + b.z0, z1: CASTLE_POSITION.z + b.z1 };
      for (const s of [...yardSpots(), ...villageSpots()]) expect(overlaps(box(s), grow(castle, 1)), `${s.what} touches the ${tier} castle`).toBe(false);
      for (const solid of castlePlan(tier).solids) {
        const r: R = { x0: CASTLE_POSITION.x + solid.x - solid.hw, x1: CASTLE_POSITION.x + solid.x + solid.hw, z0: CASTLE_POSITION.z + solid.z - solid.hd, z1: CASTLE_POSITION.z + solid.z + solid.hd };
        for (const s of [...yardSpots(), ...villageSpots()]) expect(overlaps(box(s), r), `${s.what} is inside a ${tier} castle solid`).toBe(false);
      }
    }
  });

  it("clears every site, the road, the lap ring, the plaza, the scenery (and every tree crown) and the village's decorations, on level ground", () => {
    expect(yardSpots().flatMap((s) => [...clearanceFailures(s.what, box(s), undefined, 0), ...levelFailures(s.what, box(s))])).toEqual([]);
  });

  it("keeps each piece clear of the others", () => {
    const spots = yardSpots();
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(overlaps(grow(box(spots[i]), 0.4), box(spots[j])), `${spots[i].what} and ${spots[j].what}`).toBe(false);
      }
    }
  });

  it("keeps the Chronicle Hall at its tallest at least 1.5 clear of every tree's crown (the oak hedge at z 27)", () => {
    const hall = KEEP_YARD.chronicleHall;
    for (const b of IMPROVEMENTS["chronicle-hall"].levels.flatMap((l) => l.boxes)) {
      expect(clearanceFailures("hall box", rectAt(hall.x + b.x, hall.z + b.z, b.sx, b.sz), undefined, 1.5)).toEqual([]);
    }
  });

  it("holds the Chronicle Hall's boxes inside its own space, clear of the rest of the yard", () => {
    const hall = KEEP_YARD.chronicleHall;
    const others = yardSpots().filter((s) => s.what !== "chronicleHall");
    for (const level of IMPROVEMENTS["chronicle-hall"].levels) {
      for (const b of level.boxes) {
        const r = rectAt(hall.x + b.x, hall.z + b.z, b.sx, b.sz);
        expect(clearanceFailures("hall box", r, undefined, 0)).toEqual([]);
        for (const o of others) expect(overlaps(r, box(o)), `hall box and ${o.what}`).toBe(false);
      }
    }
  });
});

describe("the keep yard against the village's own pieces (N-1)", () => {
  /** The gap between two rectangles: 0 when they touch or share area. */
  const gap = (a: R, b: R) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));
  const hall = KEEP_YARD.chronicleHall;
  const yard: { what: string; rect: R }[] = [
    ...yardSpots().map((s) => ({ what: s.what, rect: box(s) })),
    ...IMPROVEMENTS["chronicle-hall"].levels.flatMap((l, li) => l.boxes.map((b, bi) => ({ what: `hall L${li + 1} box ${bi}`, rect: rectAt(hall.x + b.x, hall.z + b.z, b.sx, b.sz) }))),
  ];
  // Every plan built to the top, so every plaque stands; the hall's own plaque belongs to the yard.
  const plaques = improvementPlacements(Object.fromEntries(IMPROVEMENT_IDS.map((id) => [id, 3])), () => 0)
    .filter((p) => p.id !== "chronicle-hall")
    .map((p) => ({ what: `${p.id} plaque`, rect: rectAt(p.plaque.x, p.plaque.z, 0.7, 0.7) }));
  const village = [...villageSpots().map((s) => ({ what: s.what, rect: box(s) })), ...plaques];

  it("keeps every keep-yard spot and box at least 1.5 from every village decoration's spot and every improvement's plaque", () => {
    const close: string[] = [];
    for (const y of yard) for (const v of village) if (gap(y.rect, v.rect) < 1.5) close.push(`${y.what} is ${gap(y.rect, v.rect).toFixed(2)} from ${v.what}`);
    expect(close).toEqual([]);
  });
});

describe("the clearance check itself", () => {
  it("sees a turned ground patch as turned, not as the square it would be unturned", () => {
    // A 4 x 1 strip turned a quarter turn lies north-south: 1 wide, 4 deep.
    const strip = { position: { x: 0, z: 0 }, size: { w: 4, d: 1 }, angle: Math.PI / 2 };
    expect(overlapsPatch(rectAt(0, 1.6, 0.4, 0.4), strip)).toBe(true);
    expect(overlapsPatch(rectAt(1.6, 0, 0.4, 0.4), strip)).toBe(false);
    // An eighth turn: a corner of the unturned square is bare ground.
    const square = { position: { x: 0, z: 0 }, size: { w: 2, d: 2 }, angle: Math.PI / 4 };
    expect(overlapsPatch(rectAt(0.9, 0.9, 0.1, 0.1), square)).toBe(false);
    expect(overlapsPatch(rectAt(0, 1.3, 0.1, 0.1), square)).toBe(true);
    // Unturned is the plain rectangle test.
    expect(overlapsPatch(rectAt(0.9, 0.9, 0.1, 0.1), { ...square, angle: 0 })).toBe(true);
  });

  it("measures a tree's crown at the scale the 3D scene draws trees", () => {
    const scene = readFileSync(resolve(__dirname, "../../components/realm3d/spike-scene.tsx"), "utf8");
    expect(Number(/^const TREE_SCALE = ([\d.]+);/m.exec(scene)?.[1])).toBe(TREE_SCALE);
    // An orchard oak (scale 1.3) reaches a little over two units.
    expect(canopyRadius({ variant: "oak", size: { h: 1.4 * 1.3 } })).toBeCloseTo(1.31 * 1.3 * 1.25);
    expect(canopyRadius({ variant: "bush", size: { h: 1.4 } })).toBeNull();
  });
});

describe("the village decoration spots", () => {
  it("has one spot each for banners, lamps, the fountain and the statue", () => {
    expect(Object.keys(VILLAGE_DECOR_SPOTS).sort()).toEqual(["village-banners", "village-fountain", "village-lamps", "village-statue"]);
  });

  it("clears every site, the road, the lap ring, the plaza and the village's decorations, and each other", () => {
    const spots = villageSpots();
    expect(spots.flatMap((s) => [...clearanceFailures(s.what, box(s)), ...levelFailures(s.what, box(s))])).toEqual([]);
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(overlaps(grow(box(spots[i]), 0.5), box(spots[j])), `${spots[i].what} and ${spots[j].what}`).toBe(false);
  });

  it("stands clear of the keep yard too", () => {
    for (const v of villageSpots()) for (const y of yardSpots()) expect(overlaps(box(v), box(y)), `${v.what} and ${y.what}`).toBe(false);
  });
});
