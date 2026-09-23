import { describe, expect, it } from "vitest";
import type { Timers } from "./engine";
import { idleSynth, jobKey, runJob } from "./synth";

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
