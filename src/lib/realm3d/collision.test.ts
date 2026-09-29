import { describe, expect, it } from "vitest";
import { buildWorldLayout, BUILDING_SLOTS, CASTLE_POSITION } from "@/lib/realm/layout";
import { heightAt } from "./heightfield";
import {
  buildColliders,
  HERO_RADIUS,
  overlaps,
  pushOut,
  slideMove,
  supportHeight,
  type Collider,
  type Pt,
} from "./collision";
import { GRAVITY, JUMP_SPEED, makeVertical, stepVertical, tryJump } from "./jump";

const box = (x: number, z: number, hw: number, hd: number, base = 0, top = 4): Collider => ({ x, z, hw, hd, round: false, base, top });
const cyl = (x: number, z: number, r: number, base = 0, top = 4): Collider => ({ x, z, hw: r, hd: r, round: true, base, top });
const pt = (): Pt => ({ x: 0, z: 0 });

const PLAN = { sitePlan: 1.5, wallH: 3.1, roofH: 2.25, treeScale: 1.25, patchHalf: 66 };
const LAYOUT = buildWorldLayout({
  castleType: "castle",
  buildings: [
    { id: "well", done: 5, total: 5, complete: true },
    { id: "mill", done: 5, total: 5, complete: true },
    { id: "bridge", done: 5, total: 5, complete: true },
    { id: "chapel", done: 3, total: 5, complete: false },
    { id: "market", done: 5, total: 5, complete: true },
    { id: "library", done: 1, total: 5, complete: false },
    { id: "watchtower", done: 5, total: 5, complete: true },
    { id: "garden", done: 0, total: 5, complete: false },
  ],
  banners: 5,
  objectiveIds: ["chapel", "library", "garden"],
});

describe("solids", () => {
  it("stops a hero walking head-on into a wall", () => {
    const wall = [box(0, 0, 2, 2)];
    const out = slideMove(pt(), 0, 5, 0, 2.2, wall, HERO_RADIUS, 0);
    expect(out.z).toBe(5);
    expect(out.x).toBe(0);
  });

  it("slides along the wall instead of halting when the hero arrives at an angle", () => {
    const wall = [box(0, 0, 6, 2)]; // a long wall running east-west
    // Heading south-west into its north face: z is refused, x still runs. That is the slide.
    const out = slideMove(pt(), 3, 3, 2.6, 2.4, wall, HERO_RADIUS, 0);
    expect(out.z).toBe(3);
    expect(out.x).toBeCloseTo(2.6);
  });

  it("lets the hero walk right up to the wall, not stop a stride short", () => {
    const wall = [box(0, 0, 2, 2)];
    let p = { x: 0, z: 6 };
    for (let i = 0; i < 200; i++) p = slideMove(pt(), p.x, p.z, p.x, p.z - 0.05, wall, HERO_RADIUS, 0);
    expect(p.z).toBeGreaterThan(2 + HERO_RADIUS);
    expect(p.z).toBeLessThan(2 + HERO_RADIUS + 0.06);
  });

  it("walks around a round collider too", () => {
    const stone = [cyl(0, 0, 1.2)];
    expect(overlaps(stone[0], 1.0, 0, HERO_RADIUS)).toBe(true);
    const out = slideMove(pt(), 0, 3, 0, 1.0, stone, HERO_RADIUS, 0);
    expect(out.z).toBe(3);
  });

  it("is height-aware: a jump clears a low bed but never a house wall", () => {
    const bed = [box(0, 0, 2, 2, 0, 1.0)];
    expect(slideMove(pt(), 0, 3, 0, 2.2, bed, HERO_RADIUS, 0).z).toBe(3); // on foot
    expect(slideMove(pt(), 0, 3, 0, 2.2, bed, HERO_RADIUS, 1.4).z).toBeCloseTo(2.2); // in the air
    const house = [box(0, 0, 2, 2, 0, 3.1)];
    expect(slideMove(pt(), 0, 3, 0, 2.2, house, HERO_RADIUS, 1.6).z).toBe(3);
  });

  it("shoves a hero standing inside something out of it", () => {
    const out = pushOut(pt(), 0.2, 0.1, [box(0, 0, 2, 2)]);
    expect(overlaps(box(0, 0, 2, 2), out.x, out.z, HERO_RADIUS)).toBe(false);
  });

  it("stands the hero on top of a thing they have got above, and not on one they have not", () => {
    const bed = [box(0, 0, 2, 2, 0, 1.0)];
    expect(supportHeight(0, 0, -1, bed, HERO_RADIUS, 1.2)).toBe(1.0);
    expect(supportHeight(0, 0, -1, bed, HERO_RADIUS, 0.2)).toBe(-1); // still below its top
    expect(supportHeight(9, 9, -1, bed, HERO_RADIUS, 5)).toBe(-1); // nowhere near it
  });
});

