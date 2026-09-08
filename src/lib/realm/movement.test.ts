import { describe, it, expect } from "vitest";
import { stepHero, setTarget, stepCompanion, unstickHero, setMounted, toggleMount, HERO_SPEED, ARRIVE_RADIUS, HERO_RADIUS, COMPANION_MIN_GAP, COMPANION_GAP_MOUNTED, type HeroState } from "./movement";
import { WORLD_SIZE, type Prop } from "./layout";

const idle: HeroState = { position: { x: 0, z: 0 }, facing: "s", target: null, mounted: false };
const noInput = { axis: { x: 0, z: 0 } };
// Depth 8 (not a small square): a diagonal ray from the origin only ever grazes the
// inflated corner of a 2x2 box by ~0.07 units and never actually enters it — verified
// against the reference stepHero with zero blocked frames across every axis-check
// ordering tried. A tall wall is what "slides along it" actually needs to exercise.
const wall: Prop = { id: "wall", kind: "building", label: "Wall", position: { x: 3, z: 0 }, size: { w: 2, d: 8, h: 2 }, color: "#000", solid: true };

function run(state: HeroState, input: { axis: { x: number; z: number } }, seconds: number, colliders: Prop[] = []) {
  let s = state;
  const dt = 1 / 60;
  // Integer step count: accumulating 1/60 in floating point can run one extra frame.
  for (let i = 0; i < Math.round(seconds * 60); i++) s = stepHero(s, input, dt, colliders);
  return s;
}

describe("stepHero with axis input", () => {
  it("moves at HERO_SPEED and no faster on diagonals", () => {
    const east = run(idle, { axis: { x: 1, z: 0 } }, 1);
    expect(east.position.x).toBeCloseTo(HERO_SPEED, 1);
    const diag = run(idle, { axis: { x: 1, z: 1 } }, 1);
    expect(Math.hypot(diag.position.x, diag.position.z)).toBeCloseTo(HERO_SPEED, 1);
  });
  it("faces the dominant axis and keeps facing when idle", () => {
    expect(stepHero(idle, { axis: { x: -1, z: 0.2 } }, 1 / 60, []).facing).toBe("w");
    expect(stepHero(idle, { axis: { x: 0.1, z: -1 } }, 1 / 60, []).facing).toBe("n");
    expect(stepHero({ ...idle, facing: "e" }, noInput, 1 / 60, []).facing).toBe("e");
  });
  it("clears a pending target", () => {
    const withTarget = setTarget(idle, { x: 5, z: 5 }, []);
    expect(stepHero(withTarget, { axis: { x: 0, z: 1 } }, 1 / 60, []).target).toBeNull();
  });
  it("is unchanged with no input and no target", () => {
    expect(stepHero(idle, noInput, 1 / 60, [])).toBe(idle);
  });
});

describe("targets", () => {
  it("walks to a target and stops within ARRIVE_RADIUS, clearing it", () => {
    const s = run(setTarget(idle, { x: 4, z: 0 }, []), noInput, 3);
    expect(Math.hypot(s.position.x - 4, s.position.z)).toBeLessThanOrEqual(ARRIVE_RADIUS + 0.01);
    expect(s.target).toBeNull();
  });
  it("clamps a target into the world and refuses one inside a solid prop", () => {
    expect(setTarget(idle, { x: 100, z: -100 }, []).target).toEqual({ x: WORLD_SIZE / 2 - HERO_RADIUS, z: -(WORLD_SIZE / 2 - HERO_RADIUS) });
    expect(setTarget(idle, { x: 3, z: 0 }, [wall]).target).toBeNull();
  });
});

