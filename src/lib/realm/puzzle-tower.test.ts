import { describe, expect, it } from "vitest";
import { CONTENT_BANDS, type ContentBand } from "@/lib/utils/content-bands";
import { findSkill } from "@/lib/utils/skills";
import { clearanceFailures, gap, levelFailures, rectAt, villagePieces, yardPieces } from "@/test/world-clearance";
import { bandOfTowerRef, PUZZLE_TOWER, TOWER_FLOORS, towerBands, towerColliders, towerDoorFor, towerFloors, towerRef, towerSkillId } from "./puzzle-tower";

describe("the Puzzle Tower's plot", () => {
  const plot = rectAt(PUZZLE_TOWER.x, PUZZLE_TOWER.z, PUZZLE_TOWER.plot, PUZZLE_TOWER.plot);

  it("stands at the village's one free plot, 8 by 8", () => {
    expect(PUZZLE_TOWER).toEqual({ x: 25.5, z: 23.5, plot: 8, body: 6, baseH: 3.2, storeyH: 2.4, door: { x: 22.2, z: 23.5 } });
  });

  it("clears the sites, the road, the lap ring, the plaza, the scenery and every crown, on level ground", () => {
    expect(clearanceFailures("the tower", plot, undefined, 1.5)).toEqual([]);
    expect(levelFailures("the tower", plot)).toEqual([]);
  });

  it("keeps 1.5 from the keep yard and everything else the village stands", () => {
    const close = [...yardPieces(), ...villagePieces()].filter((p) => gap(plot, p.rect) < 1.5).map((p) => `${p.what} is ${gap(plot, p.rect).toFixed(2)} away`);
    expect(close).toEqual([]);
  });

  it("puts the door on the plot's west face, where the body ends", () => {
    expect(PUZZLE_TOWER.door.z).toBe(PUZZLE_TOWER.z);
    expect(PUZZLE_TOWER.door.x).toBeLessThan(PUZZLE_TOWER.x - PUZZLE_TOWER.body / 2);
    expect(PUZZLE_TOWER.door.x).toBeGreaterThan(PUZZLE_TOWER.x - PUZZLE_TOWER.plot / 2);
  });
});

describe("the tower's refs", () => {
  it("round-trip for every band", () => {
    for (const b of CONTENT_BANDS) {
      expect(towerRef(b)).toBe(`tower:${b}`);
      expect(bandOfTowerRef(towerRef(b))).toBe(b);
    }
  });

  it("refuse anything that is not a tower floor", () => {
    for (const junk of ["tower:g7", "chest:x", "tower:", "tower:__proto__", "TOWER:k1", null]) expect(bandOfTowerRef(junk), String(junk)).toBeNull();
  });

  it("has one floor per band, bottom first", () => {
    expect(TOWER_FLOORS).toEqual(CONTENT_BANDS);
  });

  it("names a logic skill for every floor", () => {
    for (const b of TOWER_FLOORS) {
      expect(towerSkillId(b)).toBe(`logic-${b}`);
      expect(findSkill(towerSkillId(b))?.area, b).toBe("logic");
    }
  });
});

describe("the tower's collider", () => {
  it("is one box, as tall as five storeys, on the ground at its middle", () => {
    expect(towerColliders(() => 0)).toEqual([{ x: 25.5, z: 23.5, hw: 3, hd: 3, round: false, base: -1, top: 3.2 + 5 * 2.4 }]);
    const [c] = towerColliders(() => 2);
    expect(c.base).toBe(1);
    expect(c.top).toBeCloseTo(2 + 3.2 + 5 * 2.4);
  });
});

describe("towerBands", () => {
  it("reads the hero's own band from logic and the science band from science", () => {
    expect(towerBands({ logic: "4", science: "2" })).toEqual({ ownBand: "g45", scienceBand: "g23" });
    expect(towerBands({ logic: "K", science: "9" })).toEqual({ ownBand: "k1", scienceBand: "g912" });
  });
});

describe("towerFloors", () => {
  const bands = (own: ContentBand, science: ContentBand) => ({ ownBand: own, scienceBand: science });

  it("opens every floor to the hero's own when they have starred their science band, and shows nothing above", () => {
    expect(towerFloors(new Set<ContentBand>(["g45"]), bands("g45", "g45"))).toEqual([
      { band: "k1", open: true },
      { band: "g23", open: true },
      { band: "g45", open: true },
    ]);
  });

  it("shows only the hero's own floor, waiting, before any stars", () => {
    expect(towerFloors(new Set(), bands("g45", "g45"))).toEqual([{ band: "g45", open: false }]);
  });

  it("keeps the floors an earlier band's stars opened", () => {
    expect(towerFloors(new Set<ContentBand>(["k1"]), bands("g45", "g45"))).toEqual([
      { band: "k1", open: true },
      { band: "g45", open: false },
    ]);
    expect(towerFloors(new Set<ContentBand>(["g23"]), bands("g45", "g45"))).toEqual([
      { band: "k1", open: true },
      { band: "g23", open: true },
      { band: "g45", open: false },
    ]);
  });

  it("follows a science offset: stars at the science band open the hero's floors, and never one above", () => {
    const all = [
      { band: "k1", open: true },
      { band: "g23", open: true },
      { band: "g45", open: true },
    ];
    expect(towerFloors(new Set<ContentBand>(["g23"]), bands("g45", "g23"))).toEqual(all);
    expect(towerFloors(new Set<ContentBand>(["g68"]), bands("g45", "g68"))).toEqual(all);
  });

  it("ignores stars on a band above the hero's own when the science band is somewhere else", () => {
    expect(towerFloors(new Set<ContentBand>(["g912"]), bands("g23", "g45"))).toEqual([{ band: "g23", open: false }]);
  });

  it("shows the hero's own floor alone for a kindergartener with no stars", () => {
    expect(towerFloors(new Set(), bands("k1", "k1"))).toEqual([{ band: "k1", open: false }]);
  });

  it("lists every floor in the one order, bottom first", () => {
    const f = towerFloors(new Set<ContentBand>(["g912"]), bands("g912", "g912"));
    expect(f.map((x) => x.band)).toEqual(CONTENT_BANDS);
    expect(f.every((x) => x.open)).toBe(true);
  });
});

describe("towerDoorFor: the client's gating (R-G7, PC-G6)", () => {
  it("offers the door while the locks are on and the floors are known", () => {
    expect(towerDoorFor({ locksOn: true, towerKnown: true })).toBe(PUZZLE_TOWER.door);
  });

  it("offers nothing with the locks off, or no canvas at all: the Tower stays drawn but has no E spot", () => {
    expect(towerDoorFor({ locksOn: false, towerKnown: true })).toBeNull();
    expect(towerDoorFor(undefined)).toBeNull();
  });

  it("offers nothing when the floors are unknown (the kingdom read failed): no board with no floor on it (final f2)", () => {
    expect(towerDoorFor({ locksOn: true, towerKnown: false })).toBeNull();
  });
});
