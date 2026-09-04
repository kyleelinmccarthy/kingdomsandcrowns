import { describe, it, expect } from "vitest";
import { screenToWorldAxis } from "./input-mapping";

describe("screenToWorldAxis", () => {
  it("maps screen-up to away from the camera and screen-right to the camera's right", () => {
    const up = screenToWorldAxis({ x: 0, y: 1 });
    expect(up.x).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(up.z).toBeCloseTo(-Math.SQRT1_2, 5);
    const right = screenToWorldAxis({ x: 1, y: 0 });
    expect(right.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(right.z).toBeCloseTo(-Math.SQRT1_2, 5);
  });
  it("keeps zero at zero", () => {
    expect(screenToWorldAxis({ x: 0, y: 0 })).toEqual({ x: 0, z: 0 });
  });
  it("clamps inputs longer than 1 to unit length", () => {
    const clamped = screenToWorldAxis({ x: 1, y: 1 });
    const magnitude = Math.hypot(clamped.x, clamped.z);
    expect(magnitude).toBeCloseTo(1, 5);
  });
  it("preserves magnitude for inputs shorter than 1", () => {
    const result = screenToWorldAxis({ x: 0.5, y: 0 });
    const magnitude = Math.hypot(result.x, result.z);
    expect(magnitude).toBeCloseTo(0.5, 5);
  });
});
