import { describe, expect, it } from "vitest";
import { buildWorldLayout } from "@/lib/realm/layout";
import { heightAt } from "./heightfield";
import {
  buildColliders,
  clearFraction,
  gatherNear,
  HERO_RADIUS,
  overlaps,
  pickBoom,
  pushOut,
  segmentEntry,
  slideMove,
  supportHeight,
  type Boom,
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

describe("occlusion", () => {
  it("finds where a segment enters a box, and 1 when it misses", () => {
    expect(segmentEntry(0, 0, 0, 10, 0, 0, box(5, 0, 1, 1, -1, 1))).toBeCloseTo(0.4);
    expect(segmentEntry(0, 0, 0, 10, 0, 0, box(5, 9, 1, 1, -1, 1))).toBe(1);
    // over the top of it
    expect(segmentEntry(0, 5, 0, 10, 5, 0, box(5, 0, 1, 1, -1, 1))).toBe(1);
  });

  it("finds where a segment enters a cylinder", () => {
    expect(segmentEntry(0, 0, 0, 10, 0, 0, cyl(5, 0, 1, -1, 1))).toBeCloseTo(0.4);
    expect(segmentEntry(0, 0, 0, 10, 0, 0, cyl(5, 3, 1, -1, 1))).toBe(1);
  });

  it("reports the boom as clear when nothing is in the way", () => {
    expect(clearFraction(0, 1.5, 0, 0, 19.5, 21, [])).toBe(1);
  });

  it("shortens the boom for something it can be pulled in front of", () => {
    // A canopy hanging right over the sight line, four units back.
    const oak = cyl(0, 4, 1.6, 2, 6.5);
    const f = clearFraction(0, 1.5, 0, 0, 19.5, 21, [oak]);
    expect(f).toBeGreaterThan(0.05);
    expect(f).toBeLessThan(0.45);
  });

  it("swings the camera when the hero is pinned against the far wall of a house", () => {
    // The real case: a 4.5-unit house, roof half-width 2.7, with the hero stopped by its wall
    // half a unit clear of the eaves — and the boom running out along +z, straight into it.
    const house = box(0, 3.25, 2.7, 2.7, 0, 5.35);
    const out = pickBoom({ yaw: 0, frac: 1 } as Boom, 0, 1.5, 0, 0, 21, 19.5, [house]);
    expect(Math.abs(out.yaw)).toBeGreaterThan(0.3); // it did not stay on the blocked angle
    // ...and the angle it chose really can see him.
    const f = clearFraction(0, 1.5, 0, 21 * Math.sin(out.yaw), 19.5, 21 * Math.cos(out.yaw), [house]);
    expect(f).toBeGreaterThan(0.43);
  });

  it("keeps the child's own angle when nothing is in the way", () => {
    const out = pickBoom({ yaw: 0, frac: 1 } as Boom, 0, 1.5, 0, 1.2, 21, 19.5, [box(40, 40, 3, 3, 0, 6)]);
    expect(out.yaw).toBeCloseTo(1.2);
    expect(out.frac).toBe(1);
  });

  it("gathers only what is near, into an array it is handed", () => {
    const dest: Collider[] = new Array(16);
    const n = gatherNear(dest, [cyl(0, 2, 1), cyl(0, 90, 1), cyl(3, 0, 1)], 0, 0, 10);
    expect(n).toBe(2);
  });
});

describe("the village, as colliders", () => {
  const { solids, occluders } = buildColliders(LAYOUT.props, LAYOUT.scenery, PLAN);

  it("makes every raised building and the castle solid", () => {
    for (const slot of [
      { x: -5, z: 8 }, // well
      { x: 6, z: 6 }, // mill
      { x: -7, z: 0 }, // bridge
      { x: -5, z: -6 }, // market
      { x: -9, z: -12 }, // watchtower
      { x: 0, z: -14 }, // castle
    ]) {
      expect(solids.some((c) => overlaps(c, slot.x, slot.z, 0))).toBe(true);
    }
  });

  it("leaves unbuilt foundations, villagers and the road walk-through", () => {
    // library (6, -8) is a foundation in this layout, and a child has to stand on the site.
    expect(solids.some((c) => overlaps(c, 6, -8, 0))).toBe(false);
    for (const v of LAYOUT.villagers) expect(solids.some((c) => overlaps(c, v.position.x, v.position.z, 0))).toBe(false);
    for (let z = 0; z < 16; z += 2) expect(solids.some((c) => overlaps(c, 0, z, HERO_RADIUS))).toBe(false);
  });

  it("does not turn the wood into a maze", () => {
    const trees = LAYOUT.scenery.filter((p) => p.variant === "oak" || p.variant === "pine");
    const solidTrees = trees.filter((t) => t.solid);
    expect(trees.length).toBeGreaterThan(500);
    expect(solidTrees.length).toBe(3); // the three great oaks, and only those
  });

  it("gives canopies to the camera even though they are walked under", () => {
    const oak = LAYOUT.scenery.find((p) => p.variant === "oak" && !p.solid && Math.abs(p.position.x) < 60)!;
    const here = occluders.filter((c) => Math.hypot(c.x - oak.position.x, c.z - oak.position.z) < 0.01);
    // The canopy, which starts over a head, and the trunk under it.
    expect(here.length).toBe(2);
    const [crown, trunk] = here[0].base > here[1].base ? here : [here[1], here[0]];
    expect(crown.base).toBeGreaterThan(heightAt(oak.position.x, oak.position.z));
    expect(trunk.hw).toBeLessThan(crown.hw);
    expect(trunk.top).toBeCloseTo(crown.base);
  });

  it("gives the camera a wider box than the hero gets, because the roof overhangs the wall", () => {
    const mill = { x: 6, z: 6 };
    const s = solids.find((c) => Math.abs(c.x - mill.x) < 0.01 && Math.abs(c.z - mill.z) < 0.01)!;
    const o = occluders.find((c) => Math.abs(c.x - mill.x) < 0.01 && Math.abs(c.z - mill.z) < 0.01)!;
    expect(o.hw).toBeGreaterThan(s.hw);
    expect(o.top).toBeGreaterThan(s.top);
  });

  it("stays small enough to walk every frame", () => {
    expect(solids.length).toBeLessThan(80);
    // Every tree is two: a canopy and the trunk under it.
    expect(occluders.length).toBeLessThan(1700);
  });

  it("can always find the hero a camera angle, anywhere in the village", () => {
    const out: Boom = { yaw: 0, frac: 1 };
    const near: Collider[] = new Array(512);
    const move: Pt = { x: 0, z: 0 };
    for (let x = -16; x <= 16; x += 1) {
      for (let z = -18; z <= 18; z += 1) {
        // Only from spots a hero could actually stand in.
        const p = pushOut(move, x, z, solids);
        const y = heightAt(p.x, p.z) + 1.5;
        const n = gatherNear(near, occluders, p.x, p.z, 24);
        pickBoom(out, p.x, y, p.z, 0, 21, 19.5, near, n);
        const f = clearFraction(p.x, y, p.z, 21 * Math.sin(out.yaw), 19.5, 21 * Math.cos(out.yaw), near, n);
        expect(Math.max(f, out.frac)).toBeGreaterThan(0.2);
      }
    }
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
