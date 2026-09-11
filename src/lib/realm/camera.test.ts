import { describe, it, expect } from "vitest";
import { followCamera, worldToScreen, edgeArrow, CAMERA_OFFSET, CAMERA_ZOOM } from "./camera";

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

// The fixed tabletop camera sits at (12, 12, 12) looking at (t.x, 0, t.z) with up (0, 1, 0),
// so right = (1, 0, -1)/√2 and up = (-1, 2, -1)/√6. One world unit east therefore moves the
// point CAMERA_ZOOM/√2 px right and CAMERA_ZOOM/√6 px *down* (screen y grows downward).
const VIEW = { width: 800, height: 600 };

describe("worldToScreen", () => {
  it("puts the camera target at the viewport centre", () => {
    expect(worldToScreen({ x: 0, z: 0 }, { x: 0, z: 0 }, VIEW)).toEqual({ x: 400, y: 300 });
    expect(worldToScreen({ x: 5, z: -3 }, { x: 5, z: -3 }, VIEW)).toEqual({ x: 400, y: 300 });
  });
  it("moves a point one unit east right by zoom/√2 and down by zoom/√6", () => {
    const p = worldToScreen({ x: 0, z: 0 }, { x: 1, z: 0 }, VIEW);
    expect(p.x - 400).toBeCloseTo(CAMERA_ZOOM / Math.SQRT2, 10);
    expect(p.y - 300).toBeCloseTo(CAMERA_ZOOM / Math.sqrt(6), 10);
  });
  it("moves a point one unit north (−z) right by zoom/√2 and up by zoom/√6", () => {
    const p = worldToScreen({ x: 0, z: 0 }, { x: 0, z: -1 }, VIEW);
    expect(p.x - 400).toBeCloseTo(CAMERA_ZOOM / Math.SQRT2, 10);
    expect(p.y - 300).toBeCloseTo(-CAMERA_ZOOM / Math.sqrt(6), 10);
  });
  it("is linear: two units is exactly twice one unit", () => {
    const one = worldToScreen({ x: 0, z: 0 }, { x: 1, z: 0 }, VIEW);
    const two = worldToScreen({ x: 0, z: 0 }, { x: 2, z: 0 }, VIEW);
    expect(two.x - 400).toBeCloseTo(2 * (one.x - 400), 10);
    expect(two.y - 300).toBeCloseTo(2 * (one.y - 300), 10);
  });
  it("measures the offset from the camera target, not from the world origin", () => {
    const a = worldToScreen({ x: 0, z: 0 }, { x: 1, z: 0 }, VIEW);
    const b = worldToScreen({ x: 7, z: -2 }, { x: 8, z: -2 }, VIEW);
    expect(b).toEqual(a);
  });
  it("defaults zoom to CAMERA_ZOOM and scales with an explicit zoom", () => {
    const dflt = worldToScreen({ x: 0, z: 0 }, { x: 1, z: 0 }, VIEW);
    expect(dflt).toEqual(worldToScreen({ x: 0, z: 0 }, { x: 1, z: 0 }, VIEW, CAMERA_ZOOM));
    const half = worldToScreen({ x: 0, z: 0 }, { x: 1, z: 0 }, VIEW, CAMERA_ZOOM / 2);
    expect(half.x - 400).toBeCloseTo((dflt.x - 400) / 2, 10);
    expect(half.y - 300).toBeCloseTo((dflt.y - 300) / 2, 10);
  });
  it("centres on the viewport it is given", () => {
    expect(worldToScreen({ x: 0, z: 0 }, { x: 0, z: 0 }, { width: 360, height: 640 })).toEqual({ x: 180, y: 320 });
  });
});

