/**
 * A RUN OF THE RING, as a simulation: gleams to collect, and the lap from the arch round the eight
 * posts and home through the arch. The 3D port of `lib/realm/recess/recess.ts`, shaped by the
 * "recess that counts" spec (§3.4) where the two differ:
 *
 *   - the lap is timed on the scene's own clock, which does not run under a menu or indoors, less
 *     any time the frame hands back (`pauseLap`);
 *   - a lap ridden for ANY part is a ridden lap (D12.7): mounting mid-lap is a non-event, and the
 *     foot record cannot be gamed with it;
 *   - fast travel mid-lap voids it (D12.10): a teleport between places is not a lap;
 *   - the lap event carries no "best": whether a lap is a best is a fact about the stored record,
 *     decided by `mergeRecess` on the server and reported back;
 *   - a nudge, once a run, when the child reaches a post that is not the lit one.
 *
 * Two kinds of run (D12.3's two doors): `recess` — the grown-up's scheduled break, which runs for
 * as long as recess does, lap after lap — and `arch` — a child who asked for one at the arch, which
 * is one lap and done.
 *
 * Mutated in place, like `troubles3d.ts`: the scene steps it every frame and the frame loop must
 * not allocate. Events go into a small fixed ring the scene drains after each step.
 *
 * Pure: no three.js, no React, no clock. Deterministic: gleams are placed from a seed.
 */

import { seededRng } from "@/lib/utils/drill-generators";
import { ARCH_RADIUS, pointAt, POST_RADIUS, type LapCourse, type Vec2 } from "./course";

export const GLEAM_COUNT = 12;
/** Low stimulus: half as many, the flat Realm's rule. The record is kept in full ("mute, don't empty"). */
export const GLEAM_COUNT_LOW = 6;
/** How close the hero's middle must come to a gleam to take it. Wider than the flat Realm's 0.8: the island is run at 11. */
export const GLEAM_RADIUS = 1.5;
/** A taken gleam's slot fills again somewhere new after this long. */
export const GLEAM_RESPAWN_MS = 10_000;
/** Gleams lie beside the Ring, this far off its line either side: a step off the road, never on a post. */
export const GLEAM_OFF_MIN = 2.5;
export const GLEAM_OFF_MAX = 9;
/** How many places a slot tries before giving up for this frame (a fresh seed is tried next frame). */
const GLEAM_TRIES = 8;
const EVENT_CAP = 8;

export type RunKind = "recess" | "arch";

export type Gleam = { live: boolean; x: number; z: number; spawns: number; respawnAt: number };

export type RecessEventKind = "started" | "gleam" | "post" | "offCourse" | "lap" | "voided";
export type RecessEvent = {
  kind: RecessEventKind;
  /** `post`: the post passed (0-based). `gleam`: gleams this run. `lap`: laps this run. */
  n: number;
  /** `lap`: the time, less paused time. */
  lapMs: number;
  /** `lap`: ridden for any part of it. */
  mounted: boolean;
};

export type RecessRun = {
  active: boolean;
  kind: RunKind | null;
  /** The scene's clock, in ms. Advances only while the run is stepped. */
  now: number;
  seed: number;
  gleams: Gleam[];
  /** How many of `gleams` are in play this run (`GLEAM_COUNT` or `GLEAM_COUNT_LOW`). */
  slots: number;
  collected: number;
  laps: number;
  /** Null until the child runs through the arch; the lap clock starts there. */
  lapStartedAt: number | null;
  pausedMs: number;
  mountedThisLap: boolean;
  /** 0..posts.length: the post to reach next; `posts.length` means the arch is next. */
  nextPost: number;
  /** The off-course nudge has been said this run. */
  nudged: boolean;
  events: RecessEvent[];
  nEvents: number;
};

