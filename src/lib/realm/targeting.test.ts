import { describe, it, expect } from "vitest";
import { pickTarget } from "./targeting";

const hero = { x: 0, z: 0 };
const near = { id: "near", position: { x: 1, z: 0 } };
const far = { id: "far", position: { x: 4, z: 0 } };
const base = { hero, troubles: [near, far], range: 6, pointerRadius: 1.5 };

describe("pickTarget", () => {
  it("takes the trouble under the pointer even when another is nearer the hero", () => {
    const r = pickTarget({ ...base, pointer: { x: 4.2, z: 0 } });
    expect(r).toMatchObject({ id: "far" });
  });

  it("falls back to the nearest in range when the pointer is over open grass", () => {
    const r = pickTarget({ ...base, pointer: { x: 40, z: 40 } });
    expect(r).toMatchObject({ id: "near" });
  });

  it("uses the nearest when there is no pointer at all, which is the number-key case", () => {
    const r = pickTarget({ ...base, pointer: null });
    expect(r).toMatchObject({ id: "near" });
  });

  it("refuses when nothing is in range, rather than firing at grass", () => {
    const r = pickTarget({ ...base, pointer: null, troubles: [{ id: "miles", position: { x: 99, z: 99 } }] });
    expect(r).toEqual({ refused: true });
  });

  it("refuses when there are no troubles at all", () => {
    expect(pickTarget({ ...base, pointer: { x: 1, z: 0 }, troubles: [] })).toEqual({ refused: true });
  });

  it("will not take a pointed-at trouble that is beyond the hero's range", () => {
    // Pointing at something far away is not a way to out-range the spell.
    const r = pickTarget({ ...base, pointer: { x: 99, z: 99 }, troubles: [{ id: "miles", position: { x: 99, z: 99 } }] });
    expect(r).toEqual({ refused: true });
  });
});
