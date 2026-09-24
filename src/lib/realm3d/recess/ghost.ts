/**
 * THE PACE GHOST (spec D12.8): the child's stored best, run round the Ring at the even pace it
 * implies. Not a replay — nothing per frame is recorded — and never presented as one: the HUD calls
 * it "your best". Pure, and allocation-free: every answer is written into a caller's object.
 */

import { pointAt, progressAlong, type LapCourse, type Vec2 } from "./course";

export type GhostSample = { x: number; z: number; /** 0..1 round the lap. */ progress: number };

/** Where the best lap was at `elapsedMs`, or false before a best exists or once it has finished. */
export function ghostAt(course: LapCourse, bestLapMs: number | null, elapsedMs: number, out: GhostSample): boolean {
  if (bestLapMs === null || bestLapMs <= 0 || elapsedMs < 0 || elapsedMs > bestLapMs) return false;
  const f = elapsedMs / bestLapMs;
  pointAt(course, f * course.lengthUnits, out as Vec2);
  out.progress = f;
  return true;
}

/**
 * Reduced motion: the same ghost, held at the last mark it passed (the arch or a post) and
 * jumping to the next, so it steps instead of gliding. Never an in-between point.
 */
export function ghostStep(course: LapCourse, bestLapMs: number | null, elapsedMs: number, out: GhostSample): boolean {
  if (!ghostAt(course, bestLapMs, elapsedMs, out)) return false;
  const d = out.progress * course.lengthUnits;
  let mark: Vec2 = course.arch;
  let at = 0;
  for (let i = 0; i < course.posts.length; i++) {
    if (course.postAt[i] <= d) {
      mark = course.posts[i].position;
      at = course.postAt[i];
    }
  }
  out.x = mark.x;
  out.z = mark.z;
  out.progress = at / course.lengthUnits;
  return true;
}

/**
 * How far ahead of the ghost the hero is, in ms: positive ahead, negative behind. `nextPost` is
 * the run's, so the hero's progress is read on the leg they are really on.
 */
export function ghostGapMs(course: LapCourse, bestLapMs: number, elapsedMs: number, hero: Vec2, nextPost: number): number {
  const mine = progressAlong(course, hero, nextPost);
  const ghost = Math.min(1, Math.max(0, elapsedMs / bestLapMs));
  return Math.round((mine - ghost) * bestLapMs);
}
