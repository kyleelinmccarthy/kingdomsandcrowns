import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRecessRecord, LAP_TOO_FAST, mergeRecess, type MergeOutcome, type RecessRecord, type RecessResult } from "@/lib/realm/recess/record";
import { WRITE_FAILED, WRITE_FAILED_AGAIN } from "@/lib/realm/recess/copy";
import { GLEAM_BATCH, makeRecessWriter, RETRY_FIRST_MS } from "./writer";

const course = { id: "island-ring-1", minLapMs: 14000 };
const timers = { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>) };

/** A server that merges like the real one, and can be told to fail. */
function server() {
  let record: RecessRecord = emptyRecessRecord(course.id);
  const calls: RecessResult[] = [];
  let failing = 0;
  const save = vi.fn(async (r: RecessResult): Promise<MergeOutcome> => {
    calls.push(r);
    if (failing > 0) {
      failing -= 1;
      throw new Error("offline");
    }
    const out = mergeRecess(record, r, new Date());
    record = out.record;
    return out;
  });
  return { save, calls, record: () => record, fail: (n: number) => (failing = n) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const s = server();
  const records: RecessRecord[] = [];
  const errors: string[] = [];
  const w = makeRecessWriter({ save: s.save, course, timers, onRecord: (r) => records.push(r), onError: (e) => errors.push(e) });
  return { s, w, records, errors };
}

describe("the Ring's writer", () => {
  it("buffers gleams and sends them ten at a time", async () => {
    const { s, w } = setup();
    w.addGleams(GLEAM_BATCH - 1);
    await vi.runAllTimersAsync();
    expect(s.calls).toEqual([]);
    w.addGleams(1);
    await vi.runAllTimersAsync();
    expect(s.calls).toEqual([{ gleams: 10, lapMs: null, mounted: false, courseId: course.id }]);
    expect(w.pending()).toEqual({ gleams: 0, laps: 0 });
  });

  it("writes a lap through at once, carrying the waiting gleams, and answers with the server's outcome", async () => {
    const { s, w, records } = setup();
    w.addGleams(3);
    const out = await w.addLap(36000, false);
    expect(s.calls).toEqual([{ gleams: 3, lapMs: 36000, mounted: false, courseId: course.id }]);
    expect(out).toMatchObject({ first: true, best: true });
    expect(records.at(-1)).toMatchObject({ totalGleams: 3, laps: 1, bestLapMs: 36000 });
  });

  it("flushes what is left on demand (hidden tab, leaving)", async () => {
    const { s, w } = setup();
    w.addGleams(4);
    await w.flush();
    expect(s.calls[0]).toMatchObject({ gleams: 4, lapMs: null });
    await w.flush();
    expect(s.calls).toHaveLength(1);
  });

  it("keeps everything when a write fails, says so, and tries again by itself", async () => {
    const { s, w, errors } = setup();
    s.fail(2);
    const lap = w.addLap(40000, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(errors.at(-1)).toBe(WRITE_FAILED);
    expect(w.pending()).toEqual({ gleams: 0, laps: 1 });
    await vi.advanceTimersByTimeAsync(RETRY_FIRST_MS);
    expect(errors.at(-1)).toBe(WRITE_FAILED_AGAIN);
    await vi.advanceTimersByTimeAsync(RETRY_FIRST_MS * 2);
    expect(await lap).toMatchObject({ first: true });
    expect(errors.at(-1)).toBe("");
    expect(s.record()).toMatchObject({ laps: 1, bestMountedLapMs: 40000, bestLapMs: null });
  });

  it("never sends an impossible lap: it is dropped with the child's words, and the gleams wait", async () => {
    const { s, w, errors } = setup();
    w.addGleams(2);
    expect(await w.addLap(course.minLapMs - 1, true)).toBeNull();
    expect(errors).toContain(LAP_TOO_FAST);
    expect(s.calls).toEqual([]);
    expect(w.pending()).toEqual({ gleams: 2, laps: 0 });
  });

  it("sends two laps finished close together one after the other, never together", async () => {
    const { s, w } = setup();
    const a = w.addLap(36000, false);
    const b = w.addLap(35000, false);
    const [oa, ob] = await Promise.all([a, b]);
    expect(s.calls.map((c) => c.lapMs)).toEqual([36000, 35000]);
    expect(oa).toMatchObject({ first: true });
    expect(ob).toMatchObject({ best: true, first: false });
  });

  it("stops retrying once disposed", async () => {
    const { s, w } = setup();
    s.fail(5);
    w.addGleams(10);
    await vi.advanceTimersByTimeAsync(0);
    w.dispose();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(s.calls).toHaveLength(1);
  });
});
