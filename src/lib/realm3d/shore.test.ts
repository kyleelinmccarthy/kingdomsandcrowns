import { describe, expect, it } from "vitest";
import { realmWorld, SEA_LEVEL } from "./worldgen";
import { shoreMove, tooDeep, wadeSpeed, waterDepth, WADE_DEPTH, type Pt } from "./shore";

const pt = (): Pt => ({ x: 0, z: 0 });

/** A beach running north-south: dry in the east, dropping away to the west. */
const beach = (x: number): number => x * 0.5 - 2;

describe("wading", () => {
  it("calls dry ground dry however high it is", () => {
    expect(waterDepth(0)).toBe(0);
    expect(waterDepth(SEA_LEVEL)).toBe(0);
    expect(waterDepth(SEA_LEVEL - 1)).toBeCloseTo(1);
  });

  it("lets a child stand in the shallows and refuses the drop-off", () => {
    expect(tooDeep(SEA_LEVEL - 0.4)).toBe(false);
    expect(tooDeep(SEA_LEVEL - WADE_DEPTH + 0.01)).toBe(false);
    expect(tooDeep(SEA_LEVEL - WADE_DEPTH - 0.01)).toBe(true);
  });

  it("slows the walk with the depth and never stops it dead", () => {
    expect(wadeSpeed(0)).toBe(1);
    expect(wadeSpeed(WADE_DEPTH)).toBeCloseTo(0.45);
    expect(wadeSpeed(WADE_DEPTH * 10)).toBeCloseTo(0.45);
    expect(wadeSpeed(WADE_DEPTH / 2)).toBeGreaterThan(0.6);
  });
});

describe("the shore as a refusal, not a wall", () => {
  const ground = (x: number) => beach(x);
  const g = (x: number) => ground(x);

  it("stops a child walking straight out to sea", () => {
    // Waterline at x = -8 (beach = -6); refusal at beach = -7.3, i.e. x = -10.6.
    const out = shoreMove(pt(), -10, 3, -12, 3, g);
    expect(out.x).toBe(-10);
    expect(out.z).toBe(3);
  });

  it("slides the child along the beach when they push at the sea at an angle", () => {
    const out = shoreMove(pt(), -10, 3, -12, 6, g);
    expect(out.x).toBe(-10); // the step seaward is refused
    expect(out.z).toBe(6); // ...and the step along the shore still runs
  });

  it("lets a child wade in until it gets deep", () => {
    const out = shoreMove(pt(), -6, 0, -9, 0, g);
    expect(out.x).toBe(-9);
    expect(waterDepth(ground(-9))).toBeGreaterThan(0);
  });

  it("never traps a child who is already out of their depth", () => {
    const out = shoreMove(pt(), -40, 0, -41, 1, g);
    expect(out.x).toBe(-41);
    expect(out.z).toBe(1);
  });

  it("holds against the real realm: the sea is reachable and the deep is not", () => {
    const w = realmWorld();
    const height = (x: number, z: number) => w.heightAt(x, z);
    // Walk due west from the village until something refuses, one metre at a time.
    const p = { x: 0, z: 15 };
    const out = pt();
    let steps = 0;
    for (; steps < 2000; steps++) {
      shoreMove(out, p.x, p.z, p.x - 1, p.z, height);
      if (out.x === p.x) break;
      p.x = out.x;
    }
    expect(steps).toBeLessThan(2000); // something stopped them
    expect(p.x).toBeGreaterThan(-w.half); // ...well inside the world's own clamp
    // ...and where they stopped, the next step is genuinely deep water.
    expect(w.heightAt(p.x - 1, p.z)).toBeLessThan(SEA_LEVEL);
  });
});
