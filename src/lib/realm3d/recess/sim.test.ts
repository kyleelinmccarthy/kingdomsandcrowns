import { beforeEach, describe, expect, it } from "vitest";
import { ARCH_RADIUS, pointAt, POST_RADIUS, ringCourse } from "./course";
import {
  endRun,
  GLEAM_COUNT,
  GLEAM_COUNT_LOW,
  GLEAM_OFF_MAX,
  GLEAM_RESPAWN_MS,
  bumpHoldMs,
  holdLap,
  lapElapsed,
  lapHeld,
  makeRun,
  pauseLap,
  spawnGleams,
  startRun,
  stepRun,
  voidLap,
  type RecessEvent,
  type RecessRun,
} from "./sim";
import { ghostAt, ghostGapMs, ghostStep, type GhostSample } from "./ghost";

const course = ringCourse();
const open = () => true;

/** Steps once at (x, z) and hands back the events, draining them as the scene does. */
function step(run: RecessRun, x: number, z: number, o: { dt?: number; mounted?: boolean; travelling?: boolean } = {}): RecessEvent[] {
  stepRun(run, course, { dt: o.dt ?? 16, x, z, mounted: o.mounted ?? false, travelling: o.travelling ?? false });
  const out = run.events.slice(0, run.nEvents).map((e) => ({ ...e }));
  run.nEvents = 0;
  return out;
}

const at = (i: number) => course.posts[i].position;
const arch = course.arch;

/** Through the arch, then post by post, each after `legMs`. */
function runLap(run: RecessRun, legMs = 4000, mountedAt = -1): RecessEvent[] {
  const all: RecessEvent[] = [];
  all.push(...step(run, arch.x, arch.z));
  course.posts.forEach((_, i) => all.push(...step(run, at(i).x, at(i).z, { dt: legMs, mounted: i === mountedAt })));
  all.push(...step(run, arch.x, arch.z, { dt: legMs }));
  return all;
}

let run: RecessRun;
beforeEach(() => {
  run = makeRun(7);
});

describe("starting and ending", () => {
  it("does nothing until a run is started", () => {
    expect(step(run, arch.x, arch.z)).toEqual([]);
    spawnGleams(run, course, open);
    expect(run.gleams.some((g) => g.live)).toBe(false);
  });

  it("starts the lap clock only when the child runs through the arch, with post 1 next", () => {
    startRun(run, "recess", false);
    expect(step(run, 0, 15)).toEqual([]);
    expect(lapElapsed(run)).toBeNull();
    expect(step(run, arch.x + 1, arch.z).map((e) => e.kind)).toEqual(["started"]);
    expect(run.nextPost).toBe(0);
    step(run, arch.x, arch.z, { dt: 1000 });
    expect(lapElapsed(run)).toBe(1000);
  });

  it("a second start is refused, but recess arriving turns a child's own run into recess", () => {
    expect(startRun(run, "arch", false)).toBe(true);
    expect(startRun(run, "arch", false)).toBe(false);
    startRun(run, "recess", false);
    expect(run.kind).toBe("recess");
  });

  it("ending clears the gleams and the running lap", () => {
    startRun(run, "recess", false);
    spawnGleams(run, course, open);
    step(run, arch.x, arch.z);
    endRun(run);
    expect(run.active).toBe(false);
    expect(run.gleams.some((g) => g.live)).toBe(false);
    expect(lapElapsed(run)).toBeNull();
  });
});