// VIEW is 800×600, so with the default 56 px margin the inset rectangle is x ∈ [56, 744], y ∈ [56, 544]
// and the centre is (400, 300). The four probe points below are chosen so each projects due right,
// due left, straight down or straight up of that centre.
describe("edgeArrow", () => {
  const AT = { x: 0, z: 0 };

  it("returns null while the target is comfortably on screen", () => {
    expect(edgeArrow(AT, { x: 0, z: 0 }, VIEW)).toBeNull();
    expect(edgeArrow(AT, { x: 1, z: 0 }, VIEW)).toBeNull();
    expect(edgeArrow(AT, { x: -2, z: 3 }, VIEW)).toBeNull();
  });

  it("clamps a target off the right edge and points at it", () => {
    // (10, -10) projects to x = 400 + 40·20/√2 ≈ 965.7, y = 300.
    const a = edgeArrow(AT, { x: 10, z: -10 }, VIEW);
    expect(a).not.toBeNull();
    expect(a?.x).toBe(744);
    expect(a?.y).toBe(300);
    expect(a?.angle).toBeCloseTo(0, 10);
  });

  it("clamps a target off the left edge and points at it", () => {
    // (-10, 10) projects to x ≈ -165.7, y = 300.
    const a = edgeArrow(AT, { x: -10, z: 10 }, VIEW);
    expect(a?.x).toBe(56);
    expect(a?.y).toBe(300);
    expect(Math.abs(a?.angle ?? 0)).toBeCloseTo(Math.PI, 10);
  });

  it("clamps a target off the bottom edge and points at it", () => {
    // (10, 10) projects to x = 400, y = 300 + 40·20/√6 ≈ 626.6.
    const a = edgeArrow(AT, { x: 10, z: 10 }, VIEW);
    expect(a?.x).toBe(400);
    expect(a?.y).toBe(544);
    expect(a?.angle).toBeCloseTo(Math.PI / 2, 10);
  });

  it("clamps a target off the top edge and points at it", () => {
    // (-10, -10) projects to x = 400, y ≈ -26.6.
    const a = edgeArrow(AT, { x: -10, z: -10 }, VIEW);
    expect(a?.x).toBe(400);
    expect(a?.y).toBe(56);
    expect(a?.angle).toBeCloseTo(-Math.PI / 2, 10);
  });

  it("takes the heading from the true target, not from the corner it was clamped into", () => {
    // (20, 0) projects to (≈965.7, ≈626.6): off both the right and the bottom edge.
    // The clamped corner (744, 544) would read atan2(244, 344) ≈ 0.617 rad; the true
    // bearing is atan2(40·20/√6, 40·20/√2) = atan2(1/√3, 1) = π/6. The arrow points at the site.
    const a = edgeArrow(AT, { x: 20, z: 0 }, VIEW);
    expect(a?.x).toBe(744);
    expect(a?.y).toBe(544);
    expect(a?.angle).toBeCloseTo(Math.PI / 6, 10);
  });

  it("returns null for a zero-size viewport — the first frame and a hidden tab", () => {
    expect(edgeArrow(AT, { x: 20, z: 0 }, { width: 0, height: 0 })).toBeNull();
    expect(edgeArrow(AT, { x: 20, z: 0 }, { width: 0, height: 600 })).toBeNull();
    expect(edgeArrow(AT, { x: 20, z: 0 }, { width: 800, height: 0 })).toBeNull();
  });

  it("defaults the margin to 56 px", () => {
    // On a 200×200 viewport (1, -1) projects to x = 100 + 40·2/√2 ≈ 156.6, y = 100:
    // outside the default inset edge of 144, inside a 10 px one.
    const small = { width: 200, height: 200 };
    const a = edgeArrow(AT, { x: 1, z: -1 }, small);
    expect(a?.x).toBe(144);
    expect(a?.y).toBe(100);
    expect(a?.angle).toBeCloseTo(0, 10);
    expect(edgeArrow(AT, { x: 1, z: -1 }, small, { margin: 10 })).toBeNull();
  });

  it("defaults the zoom to CAMERA_ZOOM", () => {
    const small = { width: 200, height: 200 };
    expect(edgeArrow(AT, { x: 1, z: -1 }, small)).toEqual(edgeArrow(AT, { x: 1, z: -1 }, small, { zoom: CAMERA_ZOOM }));
    // At a quarter of the zoom the same point projects to ≈114 px and is comfortably on screen.
    expect(edgeArrow(AT, { x: 1, z: -1 }, small, { zoom: CAMERA_ZOOM / 4 })).toBeNull();
  });

  it("agrees with worldToScreen about where the target is", () => {
    const target = { x: 10, z: -10 };
    const p = worldToScreen(AT, target, VIEW);
    const a = edgeArrow(AT, target, VIEW);
    expect(a?.angle).toBeCloseTo(Math.atan2(p.y - 300, p.x - 400), 10);
  });
});
