import { describe, expect, it } from "vitest";
import {
  bestFor,
  emptyRecessRecord,
  hasAnyRecord,
  jarFillFor,
  JAR_CAPACITY,
  LAP_TOO_FAST,
  BAD_RESULT,
  MAX_GLEAMS_PER_CALL,
  MAX_LAP_MS,
  mergeRecess,
  validateRecessResult,
  type RecessRecord,
} from "./record";

const C = "island-ring-1";
const now = new Date("2026-09-24T10:00:00Z");
const empty = emptyRecessRecord(C);

describe("mergeRecess", () => {
  it("adds gleams and counts a lap only when there is one", () => {
    const a = mergeRecess(empty, { gleams: 4, lapMs: null, mounted: false, courseId: C }, now);
    expect(a.record).toMatchObject({ totalGleams: 4, laps: 0, bestLapMs: null, lastLapAt: null });
    expect(a).toMatchObject({ best: false, first: false, reset: false });
    const b = mergeRecess(a.record, { gleams: 2, lapMs: 40000, mounted: false, courseId: C }, now);
    expect(b.record).toMatchObject({ totalGleams: 6, laps: 1, bestLapMs: 40000, lastLapAt: now });
  });

  it("a first lap is a first (and so a best); a slower one is neither; a faster one is a best", () => {
    const first = mergeRecess(empty, { gleams: 0, lapMs: 40000, mounted: false, courseId: C }, now);
    expect(first).toMatchObject({ first: true, best: true });
    const slower = mergeRecess(first.record, { gleams: 0, lapMs: 42000, mounted: false, courseId: C }, now);
    expect(slower).toMatchObject({ first: false, best: false });
    expect(slower.record.bestLapMs).toBe(40000);
    const faster = mergeRecess(slower.record, { gleams: 0, lapMs: 38400, mounted: false, courseId: C }, now);
    expect(faster).toMatchObject({ first: false, best: true });
    expect(faster.record.bestLapMs).toBe(38400);
    expect(faster.record.laps).toBe(3);
  });

  it("keeps foot and riding apart: a ride never touches the foot best, nor a walk the ride best", () => {
    const foot = mergeRecess(empty, { gleams: 0, lapMs: 40000, mounted: false, courseId: C }, now).record;
    const ride = mergeRecess(foot, { gleams: 0, lapMs: 20000, mounted: true, courseId: C }, now);
    expect(ride.first).toBe(true);
    expect(ride.record).toMatchObject({ bestLapMs: 40000, bestMountedLapMs: 20000 });
    const walk = mergeRecess(ride.record, { gleams: 0, lapMs: 39000, mounted: false, courseId: C }, now);
    expect(walk.record).toMatchObject({ bestLapMs: 39000, bestMountedLapMs: 20000 });
  });

  it("a new course clears both bests, keeps the gleams and laps, and says so", () => {
    const old: RecessRecord = { totalGleams: 120, laps: 9, bestLapMs: 38000, bestMountedLapMs: 21000, lastLapAt: now, courseId: "old-ring" };
    const m = mergeRecess(old, { gleams: 3, lapMs: 45000, mounted: false, courseId: C }, now);
    expect(m.reset).toBe(true);
    expect(m.first).toBe(true);
    expect(m.record).toMatchObject({ totalGleams: 123, laps: 10, bestLapMs: 45000, bestMountedLapMs: null, courseId: C });
  });

  it("never changes the record it was given", () => {
    const copy = { ...empty };
    mergeRecess(empty, { gleams: 5, lapMs: 40000, mounted: false, courseId: C }, now);
    expect(empty).toEqual(copy);
  });
});

describe("validateRecessResult", () => {
  const course = { id: C, minLapMs: 14000 };
  it("accepts a real lap, and gleams alone", () => {
    expect(validateRecessResult({ gleams: 3, lapMs: 36000, mounted: false, courseId: C }, course)).toBeNull();
    expect(validateRecessResult({ gleams: 3, lapMs: null, mounted: false, courseId: C }, course)).toBeNull();
  });
  it("refuses a lap faster than the course allows, with the child's words", () => {
    expect(validateRecessResult({ gleams: 0, lapMs: 13999, mounted: true, courseId: C }, course)).toBe(LAP_TOO_FAST);
  });
  it("refuses a lap over ten minutes, gleams out of range, another course, and an empty call", () => {
    expect(validateRecessResult({ gleams: 0, lapMs: MAX_LAP_MS + 1, mounted: false, courseId: C }, course)).toBe(BAD_RESULT);
    expect(validateRecessResult({ gleams: -1, lapMs: null, mounted: false, courseId: C }, course)).toBe(BAD_RESULT);
    expect(validateRecessResult({ gleams: MAX_GLEAMS_PER_CALL + 1, lapMs: null, mounted: false, courseId: C }, course)).toBe(BAD_RESULT);
    expect(validateRecessResult({ gleams: 1.5, lapMs: null, mounted: false, courseId: C }, course)).toBe(BAD_RESULT);
    expect(validateRecessResult({ gleams: 1, lapMs: null, mounted: false, courseId: "elsewhere" }, course)).toBe(BAD_RESULT);
    expect(validateRecessResult({ gleams: 0, lapMs: null, mounted: false, courseId: C }, course)).toBe(BAD_RESULT);
    expect(validateRecessResult({ gleams: 0, lapMs: Number.NaN, mounted: false, courseId: C }, course)).toBe(BAD_RESULT);
  });
});

describe("the jar and the rest", () => {
  it("fills the jar from empty to full and no further", () => {
    expect(jarFillFor(0)).toBe(0);
    expect(jarFillFor(JAR_CAPACITY / 2)).toBe(0.5);
    expect(jarFillFor(JAR_CAPACITY * 3)).toBe(1);
  });
  it("knows an empty record from one with something in it, and which best to race", () => {
    expect(hasAnyRecord(null)).toBe(false);
    expect(hasAnyRecord(empty)).toBe(false);
    expect(hasAnyRecord({ ...empty, totalGleams: 1 })).toBe(true);
    const r = { ...empty, bestLapMs: 40000, bestMountedLapMs: 20000 };
    expect(bestFor(r, false)).toBe(40000);
    expect(bestFor(r, true)).toBe(20000);
    expect(bestFor(null, true)).toBeNull();
  });
});
