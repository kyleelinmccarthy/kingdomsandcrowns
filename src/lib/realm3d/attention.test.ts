import { describe, expect, it } from "vitest";
import { NOTICE_REACH, noticeFacing } from "./attention";

/** `atan2(dx, dz)`: 0 faces +z, π/2 faces +x — the scene's facing basis. */
describe("noticeFacing — a villager turns to the child who comes near, and back when they go", () => {
  it("keeps their own facing while the child is out of reach", () => {
    expect(noticeFacing(0, 0, 0.7, 0, NOTICE_REACH + 0.01)).toBe(0.7);
    expect(noticeFacing(0, 0, -2, 40, 40)).toBe(-2);
  });

  it("faces the child anywhere inside reach, whichever side they are on", () => {
    expect(noticeFacing(0, 0, 0.7, 0, 3)).toBeCloseTo(0); // child to the south (+z)
    expect(noticeFacing(0, 0, 0.7, 3, 0)).toBeCloseTo(Math.PI / 2); // east
    expect(noticeFacing(0, 0, 0.7, -3, 0)).toBeCloseTo(-Math.PI / 2); // west
    expect(Math.abs(noticeFacing(0, 0, 0.7, 0, -3))).toBeCloseTo(Math.PI); // north, behind them
    expect(noticeFacing(10, -4, 0, 10 + 2, -4 + 2)).toBeCloseTo(Math.PI / 4); // from where they stand
  });

  it("counts reach the same all the way round, and exactly at the edge", () => {
    const r = NOTICE_REACH / Math.SQRT2;
    expect(noticeFacing(0, 0, 1, r - 0.01, r - 0.01)).toBeCloseTo(Math.PI / 4);
    expect(noticeFacing(0, 0, 1, NOTICE_REACH - 0.001, 0)).toBeCloseTo(Math.PI / 2);
  });

  it("holds their facing when the child stands exactly on their spot, rather than spinning", () => {
    expect(noticeFacing(5, 5, 1.2, 5, 5)).toBe(1.2);
  });
});
