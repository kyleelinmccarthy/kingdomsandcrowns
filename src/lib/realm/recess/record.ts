/**
 * THE RING'S RECORD: what a hero's recess adds up to, kept on the server (`realm_recess_record`).
 * The spec's "recess that counts" (`docs/superpowers/specs/2026-09-10-realm-recess-that-counts-
 * design.md` §3.2): lifetime gleams, laps run, and two bests — on foot and riding, always apart
 * (D12.6), so a Wyrm can never erase a six-year-old's foot time.
 *
 * NONE OF THIS IS CURRENCY (D12.1). Nothing here converts to Realm minutes; the economy has one
 * door. `recordRecessResult` writes this record and nothing else, and a test counts the ledger to
 * prove it.
 *
 * Pure: shared by the server action (which merges and validates) and the client (which shows the
 * merged answer at once and corrects it when the server's lands).
 */

export type RecessRecord = {
  totalGleams: number;
  laps: number;
  bestLapMs: number | null;
  bestMountedLapMs: number | null;
  lastLapAt: Date | null;
  courseId: string;
};

export type RecessResult = {
  gleams: number;
  lapMs: number | null;
  mounted: boolean;
  courseId: string;
};

export type MergeOutcome = {
  record: RecessRecord;
  /** This lap set a new best in its own category (a first lap is always one). */
  best: boolean;
  /** This lap is the first ever in its own category. */
  first: boolean;
  /** The course changed since the bests were set: they were cleared, the gleams kept. */
  reset: boolean;
};

/** Gleams a single call may carry: a flush is at most a few dozen; more is a broken client. */
export const MAX_GLEAMS_PER_CALL = 200;
/** A lap longer than ten minutes was not run; a child wandered off. It would poison the best for ever. */
export const MAX_LAP_MS = 600_000;
/** The jar on the board: full at a thousand gleams. Cosmetic, and never spent (D12.2). */
export const JAR_CAPACITY = 1000;

export function emptyRecessRecord(courseId: string): RecessRecord {
  return { totalGleams: 0, laps: 0, bestLapMs: null, bestMountedLapMs: null, lastLapAt: null, courseId };
}

/**
 * Adds a result to a record. Additive, never a replacement: gleams and laps only ever grow, and a
 * best is the smaller of the stored one and this lap, in its own category. A different course
 * clears both bests first (D12.12) — a time is a fact about a road — and keeps every gleam.
 */
export function mergeRecess(record: RecessRecord, result: RecessResult, now: Date): MergeOutcome {
  const reset = record.courseId !== result.courseId;
  const base: RecessRecord = reset ? { ...record, bestLapMs: null, bestMountedLapMs: null, courseId: result.courseId } : { ...record };
  base.totalGleams += Math.max(0, Math.floor(result.gleams));
  if (result.lapMs === null) return { record: base, best: false, first: false, reset };
  const lap = Math.round(result.lapMs);
  base.laps += 1;
  base.lastLapAt = now;
  const held = result.mounted ? base.bestMountedLapMs : base.bestLapMs;
  const first = held === null;
  const best = first || lap < held;
  if (best) {
    if (result.mounted) base.bestMountedLapMs = lap;
    else base.bestLapMs = lap;
  }
  return { record: base, best, first, reset };
}

export const LAP_TOO_FAST = "That lap was too fast to write down. Try it again.";
export const BAD_RESULT = "That run couldn't be written down.";

/**
 * Null when the result is one a child could have run; otherwise the words they see. `minLapMs`
 * is the course's own floor (`lib/realm3d/recess/course.ts`), rebuilt server-side.
 */
export function validateRecessResult(result: RecessResult, course: { id: string; minLapMs: number }): string | null {
  if (!result || typeof result !== "object") return BAD_RESULT;
  if (result.courseId !== course.id) return BAD_RESULT;
  if (typeof result.mounted !== "boolean") return BAD_RESULT;
  if (!Number.isInteger(result.gleams) || result.gleams < 0 || result.gleams > MAX_GLEAMS_PER_CALL) return BAD_RESULT;
  if (result.lapMs === null) return result.gleams > 0 ? null : BAD_RESULT;
  if (typeof result.lapMs !== "number" || !Number.isFinite(result.lapMs) || result.lapMs > MAX_LAP_MS) return BAD_RESULT;
  if (result.lapMs < course.minLapMs) return LAP_TOO_FAST;
  return null;
}

/**
 * Every this many lifetime gleams lights the next lamp on the road out of the village (D12.2).
 * Cosmetic: a lamp unlocks nothing, gates nothing, and is never spent.
 */
export const GLEAMS_PER_LAMP = 25;

/** How many of `lampCount` lamps a hero's lifetime gleams have lit, in road order. Clamps. */
export function lampsLitFor(totalGleams: number, lampCount: number): number {
  if (!Number.isFinite(totalGleams) || totalGleams <= 0) return 0;
  return Math.max(0, Math.min(lampCount, Math.floor(totalGleams / GLEAMS_PER_LAMP)));
}

/** 0..1: how full the gleam jar is. */
export function jarFillFor(totalGleams: number): number {
  return Math.max(0, Math.min(1, totalGleams / JAR_CAPACITY));
}

export function hasAnyRecord(record: RecessRecord | null): boolean {
  return !!record && (record.totalGleams > 0 || record.laps > 0);
}

/** The best to beat on this lap: the ridden one when riding, the foot one otherwise. */
export function bestFor(record: RecessRecord | null, mounted: boolean): number | null {
  if (!record) return null;
  return mounted ? record.bestMountedLapMs : record.bestLapMs;
}
