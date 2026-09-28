import { describe, expect, it } from "vitest";
import { HERO_R, NEAR_HERO, SOFT, AIM_Y, seeThroughKeep } from "./see-through";

// A lens 20 back and 12 up from a child standing at the origin; the line aims at their chest.
const C = { x: 0, y: 12 + AIM_Y, z: 20 };
const H = { x: 0, y: 0, z: 0 };
const keep = (x: number, y: number, z: number) => seeThroughKeep(x, y, z, C.x, C.y, C.z, H.x, H.y, H.z);
const len = Math.hypot(20, 12);
/** A point `t` along the line from the lens toward the chest, pushed `r` sideways (along x). */
const at = (t: number, r = 0) => keep(r, C.y - (12 * t) / len, C.z - (20 * t) / len);

describe("what stands between the camera and the child", () => {
  it("is thinned right away on the line to them", () => {
    expect(at(len / 2)).toBe(0);
    expect(at(len / 4)).toBe(0);
  });

  it("is drawn whole beside the line, past the cone", () => {
    expect(at(len / 2, HERO_R * 0.5 * 1.05)).toBe(1);
  });

  it("thickens back to solid across the cone's soft edge", () => {
    const r = HERO_R * 0.5 * ((SOFT + 1) / 2);
    const k = at(len / 2, r);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(1);
  });

  it("makes the same hole on screen near the lens as near the child: the cone narrows to the lens", () => {
    for (const t of [len / 4, (3 * len) / 4]) {
      const R = (HERO_R * t) / len;
      expect(at(t, R * 0.99)).toBeLessThan(1);
      expect(at(t, R * 1.01)).toBe(1);
    }
  });

  it("never thins the child's own last stretch, anything behind them, or anything behind the lens", () => {
    expect(at(len - NEAR_HERO * 0.5)).toBe(1);
    expect(keep(0, 0, -5)).toBe(1);
    expect(at(-2)).toBe(1);
  });
});
