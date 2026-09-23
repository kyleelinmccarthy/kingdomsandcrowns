import { describe, expect, it } from "vitest";
import {
  angleDelta,
  ASSIST_GRACE,
  boomOffset,
  cameraFacing,
  DEFAULT_DIST,
  DEFAULT_PITCH,
  DIST_MAX,
  DIST_MIN,
  makeMoveIntent,
  moveIntent,
  orbitDrag,
  orbitZoom,
  PITCH_MAX,
  PITCH_MIN,
  swingAllowed,
  terrainClearance,
  turnToward,
  wrapAngle,
  type Orbit,
} from "./controls";

const orbit = (): Orbit => ({ yaw: 0, pitch: DEFAULT_PITCH, dist: DEFAULT_DIST });
const keys = (s: string) => ({ f: s.includes("W"), b: s.includes("S"), l: s.includes("A"), r: s.includes("D") });

describe("angles", () => {
  it("wraps into (-π, π]", () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5 + Math.PI * 8)).toBeCloseTo(0.5);
  });

  it("turns the short way across the ±π seam, which is the strafe flip", () => {
    // Facing due north is π. A target of -π + 0.1 is 0.1 rad away, not 2π - 0.1.
    expect(angleDelta(Math.PI - 0.05, -Math.PI + 0.05)).toBeCloseTo(0.1);
    let face = Math.PI - 0.05;
    for (let i = 0; i < 30; i++) face = turnToward(face, -Math.PI + 0.05, 12, 1 / 60);
    // It never went anywhere near 0 (facing the camera) on the way.
    expect(Math.abs(Math.abs(face) - Math.PI)).toBeLessThan(0.1);
  });
});

describe("the mouse camera", () => {
  it("drag right looks right: the camera's forward turns clockwise from above", () => {
    const o = orbit();
    orbitDrag(o, 100, 0);
    // Forward at yaw 0 is north (0,-1). Looking right from north is towards east (+x).
    const fx = -Math.sin(o.yaw);
    expect(fx).toBeGreaterThan(0.3);
    expect(o.pitch).toBeCloseTo(DEFAULT_PITCH);
  });

  it("clamps the pitch, low enough to look out from a summit and never under the ground", () => {
    const o = orbit();
    orbitDrag(o, 0, -10000);
    expect(o.pitch).toBe(PITCH_MIN);
    expect(PITCH_MIN).toBeLessThan(0.2); // within ~11° of the horizon
    orbitDrag(o, 0, 10000);
    expect(o.pitch).toBe(PITCH_MAX);
    expect(PITCH_MAX).toBeLessThan(Math.PI / 2);
  });

  it("zooms with the wheel, clamped both ways", () => {
    const o = orbit();
    orbitZoom(o, 100);
    expect(o.dist).toBeGreaterThan(DEFAULT_DIST);
    orbitZoom(o, 1e6);
    expect(o.dist).toBe(DIST_MAX);
    orbitZoom(o, -1e6);
    expect(o.dist).toBe(DIST_MIN);
  });

  it("gives back the approved shot at the default orbit", () => {
    const b = boomOffset({ h: 0, y: 0 }, DEFAULT_PITCH, DEFAULT_DIST);
    expect(b.h).toBeCloseTo(21);
    expect(b.y).toBeCloseTo(19.5);
  });

  it("lets a lowered camera sit low over the ground instead of shoving it back up", () => {
    expect(terrainClearance(PITCH_MIN)).toBeLessThan(1.5);
    expect(terrainClearance(DEFAULT_PITCH)).toBeCloseTo(3.5, 1);
  });

  it("never swings itself while the child is steering, or just after, or standing still", () => {
    expect(swingAllowed(true, 100, 0, true)).toBe(false);
    expect(swingAllowed(false, 10, 10 - ASSIST_GRACE / 2, true)).toBe(false);
    expect(swingAllowed(false, 10, 10 - ASSIST_GRACE - 0.01, true)).toBe(true);
    // A child standing still, looking at the view they chose, keeps it.
    expect(swingAllowed(false, 100, 0, false)).toBe(false);
  });
});

describe("the walk and the facing rule", () => {
  const m = makeMoveIntent();
  const FORWARD = cameraFacing(0); // π: north, into the screen

  it("walks where the camera looks", () => {
    moveIntent(m, 0, keys("W"));
    expect(m.x).toBeCloseTo(0);
    expect(m.z).toBeCloseTo(-1);
    expect(Math.abs(angleDelta(m.face, FORWARD))).toBeLessThan(1e-9);
    moveIntent(m, Math.PI / 2, keys("W"));
    expect(m.x).toBeCloseTo(-1); // camera yawed a quarter turn: forward is west
  });

  it("strafes without turning the body", () => {
    for (const k of ["A", "D"]) {
      moveIntent(m, 0, keys(k));
      expect(m.moving).toBe(true);
      expect(Math.abs(m.x)).toBeCloseTo(1);
      expect(Math.abs(angleDelta(m.face, FORWARD))).toBeLessThan(1e-9);
      expect(m.back).toBe(false);
    }
  });

  it("backpedals facing forward instead of turning to face the camera", () => {
    moveIntent(m, 0, keys("S"));
    expect(m.z).toBeCloseTo(1);
    expect(m.back).toBe(true);
    expect(Math.abs(angleDelta(m.face, FORWARD))).toBeLessThan(1e-9);
  });

  it("keeps every walking facing within 45° of the camera's forward", () => {
    for (const yaw of [0, 0.7, -2.4, Math.PI]) {
      for (const k of ["W", "S", "A", "D", "WA", "WD", "SA", "SD"]) {
        moveIntent(m, yaw, keys(k));
        expect(Math.abs(angleDelta(m.face, cameraFacing(yaw)))).toBeLessThanOrEqual(Math.PI / 4 + 1e-9);
      }
    }
  });

  it("never flips the body while a child taps strafe keys walking into the screen", () => {
    // Simulate a second of W with A and D tapped alternately, the owner's exact complaint.
    let face = cameraFacing(0);
    let worst = 0;
    for (let i = 0; i < 120; i++) {
      const k = i % 40 < 10 ? "WA" : i % 40 < 20 ? "W" : i % 40 < 30 ? "WD" : i % 40 < 35 ? "A" : "D";
      moveIntent(m, 0, keys(k));
      face = turnToward(face, m.face, 12, 1 / 60);
      worst = Math.max(worst, Math.abs(angleDelta(face, cameraFacing(0))));
    }
    expect(worst).toBeLessThanOrEqual(Math.PI / 4 + 1e-6);
  });

  it("holds its facing when nothing is pressed, and when opposite keys cancel", () => {
    moveIntent(m, 0, keys(""));
    expect(m.moving).toBe(false);
    expect(Number.isNaN(m.face)).toBe(true);
    moveIntent(m, 0, keys("WS"));
    expect(m.moving).toBe(false);
  });
});
