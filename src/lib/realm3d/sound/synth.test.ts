import { describe, expect, it } from "vitest";
import type { Timers } from "./engine";
import { idleSynth, jobCost, jobKey, MAX_DEFERS, runJob } from "./synth";

function idleTimers() {
  const q: ((b: number) => void)[] = [];
  const t: Timers & { run(): void; size(): number } = {
    set: () => 0,
    clear: () => {},
    idle: (fn) => void q.push(fn),
    run: () => {
      while (q.length) q.shift()!(50);
    },
    size: () => q.length,
  };
  return t;
}

describe("making sounds ahead of time", () => {
  it("names each job by what it makes", () => {
    expect(jobKey({ kind: "sound", id: "step-grass", calm: false, variant: 2 })).toBe("step-grass|2|0");
    expect(jobKey({ kind: "sound", id: "step-grass", calm: true, variant: 2 })).toBe("step-grass|2|1");
    expect(jobKey({ kind: "phrase", seed: 3 })).toBe("phrase|3");
  });

  it("does one job per idle moment, and asks for a job twice only once", async () => {
    const t = idleTimers();
    let made = 0;
    const synth = idleSynth(t, (id) => {
      made++;
      return { data: new Float32Array(4), rate: id.length };
    });
    const a = synth.render({ kind: "sound", id: "talk", calm: false, variant: 0 });
    const b = synth.render({ kind: "sound", id: "talk", calm: false, variant: 0 });
    const c = synth.render({ kind: "sound", id: "found", calm: false, variant: 0 });
    expect(made).toBe(0);
    expect(t.size()).toBe(1);
    t.run();
    expect(await a).toBe(await b);
    expect((await c).rate).toBe(5);
    expect(made).toBe(2);
  });

  it("drops everything on close", () => {
    const t = idleTimers();
    let made = 0;
    const synth = idleSynth(t, () => {
      made++;
      return { data: new Float32Array(1), rate: 1 };
    });
    void synth.render({ kind: "sound", id: "talk", calm: false, variant: 0 });
    synth.close();
    t.run();
    expect(made).toBe(0);
  });

  it("makes a phrase of music the same way the worker does", () => {
    const b = runJob({ kind: "phrase", seed: 1 });
    expect(b.data.length / b.rate).toBeGreaterThan(10);
  });
});

describe("the idle fallback respects the moment it is given", () => {
  function shortMoments(budget: number) {
    const q: ((b: number) => void)[] = [];
    return { idle: (fn: (b: number) => void) => void q.push(fn), set: () => 0, clear: () => {}, step: () => q.shift()?.(budget), size: () => q.length };
  }

  it("a heavy job waits for a long enough moment, and a cheap one behind it goes first", async () => {
    const t = shortMoments(12);
    const made: string[] = [];
    const synth = idleSynth(t, (id) => (made.push(id), { data: new Float32Array(1), rate: 1 }));
    void synth.render({ kind: "sound", id: "complete", calm: false, variant: 0 });
    void synth.render({ kind: "sound", id: "talk", calm: false, variant: 0 });
    t.step();
    expect(made).toEqual(["talk"]);
    expect(jobCost({ kind: "sound", id: "complete", calm: false, variant: 0 })).toBeGreaterThan(12);
    expect(jobCost({ kind: "phrase", seed: 1 })).toBeGreaterThan(jobCost({ kind: "sound", id: "complete", calm: false, variant: 0 }));
  });

  it("but never waits for ever on a page that is never idle", () => {
    const t = shortMoments(10);
    const made: string[] = [];
    const synth = idleSynth(t, (id) => (made.push(id), { data: new Float32Array(1), rate: 1 }));
    void synth.render({ kind: "sound", id: "bed-waves", calm: false, variant: 0 });
    for (let i = 0; i < MAX_DEFERS + 1 && t.size(); i++) t.step();
    expect(made).toEqual(["bed-waves"]);
  });
});

describe("a heavy job is passed over only a few times", () => {
  it("a bed is not stuck behind a long queue of cheap sounds", () => {
    const q: ((b: number) => void)[] = [];
    const t = { idle: (fn: (b: number) => void) => void q.push(fn), set: () => 0, clear: () => {} };
    const made: string[] = [];
    const synth = idleSynth(t, (id) => (made.push(id), { data: new Float32Array(1), rate: 1 }));
    void synth.render({ kind: "sound", id: "bed-air", calm: false, variant: 0 });
    for (let v = 0; v < 40; v++) void synth.render({ kind: "sound", id: "step-grass", calm: false, variant: v });
    for (let i = 0; i < MAX_DEFERS + 1; i++) q.shift()?.(10);
    expect(made).toContain("bed-air");
  });
});