describe("colliders and bounds", () => {
  it("stops at a wall but keeps sliding along it", () => {
    const s = run(idle, { axis: { x: 1, z: 1 } }, 1.5, [wall]);
    expect(s.position.x).toBeLessThanOrEqual(wall.position.x - wall.size.w / 2 - HERO_RADIUS + 0.01);
    expect(s.position.z).toBeGreaterThan(1);
  });
  it("never leaves the ground", () => {
    const s = run(idle, { axis: { x: 1, z: 0 } }, 20);
    expect(s.position.x).toBeLessThanOrEqual(WORLD_SIZE / 2 - HERO_RADIUS);
  });
  it("drops a target it cannot reach", () => {
    const s = run(setTarget({ ...idle, position: { x: 0, z: 0 } }, { x: 6, z: 0 }, [wall]), noInput, 3, [wall]);
    expect(s.target).toBeNull();
  });
});

describe("unstickHero", () => {
  const box: Prop = { id: "well", kind: "building", label: "Well", position: { x: -5, z: 8 }, size: { w: 3, d: 3, h: 2.5 }, color: "#000", solid: true };
  it("steps a hero out of a solid prop it stands inside, to just south of it", () => {
    const inside: HeroState = { position: { x: -5, z: 8 }, facing: "n", target: { x: 1, z: 1 }, mounted: false };
    const s = unstickHero(inside, [box]);
    expect(s.position).toEqual({ x: -5, z: 8 + 1.5 + HERO_RADIUS + 0.1 });
    expect(s.target).toBeNull();
  });
  it("returns the same state object when the hero is outside every collider", () => {
    expect(unstickHero(idle, [box])).toBe(idle);
  });
});

describe("stepCompanion", () => {
  it("settles behind the hero at the trailing gap", () => {
    let c = { position: { x: 5, z: 5 } };
    for (let i = 0; i < 600; i++) c = stepCompanion(c, idle, 1 / 60);
    expect(c.position.x).toBeCloseTo(0, 1);
    expect(c.position.z).toBeCloseTo(-1.2, 1);
  });
  it("never crowds closer than the minimum gap", () => {
    const c = stepCompanion({ position: { x: 0.1, z: 0 } }, idle, 1 / 60);
    expect(Math.hypot(c.position.x, c.position.z)).toBeGreaterThanOrEqual(COMPANION_MIN_GAP - 0.001);
  });
});

describe("riding", () => {
  const colliders: Prop[] = [];
  it("moves at the given speed", () => {
    const start: HeroState = { position: { x: 0, z: 0 }, facing: "s", target: null, mounted: true };
    const walked = stepHero(start, { axis: { x: 1, z: 0 } }, 1, colliders);
    const rode = stepHero(start, { axis: { x: 1, z: 0 } }, 1, colliders, 7);
    expect(walked.position.x).toBeCloseTo(3.5, 5);
    expect(rode.position.x).toBeCloseTo(7, 5);
    expect(rode.mounted).toBe(true);
  });
  it("mounts and dismounts, clearing the walk target, only when riding is allowed", () => {
    const start: HeroState = { position: { x: 0, z: 0 }, facing: "s", target: { x: 3, z: 3 }, mounted: false };
    const up = toggleMount(start, true);
    expect(up.mounted).toBe(true);
    expect(up.target).toBeNull();
    expect(toggleMount(up, true).mounted).toBe(false);
    expect(toggleMount(start, false)).toBe(start);
    expect(setMounted(start, false)).toBe(start);
    expect(setMounted(start, true).mounted).toBe(true);
  });
  it("lets the companion follow further back and faster while mounted", () => {
    const hero: HeroState = { position: { x: 0, z: 0 }, facing: "s", target: null, mounted: true };
    let companion = { position: { x: 0, z: -1.2 } };
    for (let i = 0; i < 300; i++) companion = stepCompanion(companion, hero, 1 / 60, { gap: COMPANION_GAP_MOUNTED, speed: 7 });
    expect(companion.position.z).toBeCloseTo(-COMPANION_GAP_MOUNTED, 1);
    const slow = stepCompanion({ position: { x: 0, z: -10 } }, hero, 1, { gap: COMPANION_GAP_MOUNTED, speed: 7 });
    expect(slow.position.z).toBeCloseTo(-10 + 7 * 0.9, 5);
  });
});
