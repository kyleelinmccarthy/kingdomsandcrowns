/**
 * WRITING THE RING DOWN — the spec's write policy (§3.8), which is the whole answer to "a bounce-
 * out never loses a lap":
 *
 *   - a LAP writes through at once (there is at most one every twenty seconds, and it is the thing
 *     worth keeping), carrying every gleam waiting with it;
 *   - GLEAMS wait in a buffer and go when there are ten, with a lap, when the tab is hidden or the
 *     page goes, and when the Realm closes (`flush`);
 *   - a failed write keeps everything for the next try, and tries again by itself, backing off;
 *   - a result the server would refuse is checked here first, with the server's own rule, so a
 *     child hears "That lap was too fast to write down" rather than a failure that retries for ever.
 *
 * Honest bound on loss: a tab killed between flushes loses at most nine gleams and no lap that had
 * a moment to send. Pure, with the clock and the call injected, so the tests drive it.
 */

import { LAP_TOO_FAST, MAX_GLEAMS_PER_CALL, validateRecessResult, type MergeOutcome, type RecessRecord, type RecessResult } from "@/lib/realm/recess/record";
import { WRITE_FAILED, WRITE_FAILED_AGAIN } from "@/lib/realm/recess/copy";

/** Gleams are sent once this many are waiting. */
export const GLEAM_BATCH = 10;
/** The first retry after a failure, doubling each time up to the ceiling. */
export const RETRY_FIRST_MS = 2000;
export const RETRY_MAX_MS = 60_000;

export type WriterTimers = { set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void };

export type RecessWriter = {
  addGleams(n: number): void;
  /** Queues a lap and sends it now. Resolves with the server's answer once it is written, or null if it never can be. */
  addLap(lapMs: number, mounted: boolean): Promise<MergeOutcome | null>;
  flush(): Promise<void>;
  /** What is waiting to be written. */
  pending(): { gleams: number; laps: number };
  dispose(): void;
};

type QueuedLap = { lapMs: number; mounted: boolean; resolve: (o: MergeOutcome | null) => void };

export function makeRecessWriter(o: {
  save: (result: RecessResult) => Promise<MergeOutcome>;
  course: { id: string; minLapMs: number };
  timers: WriterTimers;
  /** The server's merged record, after every write. */
  onRecord: (record: RecessRecord) => void;
  /** The words for the error lane, or "" once a write goes through. */
  onError: (text: string) => void;
}): RecessWriter {
  let gleams = 0;
  const laps: QueuedLap[] = [];
  let sending = false;
  let again = false;
  let failures = 0;
  let retry: unknown = null;
  let disposed = false;

  const schedule = () => {
    if (disposed || retry !== null) return;
    const delay = Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** Math.max(0, failures - 1));
    retry = o.timers.set(() => {
      retry = null;
      void flush();
    }, delay);
  };

  async function flush(): Promise<void> {
    if (disposed && laps.length === 0 && gleams === 0) return;
    if (sending) {
      again = true;
      return;
    }
    if (gleams === 0 && laps.length === 0) return;
    if (retry !== null) {
      o.timers.clear(retry);
      retry = null;
    }
    sending = true;
    const lap = laps[0] ?? null;
    const g = Math.min(gleams, MAX_GLEAMS_PER_CALL);
    const result: RecessResult = { gleams: g, lapMs: lap ? lap.lapMs : null, mounted: lap ? lap.mounted : false, courseId: o.course.id };
    const refused = validateRecessResult(result, o.course);
    if (refused) {
      // Never sent: the server would refuse it the same way. The lap is dropped (with the child's
      // words if it was impossibly fast); the gleams are kept for the next write.
      if (lap) {
        laps.shift();
        lap.resolve(null);
        if (refused === LAP_TOO_FAST) o.onError(LAP_TOO_FAST);
      } else gleams = 0;
      sending = false;
      if (laps.length > 0 || again) {
        again = false;
        await flush();
      }
      return;
    }
    let ok = false;
    try {
      const out = await o.save(result);
      ok = true;
      gleams -= g;
      if (lap) {
        laps.shift();
        lap.resolve(out);
      }
      failures = 0;
      o.onError("");
      o.onRecord(out.record);
    } catch {
      failures += 1;
      o.onError(failures > 1 ? WRITE_FAILED_AGAIN : WRITE_FAILED);
      schedule();
    } finally {
      sending = false;
    }
    if (ok && (laps.length > 0 || again || gleams >= GLEAM_BATCH)) {
      again = false;
      await flush();
    } else again = false;
  }

  return {
    addGleams(n) {
      if (n <= 0) return;
      gleams += n;
      if (gleams >= GLEAM_BATCH) void flush();
    },
    addLap(lapMs, mounted) {
      return new Promise<MergeOutcome | null>((resolve) => {
        laps.push({ lapMs, mounted, resolve });
        void flush();
      });
    },
    flush,
    pending: () => ({ gleams, laps: laps.length }),
    dispose() {
      disposed = true;
      if (retry !== null) o.timers.clear(retry);
      retry = null;
    },
  };
}
