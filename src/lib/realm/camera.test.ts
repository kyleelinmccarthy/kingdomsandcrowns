import { describe, it, expect } from "vitest";
import { followCamera, CAMERA_OFFSET, CAMERA_ZOOM } from "./camera";

describe("followCamera", () => {
  it("eases toward the hero and converges", () => {
    let cam = { x: 0, z: 0 };
    const hero = { x: 10, z: -4 };
    const first = followCamera(cam, hero, 1 / 60, { reducedMotion: false });
    expect(first.x).toBeGreaterThan(0);
    expect(first.x).toBeLessThan(10);
    for (let i = 0; i < 300; i++) cam = followCamera(cam, hero, 1 / 60, { reducedMotion: false });
    expect(cam.x).toBeCloseTo(10, 1);
    expect(cam.z).toBeCloseTo(-4, 1);
  });
  it("snaps under reduced motion", () => {
    expect(followCamera({ x: 0, z: 0 }, { x: 10, z: -4 }, 1 / 60, { reducedMotion: true })).toEqual({ x: 10, z: -4 });
  });
  it("exposes the tabletop constants", () => {
    expect(CAMERA_OFFSET).toEqual({ x: 12, y: 12, z: 12 });
    expect(CAMERA_ZOOM).toBe(40);
  });
});
