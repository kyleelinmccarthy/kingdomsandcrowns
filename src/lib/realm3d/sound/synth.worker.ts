/**
 * The sound synthesiser's own thread. It receives jobs, renders them with exactly the same code
 * the tests run (`synth.ts` → `recipes.ts` / `music.ts`), and hands the samples back without
 * copying them (the buffer is transferred).
 */

import { runJob, type SynthJob } from "./synth";

type Msg = { key: string; job: SynthJob };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Msg>) => void) | null;
  postMessage(msg: unknown, transfer: Transferable[]): void;
};

scope.onmessage = (e) => {
  const { key, job } = e.data;
  const b = runJob(job);
  scope.postMessage({ key, data: b.data, rate: b.rate }, [b.data.buffer]);
};
