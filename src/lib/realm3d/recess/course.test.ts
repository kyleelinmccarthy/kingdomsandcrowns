import { describe, expect, it } from "vitest";
import { buildWorldLayout, BUILDING_SLOTS, CASTLE_FOOTPRINTS } from "@/lib/realm/layout";
import { buildColliders, type Collider } from "../collision";
import { castlePlan } from "../castle-plan";
import { heightAt } from "../heightfield";
import { rideSpeed, RIDE_RADIUS } from "../riding";
import { realmWorld } from "../worldgen";
import { findMount } from "@/lib/utils/avatar-catalog";
import {
  ARCH,
  ARCH_HALF_SPAN,
  ARCH_RADIUS,
  buildLapCourse,
  COURSE_ID,
  COURSE_MAX_SECONDS,
  COURSE_MIN_SECONDS,
  expectedLapSeconds,
  MAX_RIDE_SPEED,
  minLapMs,
  nextPost,
  pointAt,
  POST_RADIUS,
  progressAlong,
  ringCourse,
  WALK_SPEED,
} from "./course";

const world = realmWorld();
const course = buildLapCourse();

/**
 * Everything that stops a walker, as the scene builds it (`spike-scene.tsx`): the village at its
 * biggest — every building raised — and the castle standing at `tier`, plus every solid tree and
 * stone the island grows near the Ring.
 */
function solidsFor(tier: string): Collider[] {
  const layout = buildWorldLayout({
    castleType: tier,
    buildings: Object.keys(BUILDING_SLOTS).map((id) => ({ id, done: 3, total: 3, complete: true })),
    villagers: true,
    banners: 8,
    decor: true,
    objectiveIds: [],
  });
  const built = buildColliders(layout.props.filter((p) => p.kind !== "castle"), layout.scenery, { sitePlan: 1.5, wallH: 3.1, roofH: 2.25, treeScale: 1.25, patchHalf: 80 });
  const castle = layout.props.find((p) => p.kind === "castle")!;
  const plan = castlePlan(tier);
  const g = heightAt(castle.position.x, castle.position.z);
  for (const b of plan.solids) built.solids.push({ x: castle.position.x + b.x, z: castle.position.z + b.z, hw: b.hw, hd: b.hd, round: b.round, base: g + b.base, top: g + b.top });
  world.forEachPropNear(0, 0, 130, (p) => {
    if (!p.solid) return;
    const tree = p.variant === "oak" || p.variant === "pine";
    const r = tree ? 0.42 * p.scale : p.variant === "menhir" ? 0.32 * p.scale : 0.62 * p.scale;
    built.solids.push({ x: p.x, z: p.z, hw: Math.max(0.35, r), hd: Math.max(0.35, r), round: true, base: p.y, top: p.y + 2.4 * p.scale });
  });
  return built.solids;
}

/** How far a body of radius `r` at (x, z) is from the nearest solid's edge (negative: inside it). */
function clearance(solids: readonly Collider[], x: number, z: number, r: number): number {
  let best = Infinity;
  for (const c of solids) {
    const d = c.round
      ? Math.hypot(c.x - x, c.z - z) - c.hw
      : Math.hypot(Math.max(0, Math.abs(x - c.x) - c.hw), Math.max(0, Math.abs(z - c.z) - c.hd));
    best = Math.min(best, d - r);
  }
  return best;
}

describe("the Ring's shape", () => {
  it("is eight posts, in order, on a closed path that starts and ends at the arch", () => {
    expect(course.id).toBe(COURSE_ID);
    expect(course.posts).toHaveLength(8);
    course.posts.forEach((p, i) => expect(p.index).toBe(i));
    expect(course.path[0]).toEqual(ARCH);
    expect(course.path[course.path.length - 1]).toEqual(ARCH);
    // Post i is path point i + 1, and the distance to it is where the ghost reads it.
    course.posts.forEach((p, i) => {
      expect(course.path[i + 1]).toEqual(p.position);
      expect(course.postAt[i]).toBeCloseTo(course.cum[i + 1]);
    });
    expect(course.cum[course.cum.length - 1]).toBeCloseTo(course.lengthUnits);
    expect(ringCourse()).toBe(ringCourse());
  });

  it("passes all five of the authored places", () => {
    for (const id of ["ringstones", "highcairn", "longwater", "farfurrow", "appleway"]) {
      const place = world.landmarks.find((l) => l.id === id)!;
      const near = course.posts.some((p) => Math.hypot(p.position.x - place.position.x, p.position.z - place.position.z) <= place.radius + 20);
      expect(near, id).toBe(true);
    }
  });

  it("puts no two posts, or a post and the arch, close enough to pass both at once", () => {
    const marks = [ARCH, ...course.posts.map((p) => p.position)];
    for (let i = 0; i < marks.length; i++)
      for (let j = i + 1; j < marks.length; j++) expect(Math.hypot(marks[i].x - marks[j].x, marks[i].z - marks[j].z)).toBeGreaterThan(POST_RADIUS + ARCH_RADIUS + 4);
  });
});