describe("the village, as colliders", () => {
  const { solids } = buildColliders(LAYOUT.props, LAYOUT.scenery, PLAN);

  it("makes every raised building and the castle solid", () => {
    for (const slot of [
      BUILDING_SLOTS.well,
      BUILDING_SLOTS.mill,
      BUILDING_SLOTS.bridge,
      BUILDING_SLOTS.market,
      BUILDING_SLOTS.watchtower,
      CASTLE_POSITION,
    ]) {
      expect(solids.some((c) => overlaps(c, slot.x, slot.z, 0))).toBe(true);
    }
  });

  it("leaves unbuilt foundations, villagers and the road walk-through", () => {
    // The library is a foundation in this layout, and a child has to stand on the site.
    expect(solids.some((c) => overlaps(c, BUILDING_SLOTS.library.x, BUILDING_SLOTS.library.z, 0))).toBe(false);
    for (const v of LAYOUT.villagers) expect(solids.some((c) => overlaps(c, v.position.x, v.position.z, 0))).toBe(false);
    for (let z = 0; z < 16; z += 2) expect(solids.some((c) => overlaps(c, 0, z, HERO_RADIUS))).toBe(false);
  });

  it("does not turn the wood into a maze", () => {
    const trees = LAYOUT.scenery.filter((p) => p.variant === "oak" || p.variant === "pine");
    const solidTrees = trees.filter((t) => t.solid);
    expect(trees.length).toBeGreaterThan(500);
    expect(solidTrees.length).toBe(3); // the three great oaks, and only those
  });

  it("stays small enough to walk every frame", () => {
    expect(solids.length).toBeLessThan(80);
  });

  it("builds only what stops the hero: nothing is kept for a camera to steer round", () => {
    expect(Object.keys(buildColliders(LAYOUT.props, LAYOUT.scenery, PLAN))).toEqual(["solids"]);
  });
});

describe("jumping", () => {
  const flat: Collider[] = [];

  it("rises about chest height and is back down inside two thirds of a second", () => {
    const v = makeVertical(0);
    expect(tryJump(v)).toBe(true);
    let peak = 0;
    let t = 0;
    for (let i = 0; i < 200 && (i === 0 || !v.grounded); i++) {
      stepVertical(v, 1 / 120, 0, 0, 0, flat);
      peak = Math.max(peak, v.y);
      t += 1 / 120;
    }
    expect(peak).toBeGreaterThan(1.2);
    expect(peak).toBeLessThan(1.8);
    expect(t).toBeLessThan(0.68);
    expect(v.grounded).toBe(true);
    expect(v.y).toBe(0);
  });

  it("matches the arithmetic it advertises", () => {
    expect((JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY)).toBeCloseTo(1.47, 2);
  });

  it("is the same jump at 30, 60 and 144 frames a second", () => {
    // y = 10t − 17t², sampled at sixths of a second (a frame boundary at all three rates).
    const want = [1.194444444, 1.444444444, 0.75];
    for (const hz of [30, 60, 144]) {
      const v = makeVertical(0);
      tryJump(v);
      const got: number[] = [];
      for (let i = 1; i <= hz / 2; i++) {
        stepVertical(v, 1 / hz, 0, 0, 0, flat);
        if ((i * 6) % hz === 0) got.push(v.y);
      }
      for (let k = 0; k < 3; k++) expect(got[k], `${hz} Hz at ${k + 1}/6 s`).toBeCloseTo(want[k], 8);
    }
  });

  it("refuses a second jump in the air, and a held key is one jump", () => {
    const v = makeVertical(0);
    tryJump(v);
    stepVertical(v, 1 / 60, 0, 0, 0, flat);
    expect(tryJump(v)).toBe(false);
    for (let i = 0; i < 12; i++) stepVertical(v, 1 / 60, 0, 0, 0, flat);
    expect(tryJump(v)).toBe(false); // still on the way up or over the top
  });

  it("lands on the terrain under the hero, not on y = 0", () => {
    const v = makeVertical(0);
    tryJump(v);
    for (let i = 0; i < 300 && !v.grounded; i++) stepVertical(v, 1 / 120, 30, -40, heightAt(30, -40), flat);
    expect(v.y).toBeCloseTo(heightAt(30, -40), 3);
  });

  it("lands on top of a thing it cleared", () => {
    const bed = [box(0, 0, 2, 2, 0, 1.0)];
    const v = makeVertical(0);
    v.y = 0;
    tryJump(v);
    for (let i = 0; i < 300 && !v.grounded; i++) stepVertical(v, 1 / 120, 0, 0, 0, bed);
    expect(v.y).toBe(1.0);
  });

  it("gives a child a moment to jump after stepping off an edge", () => {
    const v = makeVertical(0);
    v.grounded = false;
    v.airborne = 0.08;
    v.vy = -0.4;
    expect(tryJump(v)).toBe(true);
    const w = makeVertical(0);
    w.grounded = false;
    w.airborne = 0.5;
    w.vy = -4;
    expect(tryJump(w)).toBe(false);
  });
});
