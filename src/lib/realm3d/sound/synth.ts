/**
 * WHERE THE SOUNDS ARE MADE: off the main thread when the browser allows it.
 *
 * Synthesising a sound takes a few milliseconds, the finished building's fanfare nearer thirty
 * and a phrase of music over a hundred — each a dropped frame or several if it happened on the
 * game's thread at the moment it was wanted. So the engine never waits on synthesis: it asks a
 * `Synth` for buffers well ahead of time and keeps them. In the browser the `Synth` is a Web
 * Worker (`synth-client.ts`); where there is none (tests, an old browser) it is this file's
 * fallback, which does the same work a piece at a time in idle moments.
 */

import type { SoundBuffer, Timers } from "./engine";
import { composePhrase, renderPhrase } from "./music";
import { renderSound, type SoundId } from "./recipes";

export type SynthJob = { kind: "sound"; id: SoundId; calm: boolean; variant: number } | { kind: "phrase"; seed: number };

export interface Synth {
  render(job: SynthJob): Promise<SoundBuffer>;
  close(): void;
  /**
   * True when the work is done OFF the game's thread (a worker). Then nothing is ever rendered
   * on the game's thread at the moment it is wanted, and the effects are asked for ahead of the
   * heavy beds and phrase. Without it everything runs on this thread anyway, and a sound wanted
   * before it was made is made there and then, as it always was.
   */
  readonly offThread?: boolean;
}

export function jobKey(job: SynthJob): string {
  return job.kind === "sound" ? `${job.id}|${job.variant}|${job.calm ? 1 : 0}` : `phrase|${job.seed}`;
}

/** Does one job, wherever it runs. The worker calls exactly this. */
export function runJob(job: SynthJob, render: (id: SoundId, o: { calm: boolean; variant: number }) => SoundBuffer = renderSound): SoundBuffer {
  return job.kind === "sound" ? render(job.id, { calm: job.calm, variant: job.variant }) : renderPhrase(composePhrase(job.seed));
}

/**
 * Roughly how many milliseconds of an idle moment a job wants, on a slow machine. Most sounds are
 * a few; these are the ones that are not (the fanfare, the big chimes, the looping beds, and a
 * phrase of music above all), and running one in a short moment is a dropped frame.
 */
export function jobCost(job: SynthJob): number {
  if (job.kind === "phrase") return 45;
  const id = job.id;
  if (id.startsWith("bed-") || id === "complete" || id === "tutorial-done" || id === "fixture-bell" || id === "found" || id === "trouble-clear") return 25;
  return 0;
}

/** A heavy job passed over this many times runs anyway: a busy page still gets its sounds. */
export const MAX_DEFERS = 4;

/**
 * The fallback: one job per idle moment, on this thread. Identical jobs asked for twice share one
 * render. Jobs asked for after `close` never resolve, and nothing is kept.
 *
 * It respects the moment it is given: a heavy job (`jobCost`) waits for a moment long enough to
 * hold it, and a cheap one queued behind it goes first — but only a few times: a heavy job
 * passed over `MAX_DEFERS` times runs regardless, so a bed is never stuck behind the whole
 * warm-up, and nothing waits for ever on a page that is never idle.
 */
export function idleSynth(timers: Timers, render?: (id: SoundId, o: { calm: boolean; variant: number }) => SoundBuffer): Synth {
  const queue: { job: SynthJob; key: string; defers: number }[] = [];
  const waiting = new Map<string, { promise: Promise<SoundBuffer>; resolve: (b: SoundBuffer) => void }>();
  let scheduled = false;
  let closed = false;
  /** The first job this moment can hold; every heavy job passed over on the way counts it. */
  const pick = (budget: number): number => {
    for (let i = 0; i < queue.length; i++) {
      const q = queue[i];
      if (jobCost(q.job) <= budget || q.defers >= MAX_DEFERS) return i;
      q.defers++;
    }
    return -1;
  };
  const pump = () => {
    if (scheduled || closed || queue.length === 0) return;
    scheduled = true;
    timers.idle((budget) => {
      scheduled = false;
      if (closed) return;
      const i = pick(budget);
      if (i >= 0) {
        const next = queue.splice(i, 1)[0];
        const w = waiting.get(next.key);
        waiting.delete(next.key);
        w?.resolve(runJob(next.job, render));
      }
      pump();
    });
  };
  return {
    render(job) {
      const key = jobKey(job);
      const had = waiting.get(key);
      if (had) return had.promise;
      let resolve!: (b: SoundBuffer) => void;
      const promise = new Promise<SoundBuffer>((r) => (resolve = r));
      waiting.set(key, { promise, resolve });
      queue.push({ job, key, defers: 0 });
      pump();
      return promise;
    },
    close() {
      closed = true;
      queue.length = 0;
      waiting.clear();
    },
  };
}
