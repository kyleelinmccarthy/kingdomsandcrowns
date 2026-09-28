import { describe, expect, it } from "vitest";
import { HIP_TURN, hipTurn, keepMotion, makeMotion, makeStride, readStride, stepMotion, type Motion } from "./locomotion";

/** The island's walking pace. */
const TOP = 11;
const step = { x: 0, z: 0 };

/** Run `frames` frames of `dt` wanting (wx, wz), and return how far the mover went. */
function run(m: Motion, frames: number, dt: number, wx: number, wz: number, grounded = true) {
  let x = 0;
  let z = 0;
  for (let i = 0; i < frames; i++) {
    stepMotion(m, step, wx, wz, TOP, grounded, dt);
    x += step.x;
    z += step.z;
  }
  return { x, z };
}

describe("getting going and stopping", () => {
  it("reaches full speed in a tenth of a second, and not before", () => {
    const m = makeMotion();
    // 110 units/s² from standing: 5/60 s in, the speed is 110 × 5/60 = 9.1667.
    run(m, 5, 1 / 60, 0, -TOP);
    expect(Math.hypot(m.vx, m.vz)).toBeCloseTo(9.1667, 4);
    const went = run(m, 1, 1 / 60, 0, -TOP);
    expect(m.vz).toBeCloseTo(-11, 9);
    // The whole run-up, 0 → 11 over 0.1 s, covers ½ × 110 × 0.1² = 0.55.
    expect(went.z).toBeCloseTo(-(0.55 - 0.5 * 110 * (5 / 60) ** 2), 9);
  });

  it("stops in 0.08 s from full speed, 0.44 units on", () => {
    const m = makeMotion();
    m.vz = -TOP;
    // 137.5 units/s² of braking: 0.07 s in, 11 − 137.5 × 0.07 = 1.375 is left.
    const a = run(m, 7, 1 / 100, 0, 0);
    expect(m.vz).toBeCloseTo(-1.375, 9);
    const b = run(m, 1, 1 / 100, 0, 0);
    expect(m.vz).toBe(0);
    // v² / 2a = 121 / 275.
    expect(a.z + b.z).toBeCloseTo(-0.44, 9);
    // ...and a stopped mover stays stopped.
    expect(run(m, 10, 1 / 60, 0, 0).z).toBe(0);
  });

  it("walks the same path at the same speeds at 30, 60 and 144 frames a second", () => {
    // W, let go, D, W+D, S (a backpedal is 0.72 of a walk), let go — every change on a frame
    // boundary that all three rates share (sixths of a second).
    const d = TOP * Math.SQRT1_2;
    const script = (t: number): [number, number] =>
      t < 3 / 6 ? [0, -TOP] : t < 4 / 6 ? [0, 0] : t < 6 / 6 ? [TOP, 0] : t < 7 / 6 ? [d, -d] : t < 9 / 6 ? [0, TOP * 0.72] : [0, 0];
    const sample = (hz: number) => {
      const m = makeMotion();
      const out: number[][] = [];
      let x = 0;
      let z = 0;
      for (let i = 0; i < 2 * hz; i++) {
        const [wx, wz] = script(i / hz);
        stepMotion(m, step, wx, wz, TOP, true, 1 / hz);
        x += step.x;
        z += step.z;
        // Every sixth of a second.
        if (((i + 1) * 6) % hz === 0) out.push([x, z, m.vx, m.vz]);
      }
      return out;
    };
    const a = sample(30);
    const b = sample(60);
    const c = sample(144);
    expect(a).toHaveLength(12);
    for (let k = 0; k < 12; k++) {
      for (let j = 0; j < 4; j++) {
        expect(b[k][j]).toBeCloseTo(a[k][j], 9);
        expect(c[k][j]).toBeCloseTo(a[k][j], 9);
      }
    }
    // Half a second of W: 0.55 getting going, then 0.4 s at 11.
    expect(a[2][1]).toBeCloseTo(-4.95, 9);
    expect(a[2][3]).toBeCloseTo(-11, 9);
    // Stopped by the time D is pressed; then moving east, at full speed.
    expect(a[3][3]).toBe(0);
    expect(a[5][2]).toBeCloseTo(11, 9);
  });
});

