import { describe, expect, it } from "vitest";
import { makeScreenPoint, NEAR_W, onScreen, projectPoint } from "./project";

/**
 * A perspective matrix built by hand, so the test is checking the arithmetic rather than
 * agreeing with three about it. Column-major, as `Matrix4.elements` is.
 *
 * The camera sits at the origin looking down -z (three's convention), 90° vertical field of
 * view, aspect 1, near 1, far 100. At 90° the focal length is 1, so a point at (1, 1, -1) —
 * one unit right, one up and one ahead — lands exactly on the top-right corner of the frame.
 * That is the property every expectation below leans on.
 */
function perspective(): number[] {
  const near = 1;
  const far = 100;
  const f = 1; // 1 / tan(45°)
  // prettier-ignore
  return [
    f, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ];
}

const W = 800;
const H = 600;

describe("projecting a world point onto the screen", () => {
  const m = perspective();

  it("puts a point straight ahead in the middle of the canvas", () => {
    const p = makeScreenPoint();
    expect(projectPoint(p, m, 0, 0, -20, W, H)).toBe(true);
    expect(p.x).toBeCloseTo(W / 2);
    expect(p.y).toBeCloseTo(H / 2);
  });

  it("reports the depth in front of the camera, not the distance to anything else", () => {
    const p = makeScreenPoint();
    projectPoint(p, m, 0, 0, -37.5, W, H);
    expect(p.depth).toBeCloseTo(37.5);
  });

  it("divides by depth: twice as far is half as far off centre", () => {
    const near = makeScreenPoint();
    const far = makeScreenPoint();
    projectPoint(near, m, 4, 0, -10, W, H);
    projectPoint(far, m, 4, 0, -20, W, H);
    expect(near.x - W / 2).toBeCloseTo((far.x - W / 2) * 2);
  });

  it("grows x to the right and y DOWNWARD, which NDC does not", () => {
    const right = makeScreenPoint();
    const up = makeScreenPoint();
    projectPoint(right, m, 5, 0, -20, W, H);
    projectPoint(up, m, 0, 5, -20, W, H);
    expect(right.x).toBeGreaterThan(W / 2);
    expect(up.y).toBeLessThan(H / 2);
  });

  it("lands a point on the frame corner where the field of view says it should", () => {
    const p = makeScreenPoint();
    projectPoint(p, m, 20, 20, -20, W, H);
    expect(p.x).toBeCloseTo(W);
    expect(p.y).toBeCloseTo(0);
  });

  /**
   * THE BUG THIS MODULE EXISTS FOR. Under an orthographic camera there is no such case at all,
   * which is why the flat Realm's `worldToScreen` never had one.
   */
  describe("things behind the camera", () => {
    it("refuses a point behind the eye instead of mirroring it onto the screen", () => {
      const p = makeScreenPoint();
      // Ten units BEHIND the camera and four to the right. A naive projection divides by a
      // negative w and reports it four units to the LEFT, on screen, moving the wrong way.
      expect(projectPoint(p, m, 4, 0, 10, W, H)).toBe(false);
    });

    it("leaves the caller's point untouched when it refuses", () => {
      const p = makeScreenPoint();
      projectPoint(p, m, 0, 0, -20, W, H);
      const wasX = p.x;
      projectPoint(p, m, 4, 0, 10, W, H);
      expect(p.x).toBe(wasX);
    });

    it("refuses a point at the eye itself, where the divide would explode", () => {
      const p = makeScreenPoint();
      expect(projectPoint(p, m, 0, 0, 0, W, H)).toBe(false);
      expect(projectPoint(p, m, 0, 0, -NEAR_W / 2, W, H)).toBe(false);
      expect(projectPoint(p, m, 0, 0, -NEAR_W * 4, W, H)).toBe(true);
    });

    it("would have mirrored it, if the sign of w were ignored", () => {
      // Proof that the guard is load-bearing rather than defensive: run the same arithmetic
      // without it and the point really does come out on the far side of centre.
      const x = 4;
      const z = 10;
      const w = m[3] * x + m[11] * z + m[15];
      const cx = m[0] * x + m[8] * z + m[12];
      expect(w).toBeLessThan(0);
      expect((cx / w) * 0.5 + 0.5).toBeLessThan(0.5); // right of the camera, left of the screen
    });
  });

  it("allocates nothing: the same point object comes back written over", () => {
    const p = makeScreenPoint();
    projectPoint(p, m, 1, 1, -5, W, H);
    const first = { x: p.x, y: p.y };
    projectPoint(p, m, 2, 2, -5, W, H);
    expect(p.x).not.toBe(first.x);
  });
});

describe("onScreen", () => {
  const p = (x: number, y: number) => ({ x, y, depth: 10 });

  it("takes anything inside the canvas", () => {
    expect(onScreen(p(400, 300), W, H, 0)).toBe(true);
    expect(onScreen(p(0, 0), W, H, 0)).toBe(true);
  });

  it("takes a plate hanging just off the edge, so half a plate is still drawn", () => {
    expect(onScreen(p(-40, 300), W, H, 80)).toBe(true);
    expect(onScreen(p(W + 40, 300), W, H, 80)).toBe(true);
  });

  it("drops one that is fully gone", () => {
    expect(onScreen(p(-200, 300), W, H, 80)).toBe(false);
    expect(onScreen(p(400, H + 200), W, H, 80)).toBe(false);
  });
});
