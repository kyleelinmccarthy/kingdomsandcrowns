import { describe, expect, it } from "vitest";
import { LAND_MIN_AIR, makeStride, strideTick } from "./stride";

function feet() {
  const log: string[] = [];
  return { log, h: { onStep: (x: number, z: number) => log.push(`step ${x},${z}`), onJump: () => log.push("jump"), onLand: (air: number) => log.push(`land ${air.toFixed(2)}`) } };
}

describe("the hero's feet", () => {
  it("puts a foot down each half stride while walking, at the hero's position", () => {
    const s = makeStride();
    const { log, h } = feet();
    const dt = 1 / 60;
    let phase = 0;
    // The scene's walking stride: 9 radians a second.
    for (let i = 0; i < 120; i++) {
      phase += 9 * dt;
      strideTick(s, h, phase, true, true, dt, 3, 4);
    }
    // Two seconds at 9 rad/s is 18 radians: five or six footfalls, never one a frame.
    expect(log.length).toBeGreaterThanOrEqual(5);
    expect(log.length).toBeLessThanOrEqual(6);
    expect(log[0]).toBe("step 3,4");
  });

  it("is silent standing still, however the idle phase moves", () => {
    const s = makeStride();
    const { log, h } = feet();
    let phase = 0;
    for (let i = 0; i < 300; i++) strideTick(s, h, (phase += 2 / 60), true, false, 1 / 60, 0, 0);
    expect(log).toEqual([]);
  });

  it("walks backwards as well as forwards", () => {
    const s = makeStride();
    const { log, h } = feet();
    let phase = 0;
    for (let i = 0; i < 60; i++) strideTick(s, h, (phase -= 9 / 60), true, true, 1 / 60, 0, 0);
    expect(log.length).toBeGreaterThanOrEqual(2);
  });

  it("lands after a real jump, and the footfall that coincides with the landing is swallowed", () => {
    const s = makeStride();
    const { log, h } = feet();
    let phase = 0;
    strideTick(s, h, phase, true, true, 1 / 60, 0, 0);
    for (let i = 0; i < 36; i++) strideTick(s, h, (phase += 3 / 60), false, true, 1 / 60, 0, 0);
    strideTick(s, h, (phase += 3 / 60), true, true, 1 / 60, 0, 0);
    expect(log).toEqual(["land 0.60"]);
  });

  it("does not call a kerb a landing", () => {
    const s = makeStride();
    const { log, h } = feet();
    strideTick(s, h, 0, true, false, 1 / 60, 0, 0);
    const frames = Math.floor((LAND_MIN_AIR * 60) / 2);
    for (let i = 0; i < frames; i++) strideTick(s, h, 0, false, false, 1 / 60, 0, 0);
    strideTick(s, h, 0, true, false, 1 / 60, 0, 0);
    expect(log).toEqual([]);
  });
});
