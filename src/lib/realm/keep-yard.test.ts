import { describe, expect, it } from "vitest";
import { CASTLE_POSITION, SPAWN } from "./layout";
import { MATERIAL_IDS } from "./materials";
import { KEEP_YARD, VILLAGE_DECOR_SPOTS, YARD_RADIUS } from "./keep-yard";
import { IMPROVEMENTS } from "./improvements";
import { clearanceFailures, largestCastle, overlaps, ROAD, grow, rectAt, type R } from "@/test/world-clearance";

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

  it("is open ground beside the castle: near it, behind the gate, off the road", () => {
    for (const s of yardSpots()) {
      expect(Math.hypot(s.x - CASTLE_POSITION.x, s.z - CASTLE_POSITION.z), s.what).toBeLessThan(16);
      expect(s.z, `${s.what} is behind the castle's gate side`).toBeLessThan(CASTLE_POSITION.z);
      expect(overlaps(box(s), grow(ROAD, 1)), s.what).toBe(false);
    }
    expect(SPAWN.z).toBeGreaterThan(KEEP_YARD.plansBoard.z);
  });

  it("clears the largest castle, every site, the lap ring, the plaza and the village's decorations", () => {
    const failures = yardSpots().flatMap((s) => clearanceFailures(s.what, box(s)));
    expect(failures).toEqual([]);
    for (const s of yardSpots()) expect(overlaps(box(s), grow(largestCastle(), 1)), s.what).toBe(false);
  });

  it("keeps each piece clear of the others", () => {
    const spots = yardSpots();
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(overlaps(grow(box(spots[i]), 0.4), box(spots[j])), `${spots[i].what} and ${spots[j].what}`).toBe(false);
      }
    }
  });

  it("holds the Chronicle Hall's boxes inside its own space, clear of the rest of the yard", () => {
    const hall = KEEP_YARD.chronicleHall;
    const others = yardSpots().filter((s) => s.what !== "chronicleHall");
    for (const level of IMPROVEMENTS["chronicle-hall"].levels) {
      for (const b of level.boxes) {
        const r = rectAt(hall.x + b.x, hall.z + b.z, b.sx, b.sz);
        expect(clearanceFailures("hall box", r)).toEqual([]);
        for (const o of others) expect(overlaps(r, box(o)), `hall box and ${o.what}`).toBe(false);
      }
    }
  });
});

describe("the village decoration spots", () => {
  it("has one spot each for banners, lamps, the fountain and the statue", () => {
    expect(Object.keys(VILLAGE_DECOR_SPOTS).sort()).toEqual(["village-banners", "village-fountain", "village-lamps", "village-statue"]);
  });

  it("clears every site, the road, the lap ring, the plaza and the village's decorations, and each other", () => {
    const spots = villageSpots();
    expect(spots.flatMap((s) => clearanceFailures(s.what, box(s)))).toEqual([]);
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(overlaps(grow(box(spots[i]), 0.5), box(spots[j])), `${spots[i].what} and ${spots[j].what}`).toBe(false);
  });

  it("stands clear of the keep yard too", () => {
    for (const v of villageSpots()) for (const y of yardSpots()) expect(overlaps(box(v), box(y)), `${v.what} and ${y.what}`).toBe(false);
  });
});
