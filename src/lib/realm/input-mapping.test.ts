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
});
