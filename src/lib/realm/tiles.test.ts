import { describe, it, expect } from "vitest";
import { grassTile, cobbleTile, surfaceTile, meadowShade, waterShade, WATER_DEPTH_REACH, GRASS_COLORS, COBBLE_COLORS, SURFACE_COLORS, SOFT_SURFACES } from "./tiles";

const SURFACES = ["meadow", "grove", "litter", "scree", "field", "furrow", "shore", "shallow", "water", "trail"];

describe("tiles", () => {
  it("paints deterministic grass of the right size from the grass palette", () => {
    const a = grassTile(7);
    const b = grassTile(7);
    expect(a).toEqual(b);
    // A tile spans four world units now, at 64 pixels, so a blade stays the same size on screen
    // while the pattern repeats half as often across a field.
    expect(a).toHaveLength(64);
    expect(a.every((row) => row.length === 64)).toBe(true);
    expect(a.flat().every((c) => GRASS_COLORS.includes(c))).toBe(true);
    expect(grassTile(8)).not.toEqual(a);
    expect(grassTile(7, 16)).toHaveLength(16);
  });

  it("paints grass in clumps rather than per-pixel noise", () => {
    const tile = grassTile(7);
    // The test that says "this is not static": a pixel's neighbour is usually the same green,
    // because the shade comes from a smooth field and not from a coin flip. Pure per-pixel noise
    // over a five-colour ramp would agree about a fifth of the time.
    let same = 0;
    let pairs = 0;
    for (let y = 0; y < tile.length; y++) {
      for (let x = 1; x < tile[y].length; x++) {
        pairs += 1;
        if (tile[y][x] === tile[y][x - 1]) same += 1;
      }
    }
    expect(same / pairs).toBeGreaterThan(0.6);
  });

  it("paints cobbles with mortar lines every eight pixels", () => {
    const t = cobbleTile(11);
    expect(t.flat().every((c) => COBBLE_COLORS.includes(c))).toBe(true);
    expect(t[0].every((c) => c === COBBLE_COLORS[0])).toBe(true); // top row is mortar
    expect(t.every((row) => row[8] === COBBLE_COLORS[0])).toBe(true); // a mortar column
    expect(t[4][4]).not.toBe(COBBLE_COLORS[0]); // inside a stone
    expect(cobbleTile(11)).toEqual(t);
  });

  it("gives every surface its own grain, in values the terrain colour is the tint of", () => {
    for (const kind of SURFACES) {
      const tile = surfaceTile(kind, 13);
      expect(surfaceTile(kind, 13)).toEqual(tile);
      expect(tile.length).toBeGreaterThan(0);
      expect(tile.every((row) => row.length === tile.length)).toBe(true);
      // More than one value, or it is a flat fill with extra steps.
      expect(new Set(tile.flat()).size).toBeGreaterThan(2);
      // Near white: a map multiplies, so a dark tile would just darken every terrain colour.
      for (const c of tile.flat()) expect(SURFACE_COLORS).toContain(c.slice(0, 7));
    }
    expect(surfaceTile("grove", 13)).not.toEqual(surfaceTile("scree", 13));
  });

  it("feathers the surfaces whose edge must dissolve, and leaves the rest hard", () => {
    for (const kind of SURFACES) {
      const tile = surfaceTile(kind, 13);
      const soft = SOFT_SURFACES.includes(kind);
      expect(tile.flat().every((c) => c.length === (soft ? 9 : 7))).toBe(true);
      if (!soft) continue;
      const mid = tile[Math.floor(tile.length / 2)][Math.floor(tile.length / 2)];
      expect(mid.slice(7)).toBe("ff"); // opaque in the middle...
      expect(tile[0][0].slice(7)).toBe("00"); // ...and gone at the corner
    }
  });

  it("shelves the water from the bank to the middle, and varies it at the scale of a lake", () => {
    expect(waterShade(3, -4, 2)).toEqual(waterShade(3, -4, 2));
    // THE POINT OF THE WHOLE FIELD: water at the bank is plainly paler than water out in the
    // middle, and it is the gradient between them the eye reads as depth. Anything less than
    // this and the lake is a flat blue hole again.
    const bank = waterShade(40, -46, 0);
    const middle = waterShade(40, -46, WATER_DEPTH_REACH);
    expect(bank.r - middle.r).toBeGreaterThan(0.25);
    expect(bank.g).toBeGreaterThan(middle.g);
    // ...and it goes BLUER as it deepens, not merely darker.
    expect(middle.b / middle.r).toBeGreaterThan(bank.b / bank.r);
    // Past the reach it has bottomed out: no lake is deeper than deep.
    expect(waterShade(40, -46, WATER_DEPTH_REACH * 4)).toEqual(middle);
    // Two points a screen apart differ; two neighbouring vertices do not.
    const here = waterShade(40, -46, 8);
    expect(Math.abs(waterShade(41.6, -46, 8).g - here.g)).toBeLessThan(0.03);
    expect(Math.abs(waterShade(66, -60, 8).g - here.g)).toBeGreaterThan(0.02);
    // A multiplier around one, and bounded, so no stretch of lake goes black or blows out.
    for (let x = -240; x <= 240; x += 7) {
      for (let z = -240; z <= 240; z += 11) {
        for (const bankAt of [0, 1, 3, 6, 40]) {
          const s = waterShade(x, z, bankAt);
          for (const c of [s.r, s.g, s.b]) {
            expect(c).toBeGreaterThanOrEqual(0.6);
            expect(c).toBeLessThanOrEqual(1.45);
          }
        }
      }
    }
    // lowStimulus halves the swing; it never flattens it.
    const calm = waterShade(40, -46, 0, 0.5);
    expect(Math.abs(calm.r - 1)).toBeLessThan(Math.abs(bank.r - 1));
    expect(calm.r).not.toBe(1);
  });

  it("washes the ground with a field that varies at the scale of a screen", () => {
    expect(meadowShade(0, 0)).toEqual(meadowShade(0, 0));
    // Two points a screen apart are plainly different; two neighbouring vertices are not.
    const here = meadowShade(0, 0);
    const near = meadowShade(1, 1);
    const far = meadowShade(46, -37);
    expect(Math.abs(near.g - here.g)).toBeLessThan(0.03);
    expect(Math.abs(far.g - here.g)).toBeGreaterThan(0.03);
    // It is a multiplier around one, and it is bounded, so no patch of world can go black or blow out.
    for (let x = -240; x <= 240; x += 7) {
      for (let z = -240; z <= 240; z += 11) {
        const s = meadowShade(x, z);
        for (const c of [s.r, s.g, s.b]) {
          expect(c).toBeGreaterThanOrEqual(0.6);
          expect(c).toBeLessThanOrEqual(1.45);
        }
      }
    }
    // lowStimulus halves the swing; it never flattens it.
    const calm = meadowShade(46, -37, 0.5);
    expect(Math.abs(calm.g - 1)).toBeLessThan(Math.abs(far.g - 1));
    expect(calm.g).not.toBe(1);
  });
});
