import { describe, it, expect } from "vitest";
import { grassTile, cobbleTile, GRASS_COLORS, COBBLE_COLORS } from "./tiles";

describe("tiles", () => {
  it("paints deterministic grass of the right size from the grass palette", () => {
    const a = grassTile(7);
    const b = grassTile(7);
    expect(a).toEqual(b);
    expect(a).toHaveLength(32);
    expect(a.every((row) => row.length === 32)).toBe(true);
    expect(a.flat().every((c) => GRASS_COLORS.includes(c))).toBe(true);
    expect(grassTile(8)).not.toEqual(a);
    expect(grassTile(7, 16)).toHaveLength(16);
  });
  it("paints cobbles with mortar lines every eight pixels", () => {
    const t = cobbleTile(11);
    expect(t.flat().every((c) => COBBLE_COLORS.includes(c))).toBe(true);
    expect(t[0].every((c) => c === COBBLE_COLORS[0])).toBe(true); // top row is mortar
    expect(t.every((row) => row[8] === COBBLE_COLORS[0])).toBe(true); // a mortar column
    expect(t[4][4]).not.toBe(COBBLE_COLORS[0]); // inside a stone
    expect(cobbleTile(11)).toEqual(t);
  });
});