export function makeRun(seed = 1): RecessRun {
  return {
    active: false,
    kind: null,
    now: 0,
    seed,
    gleams: Array.from({ length: GLEAM_COUNT }, () => ({ live: false, x: 0, z: 0, spawns: 0, respawnAt: 0 })),
    slots: GLEAM_COUNT,
    collected: 0,
    laps: 0,
    lapStartedAt: null,
    pausedMs: 0,
    mountedThisLap: false,
    nextPost: 0,
    nudged: false,
    events: Array.from({ length: EVENT_CAP }, () => ({ kind: "gleam" as RecessEventKind, n: 0, lapMs: 0, mounted: false })),
    nEvents: 0,
  };
}

function push(run: RecessRun, kind: RecessEventKind, n = 0, lapMs = 0, mounted = false): void {
  if (run.nEvents >= EVENT_CAP) return;
  const e = run.events[run.nEvents++];
  e.kind = kind;
  e.n = n;
  e.lapMs = lapMs;
  e.mounted = mounted;
}

function resetLap(run: RecessRun): void {
  run.lapStartedAt = null;
  run.pausedMs = 0;
  run.mountedThisLap = false;
  run.nextPost = 0;
}

/**
 * Begins a run. Counts start again (they are this run's; the durable record lives on the server),
 * gleams fill from the first step. A run already going is left alone, whichever kind asked.
 */
export function startRun(run: RecessRun, kind: RunKind, lowStimulus: boolean): boolean {
  if (run.active) {
    // Recess arriving during a child's own run turns it into recess: it no longer ends at the arch.
    if (kind === "recess") run.kind = "recess";
    return false;
  }
  run.active = true;
  run.kind = kind;
  run.slots = lowStimulus ? GLEAM_COUNT_LOW : GLEAM_COUNT;
  run.collected = 0;
  run.laps = 0;
  run.nudged = false;
  for (const g of run.gleams) {
    g.live = false;
    g.respawnAt = 0;
  }
  resetLap(run);
  return true;
}

/** Ends the run: the gleams go, the running lap is dropped. What was collected stays counted. */
export function endRun(run: RecessRun): void {
  run.active = false;
  run.kind = null;
  for (const g of run.gleams) g.live = false;
  resetLap(run);
}

/** Time the game took from the child mid-lap (D12.9): subtracted from the lap. */
export function pauseLap(run: RecessRun, ms: number): void {
  if (run.active && run.lapStartedAt !== null && ms > 0) run.pausedMs += ms;
}

/** Fast travel mid-lap (D12.10): the lap cannot close. A child's own run ends; recess starts again at the arch. */
export function voidLap(run: RecessRun): void {
  if (!run.active || run.lapStartedAt === null) return;
  push(run, "voided");
  if (run.kind === "arch") endRun(run);
  else resetLap(run);
}

/** Whether (x, z) may hold a gleam: dry, open ground. The scene supplies it from its colliders and water. */
export type OpenGround = (x: number, z: number) => boolean;

const scratch: Vec2 = { x: 0, z: 0 };
const ahead: Vec2 = { x: 0, z: 0 };

function nearMark(course: LapCourse, x: number, z: number): boolean {
  const pad = POST_RADIUS + 0.5;
  if (Math.hypot(x - course.arch.x, z - course.arch.z) < ARCH_RADIUS + 0.5) return true;
  for (const p of course.posts) if (Math.hypot(x - p.position.x, z - p.position.z) < pad) return true;
  return false;
}

/**
 * Fills each empty slot whose time has come, beside the Ring: a random point along the path,
 * stepped off it to one side. Seeded per slot and per spawn, so a respawn lands somewhere new and
 * a test is stable. A slot that finds nowhere still counts the try, so next frame tries fresh
 * points rather than the same dead ones (the flat Realm's defence, kept).
 */
