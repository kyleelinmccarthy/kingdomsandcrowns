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
}

export function jobKey(job: SynthJob): string {
  return job.kind === "sound" ? `${job.id}|${job.variant}|${job.calm ? 1 : 0}` : `phrase|${job.seed}`;
}

/** Does one job, wherever it runs. The worker calls exactly this. */
export function runJob(job: SynthJob, render: (id: SoundId, o: { calm: boolean; variant: number }) => SoundBuffer = renderSound): SoundBuffer {
  return job.kind === "sound" ? render(job.id, { calm: job.calm, variant: job.variant }) : renderPhrase(composePhrase(job.seed));
}

/**
 * The fallback: one job per idle moment, on this thread. Identical jobs asked for twice share one
 * render. Jobs asked for after `close` never resolve, and nothing is kept.
 */
export function idleSynth(timers: Timers, render?: (id: SoundId, o: { calm: boolean; variant: number }) => SoundBuffer): Synth {
  const queue: { job: SynthJob; key: string }[] = [];
  const waiting = new Map<string, { promise: Promise<SoundBuffer>; resolve: (b: SoundBuffer) => void }>();
  let scheduled = false;
  let closed = false;
  const pump = () => {
    if (scheduled || closed || queue.length === 0) return;
    scheduled = true;
    timers.idle(() => {
      scheduled = false;
      if (closed) return;
      const next = queue.shift();
      if (next) {
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
      queue.push({ job, key });
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
