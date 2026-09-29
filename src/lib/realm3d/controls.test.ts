import { describe, expect, it } from "vitest";
import {
  angleDelta,
  bodyFacing,
  cameraFacing,
  chaseLens,
  DEFAULT_DIST,
  DEFAULT_PITCH,
  DIST_MAX,
  DIST_MIN,
  lookBy,
  looking,
  LOOK_SETTLE,
  makeMoveIntent,
  moveIntent,
  PITCH_MAX,
  PITCH_MIN,
  terrainClearance,
  turnToward,
  wrapAngle,
  zoomBy,
  type LookLimits,
  type Orbit,
} from "./controls";

const orbit = (): Orbit => ({ yaw: 0, pitch: DEFAULT_PITCH, dist: DEFAULT_DIST });
const keys = (s: string) => ({ f: s.includes("W"), b: s.includes("S"), l: s.includes("A"), r: s.includes("D") });
const plain = { sensitivity: 1, invertY: false };

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

describe("looking with the mouse", () => {
  it("moving the mouse right looks right: the camera's forward turns clockwise from above", () => {
    const o = orbit();
    lookBy(o, 100, 0, plain);
    // Forward at yaw 0 is north (0,-1). Looking right from north is towards east (+x).
    expect(-Math.sin(o.yaw)).toBeGreaterThan(0.3);
    expect(o.pitch).toBeCloseTo(DEFAULT_PITCH);
  });

  it("moving the mouse up looks up: the camera sinks toward the horizon", () => {
    const o = orbit();
    lookBy(o, 0, -50, plain);
    // 50 px at 0.0042 rad a pixel.
    expect(o.pitch).toBeCloseTo(DEFAULT_PITCH - 0.21, 9);
  });

  it("turns that round for a child who plays with the mouse inverted", () => {
    const o = orbit();
    lookBy(o, 0, -50, { sensitivity: 1, invertY: true });
    expect(o.pitch).toBeCloseTo(DEFAULT_PITCH + 0.21, 9);
  });

  it("turns further, for the same hand, at a higher sensitivity", () => {
    const o = orbit();
    lookBy(o, 100, 0, { sensitivity: 2, invertY: false });
    // 100 px × 0.0062 rad a pixel × 2.
    expect(o.yaw).toBeCloseTo(-1.24, 9);
  });

  it("clamps the pitch, low enough to look out from a summit and never under the ground", () => {
    const o = orbit();
    lookBy(o, 0, -10000, plain);
    expect(o.pitch).toBe(PITCH_MIN);
    expect(PITCH_MIN).toBeLessThan(0.2); // within ~11° of the horizon
    lookBy(o, 0, 10000, plain);
    expect(o.pitch).toBe(PITCH_MAX);
    expect(PITCH_MAX).toBeLessThan(Math.PI / 2);
  });

  it("keeps a room's own limits when it is given them", () => {
    const room: LookLimits = { pitchMin: 0.3, pitchMax: 1.35, distMin: 6, distMax: 22 };
    const o: Orbit = { yaw: 0, pitch: 0.72, dist: 12 };
    lookBy(o, 0, -10000, plain, room);
    expect(o.pitch).toBe(0.3);
    zoomBy(o, -1e6, room);
    expect(o.dist).toBe(6);
  });

  it("zooms with the wheel, clamped both ways", () => {
    const o = orbit();
    zoomBy(o, 100);
    expect(o.dist).toBeGreaterThan(DEFAULT_DIST);
    zoomBy(o, 1e6);
    expect(o.dist).toBe(DIST_MAX);
    zoomBy(o, -1e6);
    expect(o.dist).toBe(DIST_MIN);
  });

  it("counts as looking while the mouse has the camera, and a moment after", () => {
    const s = { pitch: DEFAULT_PITCH, dist: DEFAULT_DIST, held: false, lastLookAt: 10 };
    expect(looking(s, 10 + LOOK_SETTLE / 2)).toBe(true);
    expect(looking(s, 10 + LOOK_SETTLE * 2)).toBe(false);
    s.held = true;
    expect(looking(s, 1000)).toBe(true);
  });
});