describe("a lap", () => {
  it("advances post to post in order, closes only at the arch after every post, and times it", () => {
    startRun(run, "recess", false);
    const events = runLap(run, 4000);
    expect(events.filter((e) => e.kind === "post").map((e) => e.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const lap = events.find((e) => e.kind === "lap")!;
    expect(lap.lapMs).toBe(9 * 4000);
    expect(lap.n).toBe(1);
    expect(lap.mounted).toBe(false);
    expect("best" in lap).toBe(false);
  });

  it("recess goes on: the next lap starts at the arch as this one ends", () => {
    startRun(run, "recess", false);
    runLap(run);
    expect(run.active).toBe(true);
    expect(run.nextPost).toBe(0);
    expect(lapElapsed(run)).toBe(0);
    const second = course.posts.flatMap((_, i) => step(run, at(i).x, at(i).z, { dt: 3000 })).concat(step(run, arch.x, arch.z, { dt: 3000 }));
    expect(second.find((e) => e.kind === "lap")).toMatchObject({ n: 2, lapMs: 27000 });
  });

  it("a child's own run is one lap, then done", () => {
    startRun(run, "arch", false);
    spawnGleams(run, course, open);
    runLap(run);
    expect(run.active).toBe(false);
    expect(run.gleams.some((g) => g.live)).toBe(false);
  });

  it("standing at the arch never closes a lap, and the arch does nothing mid-lap", () => {
    startRun(run, "recess", false);
    step(run, arch.x, arch.z);
    for (let i = 0; i < 5; i++) expect(step(run, arch.x, arch.z, { dt: 5000 })).toEqual([]);
    step(run, at(0).x, at(0).z);
    expect(step(run, arch.x, arch.z)).toEqual([]);
  });

  it("ignores posts out of order, and nudges once a run", () => {
    startRun(run, "recess", false);
    step(run, arch.x, arch.z);
    expect(step(run, at(2).x, at(2).z)).toEqual([{ kind: "offCourse", n: 2, lapMs: 0, mounted: false }]);
    expect(step(run, at(3).x, at(3).z)).toEqual([]);
    expect(run.nextPost).toBe(0);
    expect(step(run, at(0).x, at(0).z + POST_RADIUS - 0.1).map((e) => e.kind)).toEqual(["post"]);
  });

  it("a lap ridden for any part is a ridden lap, even after getting down", () => {
    startRun(run, "recess", false);
    const lap = runLap(run, 3000, 2).find((e) => e.kind === "lap")!;
    expect(lap.mounted).toBe(true);
  });

  it("time the game took from the child is taken off the lap", () => {
    startRun(run, "recess", false);
    step(run, arch.x, arch.z);
    pauseLap(run, 1500);
    const rest = course.posts.flatMap((_, i) => step(run, at(i).x, at(i).z, { dt: 4000 })).concat(step(run, arch.x, arch.z, { dt: 4000 }));
    expect(rest.find((e) => e.kind === "lap")!.lapMs).toBe(9 * 4000 - 1500);
  });

  it("a trouble's bump holds the lap clock for exactly what it cost (D12.9), and the time stands still rather than counting back", () => {
    startRun(run, "recess", false);
    step(run, arch.x, arch.z);
    step(run, at(0).x, at(0).z, { dt: 4000 });
    const before = lapElapsed(run)!;
    holdLap(run, 1000);
    expect(lapHeld(run)).toBe(true);
    // Mid-hold the clock stands still: it never jumps back.
    step(run, 0, 0, { dt: 400 });
    expect(lapElapsed(run)).toBe(before);
    step(run, 0, 0, { dt: 400 });
    expect(lapElapsed(run)).toBe(before);
    // The hold ends part-way through a frame: only the rest of that frame counts.
    step(run, 0, 0, { dt: 400 });
    expect(lapElapsed(run)).toBe(before + 200);
    expect(lapHeld(run)).toBe(false);
    const rest = course.posts.slice(1).flatMap((_, i) => step(run, at(i + 1).x, at(i + 1).z, { dt: 4000 })).concat(step(run, arch.x, arch.z, { dt: 4000 }));
    expect(rest.find((e) => e.kind === "lap")!.lapMs).toBe(9 * 4000 + 1200 - 1000);
  });

  it("never counts a bump twice: a second bump inside the first's hold only stretches it to its own end", () => {
    startRun(run, "recess", false);
    step(run, arch.x, arch.z);
    holdLap(run, 1000);
    step(run, 0, 0, { dt: 500 });
    holdLap(run, 1000); // held to now + 1000, not 1000 more on top
    step(run, 0, 0, { dt: 2000 });
    expect(lapElapsed(run)).toBe(2500 - 1500);
    // The same bump heard twice in one frame is one hold.
    holdLap(run, 800);
    holdLap(run, 800);
    step(run, 0, 0, { dt: 1000 });
    expect(lapElapsed(run)).toBe(1000 + 200);
  });

  it("holds nothing before the arch, after a run, or for nothing; a new lap starts with no hold", () => {
    startRun(run, "recess", false);
    holdLap(run, 1000);
    expect(lapHeld(run)).toBe(false);
    step(run, arch.x, arch.z);
    holdLap(run, 0);
    holdLap(run, -5);
    holdLap(run, Number.NaN);
    expect(lapHeld(run)).toBe(false);
    holdLap(run, 5000);
    course.posts.forEach((_, i) => step(run, at(i).x, at(i).z, { dt: 4000 }));
    step(run, arch.x, arch.z, { dt: 4000 });
    // Recess goes on into the next lap, which owes the last one's bump nothing.
    expect(lapHeld(run)).toBe(false);
    expect(lapElapsed(run)).toBe(0);
    endRun(run);
    holdLap(run, 1000);
    expect(lapHeld(run)).toBe(false);
  });

  it("gives back what a bump costs at the child's pace: a shove and the walk back, never more than the dazzle", () => {
    // On foot at the island's 11: the 0.35 s shove and 7 units back at 11 a second.
    expect(bumpHoldMs(11)).toBe(986);
    // A fast mount walks it back sooner, so gets less back.
    expect(bumpHoldMs(22)).toBeLessThan(bumpHoldMs(11));
    // Standing still, or crawling: capped at the spec's dazzle.
    expect(bumpHoldMs(0)).toBe(1500);
    expect(bumpHoldMs(1)).toBe(1500);
  });

  it("fast travel voids the lap: recess starts again at the arch, a child's own run ends", () => {
    startRun(run, "recess", false);
    step(run, arch.x, arch.z);
    step(run, at(0).x, at(0).z);
    expect(step(run, at(1).x, at(1).z, { travelling: true }).map((e) => e.kind)).toEqual(["voided"]);
    expect(run.active).toBe(true);
    expect(run.nextPost).toBe(0);
    expect(lapElapsed(run)).toBeNull();
    // The next arch crossing starts a fresh lap; it never closes the voided one.
    expect(step(run, arch.x, arch.z).map((e) => e.kind)).toEqual(["started"]);

    const mine = makeRun(1);
    startRun(mine, "arch", false);
    step(mine, arch.x, arch.z);
    voidLap(mine);
    expect(mine.active).toBe(false);
  });

  it("travel before the arch voids nothing", () => {
    startRun(run, "recess", false);
    expect(step(run, 30, 30, { travelling: true })).toEqual([]);
    expect(run.active).toBe(true);
  });
});

describe("gleams", () => {
  it("fills twelve, or six at low stimulus, beside the Ring and never on a post or the arch", () => {
    startRun(run, "recess", false);
    spawnGleams(run, course, open);
    const live = run.gleams.filter((g) => g.live);
    expect(live).toHaveLength(GLEAM_COUNT);
    const probe = { x: 0, z: 0 };
    for (const g of live) {
      // Within reach of the path: the nearest sampled point is no further than the widest offset.
      let near = Infinity;
      for (let d = 0; d < course.lengthUnits; d += 0.5) {
        pointAt(course, d, probe);
        near = Math.min(near, Math.hypot(probe.x - g.x, probe.z - g.z));
      }
      expect(near).toBeLessThanOrEqual(GLEAM_OFF_MAX + 0.5);
      expect(Math.hypot(g.x - arch.x, g.z - arch.z)).toBeGreaterThan(ARCH_RADIUS);
      for (const p of course.posts) expect(Math.hypot(g.x - p.position.x, g.z - p.position.z)).toBeGreaterThan(POST_RADIUS);
    }
    const low = makeRun(7);
    startRun(low, "recess", true);
    spawnGleams(low, course, open);
    expect(low.gleams.filter((g) => g.live)).toHaveLength(GLEAM_COUNT_LOW);
  });

  it("is deterministic from the seed", () => {
    const a = makeRun(3);
    const b = makeRun(3);
    for (const r of [a, b]) {
      startRun(r, "recess", false);
      spawnGleams(r, course, open);
    }
    expect(a.gleams.map((g) => [g.x, g.z])).toEqual(b.gleams.map((g) => [g.x, g.z]));
  });

  it("never lands on ground the scene says is closed, and a dead slot tries fresh points next time", () => {
    startRun(run, "recess", false);
    spawnGleams(run, course, () => false);
    expect(run.gleams.some((g) => g.live)).toBe(false);
    expect(run.gleams.slice(0, GLEAM_COUNT).every((g) => g.spawns === 1)).toBe(true);
    spawnGleams(run, course, (x) => x > 0);
    for (const g of run.gleams.filter((q) => q.live)) expect(g.x).toBeGreaterThan(0);
  });

  it("is taken in reach, counted for the run, and its slot fills somewhere new ten seconds on", () => {
    startRun(run, "recess", false);
    spawnGleams(run, course, open);
    const g = run.gleams[0];
    const was = { x: g.x, z: g.z };
    expect(step(run, g.x + 1, g.z)).toEqual([{ kind: "gleam", n: 1, lapMs: 0, mounted: false }]);
    expect(g.live).toBe(false);
    spawnGleams(run, course, open);
    expect(g.live).toBe(false);
    step(run, 200, 200, { dt: GLEAM_RESPAWN_MS });
    spawnGleams(run, course, open);
    expect(g.live).toBe(true);
    expect([g.x, g.z]).not.toEqual([was.x, was.z]);
  });

  it("is not taken from a fast-travel ride", () => {
    startRun(run, "recess", false);
    spawnGleams(run, course, open);
    const g = run.gleams[0];
    expect(step(run, g.x, g.z, { travelling: true })).toEqual([]);
    expect(g.live).toBe(true);
  });
});

describe("the pace ghost", () => {
  const out: GhostSample = { x: 0, z: 0, progress: 0 };

  it("is absent before a best exists and after the best has finished", () => {
    expect(ghostAt(course, null, 1000, out)).toBe(false);
    expect(ghostAt(course, 40000, 40001, out)).toBe(false);
  });

  it("runs the best at an even pace: half-way at half the time", () => {
    expect(ghostAt(course, 40000, 20000, out)).toBe(true);
    expect(out.progress).toBeCloseTo(0.5);
    const mid = pointAt(course, course.lengthUnits / 2, { x: 0, z: 0 });
    expect(out.x).toBeCloseTo(mid.x);
    expect(out.z).toBeCloseTo(mid.z);
  });

  it("steps from mark to mark under reduced motion, never between them", () => {
    const marks = [course.arch, ...course.posts.map((p) => p.position)];
    for (let t = 0; t <= 40000; t += 1300) {
      expect(ghostStep(course, 40000, t, out)).toBe(true);
      expect(marks.some((m) => m.x === out.x && m.z === out.z)).toBe(true);
    }
  });

  it("says how far ahead or behind the hero is", () => {
    const ghostD = course.lengthUnits * 0.4;
    const ahead = pointAt(course, ghostD + 20, { x: 0, z: 0 });
    const behind = pointAt(course, ghostD - 20, { x: 0, z: 0 });
    const legOf = (d: number) => course.postAt.findIndex((x) => x >= d);
    expect(ghostGapMs(course, 40000, 16000, ahead, legOf(ghostD + 20))).toBeGreaterThan(0);
    expect(ghostGapMs(course, 40000, 16000, behind, legOf(ghostD - 20))).toBeLessThan(0);
    const same = pointAt(course, ghostD, { x: 0, z: 0 });
    expect(Math.abs(ghostGapMs(course, 40000, 16000, same, legOf(ghostD)))).toBeLessThan(5);
  });
});
