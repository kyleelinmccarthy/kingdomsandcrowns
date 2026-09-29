import { describe, expect, it } from "vitest";
import {
  AIM_HOLD,
  angleDelta,
  bodyFacing,
  CAM_LIFT,
  CAM_SNAP,
  cameraFacing,
  chaseLens,
  chaseShot,
  DEFAULT_DIST,
  DEFAULT_PITCH,
  DIST_MAX,
  DIST_MIN,
  lookBy,
  looking,
  LOOK_SETTLE,
  makeAim,
  makeCamFloor,
  makeMoveIntent,
  moveIntent,
  OVER_GROUND,
  PITCH_MAX,
  PITCH_MIN,
  settleFloor,
  takeAim,
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

  it("in a room, with no ground to clear, is the boom alone", () => {
    chaseLens(lens, 5, 2, -3, 0, DEFAULT_PITCH, DEFAULT_DIST, null, 0);
    expect(lens.x).toBeCloseTo(5, 9);
    expect(lens.y).toBeCloseTo(21.5, 9);
    expect(lens.z).toBeCloseTo(18, 9);
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
  const T = 100;
  /** No cast, no doorway: an aim that was never taken. */
  const none = makeAim();
  /** A cast (or a lock-on, a doorway, a ride) that asked for `AIM` at `T`. */
  const cast = () => takeAim(makeAim(), AIM, T);

  it("turns a moving body the way it travels, whatever the mouse or a cast asks", () => {
    expect(bodyFacing(0.5, HEADING, false, false, none, T)).toBe(0.5);
    expect(bodyFacing(0.5, HEADING, true, false, cast(), T)).toBe(0.5);
  });

  it("turns a standing child to the camera's heading while they look with the mouse", () => {
    expect(bodyFacing(Number.NaN, HEADING, true, false, none, T)).toBe(HEADING);
  });

  it("turns a standing child with the mouse captured to a fresh cast's aim, and gives the body back to the mouse after the hold", () => {
    // A trouble at the child's elbow: the lock-on turns them to it, captured mouse or not.
    const a = cast();
    expect(bodyFacing(Number.NaN, HEADING, true, false, a, T)).toBe(AIM);
    expect(bodyFacing(Number.NaN, HEADING, true, false, a, T + AIM_HOLD * 0.9)).toBe(AIM);
    expect(bodyFacing(Number.NaN, HEADING, true, false, a, T + AIM_HOLD + 0.01)).toBe(HEADING);
  });

  it("leaves a standing child alone with the mouse free, unless a cast or a doorway turns them", () => {
    expect(Number.isNaN(bodyFacing(Number.NaN, HEADING, false, false, none, T))).toBe(true);
    expect(bodyFacing(Number.NaN, HEADING, false, false, cast(), T)).toBe(AIM);
    // After the hold the body simply stays where the aim turned it.
    expect(Number.isNaN(bodyFacing(Number.NaN, HEADING, false, false, cast(), T + AIM_HOLD + 0.01))).toBe(true);
  });

  it("lets a ride that is steering them (fast travel, getting on) face where it asks, never the camera", () => {
    expect(bodyFacing(Number.NaN, HEADING, true, true, cast(), T)).toBe(AIM);
    expect(Number.isNaN(bodyFacing(0.5, HEADING, true, true, none, T))).toBe(true);
  });

  it("keeps the last aim asked for, and when: a frame with nothing asked keeps the one before", () => {
    const a = makeAim();
    takeAim(a, AIM, T);
    takeAim(a, Number.NaN, T + 0.2);
    expect(a.face).toBe(AIM);
    expect(a.at).toBe(T);
    takeAim(a, 0.3, T + 0.4);
    expect(a.face).toBe(0.3);
    expect(a.at).toBe(T + 0.4);
  });
});

describe("the camera's floor", () => {
  it("follows a step off a plinth as a glide, not a drop, and has settled within half a second", () => {
    const f = makeCamFloor();
    expect(settleFloor(f, 0, 0, 1, 1 / 60)).toBe(1); // the first frame starts where the child is
    const y = settleFloor(f, 0.1, 0, 0, 1 / 60);
    expect(y).toBeGreaterThan(0.5); // less than all the way in one frame…
    expect(y).toBeLessThan(1);
    let z = y;
    for (let i = 1; i < 30; i++) z = settleFloor(f, 0.1, 0, 0, 1 / 60);
    expect(z).toBeLessThan(0.01); // …and there by half a second
  });

  it("is the same glide at any frame rate", () => {
    const a = makeCamFloor();
    const b = makeCamFloor();
    settleFloor(a, 0, 0, 1, 1 / 60);
    settleFloor(b, 0, 0, 1, 1 / 30);
    let ya = 0;
    let yb = 0;
    for (let i = 0; i < 12; i++) ya = settleFloor(a, 0, 0, 0, 1 / 60);
    for (let i = 0; i < 6; i++) yb = settleFloor(b, 0, 0, 0, 1 / 30);
    expect(ya).toBeCloseTo(yb, 9);
  });

  it("snaps to where a door or a ride's arrival put the child, rather than swooping there", () => {
    const f = makeCamFloor();
    settleFloor(f, 0, 0, 0, 1 / 60);
    expect(settleFloor(f, CAM_SNAP + 1, 0, 10, 1 / 60)).toBe(10);
  });
});

describe("the shot", () => {
  const flat = () => -100;
  const still = { lift: 0, pull: 0, tilt: 0 };
  const view = { pitch: DEFAULT_PITCH, dist: DEFAULT_DIST };
  const lens = { x: 0, y: 0, z: 0 };

  it("sits on the child's own boom off the floor under them, looking at them", () => {
    const lookY = chaseShot(lens, 5, 2, -3, 2, 0, view, still, flat);
    expect(lens.x).toBeCloseTo(5, 9);
    expect(lens.y).toBeCloseTo(21.5, 9);
    expect(lens.z).toBeCloseTo(18, 9);
    expect(lookY).toBeCloseTo(2 + 3.4, 9);
  });

  it("follows only a share of a jump, so the child rises in frame", () => {
    chaseShot(lens, 0, 1, 0, 0, 0, view, still, flat);
    expect(lens.y).toBeCloseTo(19.5 + CAM_LIFT, 9);
  });

  it("applies a change of pitch at once: nothing between the mouse and the lens is eased", () => {
    chaseShot(lens, 0, 0, 0, 0, 0, { pitch: 0.5, dist: 20 }, still, flat);
    const y1 = lens.y;
    chaseShot(lens, 0, 0, 0, 0, 0, { pitch: 0.9, dist: 20 }, still, flat);
    expect(lens.y - y1).toBeCloseTo(20 * (Math.sin(0.9) - Math.sin(0.5)), 9);
  });

  it("rises, pulls back and flattens for a mount", () => {
    chaseShot(lens, 0, 0, 0, 0, 0, view, { lift: 2, pull: 0.5, tilt: 0.1 }, flat);
    const d = DEFAULT_DIST * 1.5;
    expect(lens.z).toBeCloseTo(d * Math.cos(DEFAULT_PITCH - 0.1), 9);
    expect(lens.y).toBeCloseTo(2 + d * Math.sin(DEFAULT_PITCH - 0.1), 9);
  });

  it("stays over a hill behind the child, and never comes any nearer", () => {
    const hill = (x: number, z: number) => (z > 10 ? 30 : 0);
    chaseShot(lens, 0, 0, 0, 0, 0, view, still, hill);
    expect(lens.y).toBeCloseTo(30 + terrainClearance(DEFAULT_PITCH) + OVER_GROUND, 9);
    expect(Math.hypot(lens.x, lens.z)).toBeCloseTo(21, 9);
  });
});

describe("the boom", () => {
  it("lets a lowered camera sit low over the ground instead of shoving it back up", () => {
    expect(terrainClearance(PITCH_MIN)).toBeLessThan(1.5);
    expect(terrainClearance(DEFAULT_PITCH)).toBeCloseTo(3.5, 1);
  });
});