describe("the lap is budgeted against the clock (D12.5)", () => {
  it("takes 35 to 48 seconds on foot at the island's walking pace", () => {
    const s = expectedLapSeconds(course, WALK_SPEED);
    expect(s).toBeGreaterThanOrEqual(COURSE_MIN_SECONDS);
    expect(s).toBeLessThanOrEqual(COURSE_MAX_SECONDS);
  });

  it("is a real job for a mount: a Wyrm is about twice as fast, a Pony still well ahead of feet", () => {
    expect(expectedLapSeconds(course, rideSpeed(findMount("wyrm")!))).toBeLessThan(20);
    expect(expectedLapSeconds(course, rideSpeed(findMount("pony")!))).toBeLessThan(expectedLapSeconds(course, WALK_SPEED) * 0.8);
  });

  it("refuses a lap faster than the fastest mount could run it, and nothing a real one could", () => {
    const fastest = expectedLapSeconds(course, MAX_RIDE_SPEED) * 1000;
    expect(minLapMs(course)).toBeGreaterThan(0);
    expect(minLapMs(course)).toBeLessThan(fastest);
  });
});

describe("the Ring is clear to run", () => {
  const tiers = Object.keys(CASTLE_FOOTPRINTS);

  it.each(tiers)("every leg is a straight run clear of every wall, tree and stone, on foot and mounted (castle: %s)", (tier) => {
    const solids = solidsFor(tier);
    for (let i = 0; i < course.path.length - 1; i++) {
      const a = course.path[i];
      const b = course.path[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 0; s <= len; s += 0.25) {
        const x = a.x + ((b.x - a.x) * s) / len;
        const z = a.z + ((b.z - a.z) * s) / len;
        const c = clearance(solids, x, z, RIDE_RADIUS);
        expect(c, `leg ${i} at ${x.toFixed(1)},${z.toFixed(1)}`).toBeGreaterThan(0.2);
      }
    }
  });

  it("never runs through water deeper than a wade", () => {
    for (let i = 0; i < course.path.length - 1; i++) {
      const a = course.path[i];
      const b = course.path[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 0; s <= len; s += 0.5) {
        const x = a.x + ((b.x - a.x) * s) / len;
        const z = a.z + ((b.z - a.z) * s) / len;
        expect(world.waterLevelAt(x, z) - world.heightAt(x, z), `leg ${i} at ${x.toFixed(1)},${z.toFixed(1)}`).toBeLessThan(0.3);
      }
    }
  });

  it("leaves the arch's pillars standing on dry, open ground either side of the cobbles", () => {
    const solids = solidsFor("citadel");
    for (const dx of [-ARCH_HALF_SPAN, ARCH_HALF_SPAN]) expect(clearance(solids, ARCH.x + dx, ARCH.z, 0.4)).toBeGreaterThan(0.3);
  });

  it("stands the arch square in front of the spawn, a few steps ahead", () => {
    // The spawn is (0, 15) facing north (-z): the arch is straight ahead of it.
    expect(ARCH.x).toBe(0);
    expect(15 - ARCH.z).toBeGreaterThan(6);
    expect(15 - ARCH.z).toBeLessThan(14);
  });
});

describe("reading the course", () => {
  it("walks the path by distance, wrapping round a lap", () => {
    const p = { x: 0, z: 0 };
    expect(pointAt(course, 0, p)).toEqual({ x: ARCH.x, z: ARCH.z });
    pointAt(course, course.postAt[3], p);
    expect(p.x).toBeCloseTo(course.posts[3].position.x);
    expect(p.z).toBeCloseTo(course.posts[3].position.z);
    pointAt(course, course.lengthUnits + course.postAt[0], p);
    expect(p.x).toBeCloseTo(course.posts[0].position.x);
  });

  it("measures progress: 0 at the arch, about a half half-way, rising along the path", () => {
    expect(progressAlong(course, ARCH, 0)).toBeCloseTo(0);
    const mid = pointAt(course, course.lengthUnits / 2, { x: 0, z: 0 });
    const legOfMid = course.postAt.findIndex((d) => d > course.lengthUnits / 2);
    expect(progressAlong(course, mid, legOfMid)).toBeCloseTo(0.5, 2);
    let last = -1;
    for (let d = 0; d < course.lengthUnits - 1; d += 7) {
      const q = pointAt(course, d, { x: 0, z: 0 });
      const leg = course.postAt.findIndex((x) => x >= d);
      const f = progressAlong(course, q, leg === -1 ? course.posts.length : leg);
      expect(f).toBeGreaterThanOrEqual(last - 1e-9);
      last = f;
    }
  });

  it("names the next post, and nothing once they are all passed", () => {
    expect(nextPost(course, 0)?.id).toBe("west-track");
    expect(nextPost(course, 7)?.id).toBe("appleway");
    expect(nextPost(course, 8)).toBeNull();
  });
});