describe("the camera never moves itself", () => {
  const lens = { x: 0, y: 0, z: 0 };
  const flat = () => -100;

  it("sits on the child's own boom: their yaw, their pitch, their distance", () => {
    chaseLens(lens, 5, 2, -3, 0, DEFAULT_PITCH, DEFAULT_DIST, flat, 3.5);
    // The approved shot: 21 back (south, +z) and 19.5 up.
    expect(lens.x).toBeCloseTo(5, 9);
    expect(lens.y).toBeCloseTo(21.5, 9);
    expect(lens.z).toBeCloseTo(18, 9);
    chaseLens(lens, 0, 0, 0, Math.PI / 2, DEFAULT_PITCH, DEFAULT_DIST, flat, 3.5);
    expect(lens.x).toBeCloseTo(21, 9);
    expect(lens.z).toBeCloseTo(0, 9);
  });

  it("rises over a hill behind the child, and never comes any nearer", () => {
    const hill = (x: number, z: number) => (z > 10 ? 30 : 0);
    chaseLens(lens, 0, 0, 0, 0, DEFAULT_PITCH, DEFAULT_DIST, hill, 3.5);
    expect(lens.y).toBeCloseTo(33.5, 9);
    expect(Math.hypot(lens.x, lens.z)).toBeCloseTo(21, 9);
  });
});

describe("the walk and the facing rule", () => {
  const m = makeMoveIntent();
  const FORWARD = cameraFacing(0); // π: north, into the screen

  it("walks where the camera looks", () => {
    moveIntent(m, 0, keys("W"));
    expect(m.x).toBeCloseTo(0);
    expect(m.z).toBeCloseTo(-1);
    moveIntent(m, Math.PI / 2, keys("W"));
    expect(m.x).toBeCloseTo(-1); // camera yawed a quarter turn: forward is west
  });

  it("faces the camera's heading whichever way the keys go: A and D strafe, S backpedals", () => {
    for (const yaw of [0, 0.7, -2.4, Math.PI]) {
      for (const k of ["W", "S", "A", "D", "WA", "WD", "SA", "SD"]) {
        moveIntent(m, yaw, keys(k));
        expect(Math.abs(angleDelta(m.face, cameraFacing(yaw))), `${k} at ${yaw}`).toBeLessThan(1e-9);
      }
    }
    moveIntent(m, 0, keys("S"));
    expect(m.z).toBeCloseTo(1);
    expect(m.back).toBe(true);
    moveIntent(m, 0, keys("D"));
    expect(m.x).toBeCloseTo(1);
    expect(m.back).toBe(false);
    expect(Math.abs(angleDelta(m.face, FORWARD))).toBeLessThan(1e-9);
  });

  it("goes no faster on a diagonal", () => {
    moveIntent(m, 0.4, keys("WD"));
    expect(Math.hypot(m.x, m.z)).toBeCloseTo(1, 9);
  });

  it("holds its facing when nothing is pressed, and when opposite keys cancel", () => {
    moveIntent(m, 0, keys(""));
    expect(m.moving).toBe(false);
    expect(Number.isNaN(m.face)).toBe(true);
    moveIntent(m, 0, keys("WS"));
    expect(m.moving).toBe(false);
  });
});

describe("which way the body turns", () => {
  const HEADING = 2;
  const AIM = -1;

  it("turns a moving body the way it travels", () => {
    expect(bodyFacing(0.5, HEADING, false, false, Number.NaN)).toBe(0.5);
    expect(bodyFacing(0.5, HEADING, true, false, AIM)).toBe(0.5);
  });

  it("turns a standing child to the camera's heading while they look with the mouse", () => {
    expect(bodyFacing(Number.NaN, HEADING, true, false, Number.NaN)).toBe(HEADING);
  });

  it("leaves a standing child alone with the mouse free, unless a cast or a doorway turns them", () => {
    expect(Number.isNaN(bodyFacing(Number.NaN, HEADING, false, false, Number.NaN))).toBe(true);
    expect(bodyFacing(Number.NaN, HEADING, false, false, AIM)).toBe(AIM);
  });

  it("lets a ride that is steering them (fast travel, getting on) face where it asks, never the camera", () => {
    expect(bodyFacing(Number.NaN, HEADING, true, true, AIM)).toBe(AIM);
    expect(Number.isNaN(bodyFacing(0.5, HEADING, true, true, Number.NaN))).toBe(true);
  });
});

describe("the boom", () => {
  it("lets a lowered camera sit low over the ground instead of shoving it back up", () => {
    expect(terrainClearance(PITCH_MIN)).toBeLessThan(1.5);
    expect(terrainClearance(DEFAULT_PITCH)).toBeCloseTo(3.5, 1);
  });
});