describe("in the air", () => {
  it("keeps its momentum when the keys are let go", () => {
    const m = makeMotion();
    m.vx = TOP;
    const went = run(m, 18, 1 / 60, 0, 0, false);
    expect(m.vx).toBe(TOP);
    expect(went.x).toBeCloseTo(3.3, 9);
  });

  it("can still be steered, at about a third of the ground's grip", () => {
    const m = makeMotion();
    m.vx = TOP;
    // Wanting to go back the other way: 0.35 × 110 × 0.1 = 3.85 of the 11 is turned round.
    run(m, 6, 1 / 60, -TOP, 0, false);
    expect(m.vx).toBeCloseTo(7.15, 9);
  });
});

describe("against a wall", () => {
  it("loses the speed that runs into it and keeps the speed along it", () => {
    const m = makeMotion();
    m.vx = 7.5;
    m.vz = -7.5;
    // The step north was refused; the step east went.
    keepMotion(m, 0.125, -0.125, 0.125, 0);
    expect(m.vz).toBe(0);
    expect(m.vx).toBe(7.5);
  });
});

describe("what the legs read", () => {
  const s = makeStride();
  const NORTH = Math.PI; // facing into the screen, in the atan2(dx, dz) basis

  it("reads a step to the right as a sidestep, not a run", () => {
    readStride(s, { vx: TOP, vz: 0 }, NORTH, TOP);
    expect(s.speed).toBeCloseTo(1, 9);
    expect(s.lateral).toBeCloseTo(1, 9);
    expect(s.back).toBe(false);
  });

  it("reads a step to the left the other way round", () => {
    readStride(s, { vx: -TOP / 2, vz: 0 }, NORTH, TOP);
    expect(s.speed).toBeCloseTo(0.5, 9);
    expect(s.lateral).toBeCloseTo(-1, 9);
  });

  it("reads backing up as a backpedal at the backpedal's pace", () => {
    readStride(s, { vx: 0, vz: TOP * 0.72 }, NORTH, TOP);
    expect(s.back).toBe(true);
    expect(s.lateral).toBeCloseTo(0, 9);
    expect(s.speed).toBeCloseTo(0.72, 9);
  });

  it("reads a run as a run, and standing as standing", () => {
    readStride(s, { vx: 0, vz: -TOP }, NORTH, TOP);
    expect(s.speed).toBeCloseTo(1, 9);
    expect(s.back).toBe(false);
    expect(s.lateral).toBeCloseTo(0, 9);
    readStride(s, { vx: 0, vz: 0 }, NORTH, TOP);
    expect(s.speed).toBe(0);
    expect(s.lateral).toBe(0);
  });
});

describe("the hips", () => {
  const top = 11;
  /** Where the legs actually carry the body: along the hips' forward, backwards when backpedalling. */
  const legsGo = (facing: number, turn: number, back: boolean) => {
    const k = back ? -1 : 1;
    return { x: k * Math.sin(facing + turn), z: k * Math.cos(facing + turn) };
  };

  it("turn into a sidestep, so the stride runs the way the body goes", () => {
    const s = readStride(makeStride(), { vx: -top, vz: 0 }, 0, top); // facing +z; its right is -x
    const turn = hipTurn(s);
    expect(Math.abs(turn)).toBeCloseTo(HIP_TURN, 5);
    const go = legsGo(0, turn, s.back);
    expect(go.x * -1 + go.z * 0).toBeGreaterThan(0.7);
  });

  it("turn the other way backing up to one side, because the stride runs backwards", () => {
    const d = Math.SQRT1_2 * top;
    const s = readStride(makeStride(), { vx: -d, vz: -d }, 0, top); // back and to the right
    expect(s.back).toBe(true);
    const go = legsGo(0, hipTurn(s), true);
    expect(go.x * -Math.SQRT1_2 + go.z * -Math.SQRT1_2).toBeGreaterThan(0.9);
  });

  it("stay square walking straight, and standing", () => {
    expect(hipTurn(readStride(makeStride(), { vx: 0, vz: top }, 0, top))).toBeCloseTo(0, 6);
    expect(hipTurn(readStride(makeStride(), { vx: 0, vz: 0 }, 0, top))).toBe(0);
  });
});