export function spawnGleams(run: RecessRun, course: LapCourse, open: OpenGround): void {
  if (!run.active) return;
  const L = course.lengthUnits;
  for (let slot = 0; slot < run.slots; slot++) {
    const g = run.gleams[slot];
    if (g.live || run.now < g.respawnAt) continue;
    const rng = seededRng((run.seed + slot * 7919 + g.spawns * 104729) >>> 0);
    g.spawns += 1;
    for (let t = 0; t < GLEAM_TRIES; t++) {
      const d = rng() * L;
      pointAt(course, d, scratch);
      pointAt(course, d + 0.5, ahead);
      let dx = ahead.x - scratch.x;
      let dz = ahead.z - scratch.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const side = rng() < 0.5 ? -1 : 1;
      const off = GLEAM_OFF_MIN + rng() * (GLEAM_OFF_MAX - GLEAM_OFF_MIN);
      // Perpendicular to the path: (-dz, dx).
      const x = scratch.x - dz * off * side;
      const z = scratch.z + dx * off * side;
      if (nearMark(course, x, z) || !open(x, z)) continue;
      g.live = true;
      g.x = x;
      g.z = z;
      break;
    }
  }
}

export type StepInput = {
  /** Milliseconds since the last step; the scene's own clamped frame time. */
  dt: number;
  x: number;
  z: number;
  /** In the saddle (or getting on or off) this frame. */
  mounted: boolean;
  /** A fast-travel ride is carrying the child. */
  travelling: boolean;
};

/**
 * One frame of a run: fast travel voids the lap; gleams in reach are taken (not from a fast-travel
 * ride — the child is not steering); the lap advances post to post and closes at the arch.
 * Events are appended to `run.events` (the caller resets `nEvents` after reading them).
 */
export function stepRun(run: RecessRun, course: LapCourse, input: StepInput): void {
  if (!run.active) return;
  run.now += input.dt;
  const { x, z } = input;

  if (input.travelling) {
    voidLap(run);
    return;
  }

  for (let slot = 0; slot < run.slots; slot++) {
    const g = run.gleams[slot];
    if (!g.live) continue;
    if (Math.hypot(g.x - x, g.z - z) <= GLEAM_RADIUS) {
      g.live = false;
      g.respawnAt = run.now + GLEAM_RESPAWN_MS;
      run.collected += 1;
      push(run, "gleam", run.collected);
    }
  }

  if (run.lapStartedAt === null) {
    // Not started: through the arch starts the clock, with post 1 lit.
    if (Math.hypot(x - course.arch.x, z - course.arch.z) <= ARCH_RADIUS) {
      run.lapStartedAt = run.now;
      run.pausedMs = 0;
      run.nextPost = 0;
      run.mountedThisLap = input.mounted;
      push(run, "started");
    }
    return;
  }

  if (input.mounted) run.mountedThisLap = true;
  const posts = course.posts;
  if (run.nextPost < posts.length) {
    const p = posts[run.nextPost].position;
    if (Math.hypot(x - p.x, z - p.z) <= POST_RADIUS) {
      push(run, "post", run.nextPost);
      run.nextPost += 1;
      return;
    }
    if (!run.nudged) {
      for (let i = run.nextPost + 1; i < posts.length; i++) {
        const q = posts[i].position;
        if (Math.hypot(x - q.x, z - q.z) <= POST_RADIUS) {
          run.nudged = true;
          push(run, "offCourse", i);
          break;
        }
      }
    }
    return;
  }

  if (Math.hypot(x - course.arch.x, z - course.arch.z) <= ARCH_RADIUS) {
    const lapMs = Math.max(0, run.now - run.lapStartedAt - run.pausedMs);
    run.laps += 1;
    push(run, "lap", run.laps, lapMs, run.mountedThisLap);
    if (run.kind === "arch") {
      endRun(run);
      return;
    }
    // Recess goes on: the next lap starts as this one ends, at the arch.
    run.lapStartedAt = run.now;
    run.pausedMs = 0;
    run.nextPost = 0;
    run.mountedThisLap = input.mounted;
  }
}

/** Hands each of the frame's events to `fn`, in order, then empties the ring. */
export function drainEvents(run: RecessRun, fn: (e: RecessEvent) => void): void {
  for (let i = 0; i < run.nEvents; i++) fn(run.events[i]);
  run.nEvents = 0;
}

/** The running lap's time so far, or null before the arch. */
export function lapElapsed(run: RecessRun): number | null {
  return run.active && run.lapStartedAt !== null ? Math.max(0, run.now - run.lapStartedAt - run.pausedMs) : null;
}
