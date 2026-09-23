/**
 * The `Synth` the browser uses: a Web Worker running `synth.worker.ts`. Browser only. Null where
 * a worker cannot be made, and the engine falls back to rendering in idle moments instead.
 */

import type { SoundBuffer } from "./engine";
import { jobKey, type Synth } from "./synth";

export function workerSynth(): Synth | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL("./synth.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
  const waiting = new Map<string, { promise: Promise<SoundBuffer>; resolve: (b: SoundBuffer) => void; reject: (e: unknown) => void }>();
  let failed = false;
  worker.onmessage = (e: MessageEvent<{ key: string; data: Float32Array; rate: number }>) => {
    const w = waiting.get(e.data.key);
    waiting.delete(e.data.key);
    w?.resolve({ data: e.data.data, rate: e.data.rate });
  };
  worker.onerror = (e) => {
    // A worker that cannot load (a bundler that will not serve it) fails every job it holds;
    // the engine then renders those itself.
    failed = true;
    e.preventDefault?.();
    for (const w of waiting.values()) w.reject(new Error("synth worker failed"));
    waiting.clear();
  };
  return {
    render(job) {
      if (failed) return Promise.reject(new Error("synth worker failed"));
      const key = jobKey(job);
      const had = waiting.get(key);
      if (had) return had.promise;
      let resolve!: (b: SoundBuffer) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<SoundBuffer>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      waiting.set(key, { promise, resolve, reject });
      worker.postMessage({ key, job });
      return promise;
    },
    close() {
      waiting.clear();
      worker.terminate();
    },
  };
}
