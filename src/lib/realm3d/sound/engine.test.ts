import { beforeEach, describe, expect, it } from "vitest";
import { CHARGE_PEAK, MOMENT_WAIT, onDemand, POOL_SIZES, SoundEngine, STOP_TAIL, WARM_ORDER, type AudioOut, type SoundBuffer, type Timers } from "./engine";
import type { SynthJob } from "./synth";
import { FIRST_MUSIC_S } from "./music";
import { cueInfo } from "./cues";
import { EFFECTS, type SoundId } from "./recipes";
import { DEFAULT_SOUND, type BusGains, type MixState } from "./settings";

/** The speakers, faked: every call written down, and a clock the test moves. */
class FakeOut implements AudioOut {
  t = 0;
  plays: { bus: string; index: number; id: number; at: number; gain: number; offset: number; stolen: boolean }[] = [];
  stops: { bus: string; index: number; at: number }[] = [];
  gainLog: BusGains[] = [];
  beds: { layer: number; buf: SoundBuffer | null; gain: number }[] = [];
  closed = false;
  suspended = false;
  now() {
    return this.t;
  }
  play(bus: string, index: number, buf: SoundBuffer, at: number, gain: number, _pan: number, _rate: number, stolen: boolean, offset: number) {
    this.plays.push({ bus, index, id: buf.rate, at, gain, offset, stolen });
  }
  stop(bus: string, index: number, at: number) {
    this.stops.push({ bus, index, at });
  }
  gains(g: BusGains) {
    this.gainLog.push(g);
  }
  bed(layer: number, buf: SoundBuffer | null, gain: number) {
    this.beds.push({ layer, buf, gain });
  }
  suspend(on: boolean) {
    this.suspended = on;
  }
  close() {
    this.closed = true;
  }
  get last(): BusGains {
    return this.gainLog[this.gainLog.length - 1];
  }
}

/** Timers the test runs by hand, idle work included. */
class FakeTimers implements Timers {
  private next = 1;
  pending = new Map<number, { fn: () => void; ms: number }>();
  idleQueue: ((budget: number) => void)[] = [];
  set(fn: () => void, ms: number) {
    const id = this.next++;
    this.pending.set(id, { fn, ms });
    return id;
  }
  clear(id: number) {
    this.pending.delete(id);
  }
  idle(fn: (budget: number) => void) {
    this.idleQueue.push(fn);
  }
  /** Fires the soonest timer. */
  fire(): number {
    let best = -1;
    let ms = Infinity;
    for (const [id, p] of this.pending) if (p.ms < ms) [best, ms] = [id, p.ms];
    const p = this.pending.get(best);
    this.pending.delete(best);
    p?.fn();
    return ms;
  }
  drainIdle(max = 10000) {
    for (let i = 0; i < max && this.idleQueue.length; i++) this.idleQueue.shift()!(50);
  }
}

// A tiny stand-in for the synthesiser, so the engine's rules are tested without its DSP. Each id
// gets its own sample rate as a fingerprint, so a test can tell which sound was played.
const ids = new Map<string, number>();
function fakeRender(id: SoundId): SoundBuffer {
  if (!ids.has(id)) ids.set(id, 1000 + ids.size);
  const rate = ids.get(id)!;
  const seconds = id.startsWith("bed-") ? 8 : id.startsWith("charge-") ? 1.45 : id === "complete" ? 3 : 0.5;
  return { data: new Float32Array(Math.round(rate * seconds)), rate };
}
const fp = (id: SoundId) => {
  fakeRender(id);
  return ids.get(id)!;
};

/** Lets the synth's idle work run and its promises settle. */
async function settle() {
  for (let i = 0; i < 5; i++) {
    timers.drainIdle();
    await Promise.resolve();
    await Promise.resolve();
  }
}

const mix = (o: Partial<MixState> = {}): MixState => ({ settings: DEFAULT_SOUND, enabled: true, calm: false, paused: false, speaking: false, ...o });

let out: FakeOut;
let timers: FakeTimers;
function engine(o: Partial<MixState> = {}) {
  out = new FakeOut();
  timers = new FakeTimers();
  return new SoundEngine(mix(o), timers, fakeRender);
}

beforeEach(() => ids.clear());

describe("before the first key press", () => {
  it("plays nothing and makes nothing: there is no audio until a gesture", () => {
    const e = engine();
    expect(e.play("talk")).toBe(-1);
    e.cast("ember", 300);
    e.step("grass");
    expect(e.attached).toBe(false);
    expect(timers.pending.size).toBe(0);
  });
});

describe("attached", () => {
  it("sets the mix, starts the country's beds, and waits a while before any music", async () => {
    const e = engine();
    e.setZone("shore");
    e.attach(out);
    await settle();
    expect(out.gainLog).toHaveLength(1);
    expect(out.beds.map((b) => b.layer)).toEqual([0, 1]);
    expect(out.beds[0].buf!.rate).toBe(fp("bed-waves"));
    const musicTimer = [...timers.pending.values()].find((p) => p.ms === FIRST_MUSIC_S * 1000);
    expect(musicTimer).toBeDefined();
  });

  it("plays a sound on a pooled voice, and drops a repeat inside its gap", async () => {
    const e = engine();
    e.attach(out);
    await settle();
    expect(e.play("talk")).toBeGreaterThanOrEqual(0);
    expect(e.play("talk")).toBe(-1);
    out.t = 1;
    expect(e.play("talk")).toBeGreaterThanOrEqual(0);
    expect(out.plays).toHaveLength(2);
  });

  it("never has more voices sounding than the pool holds, however hard it is pushed", () => {
    const e = engine();
    e.attach(out);
    for (let i = 0; i < 400; i++) {
      out.t = i * 0.02;
      e.step("grass");
      e.play("trouble-hit");
      e.play("ui-click");
      expect(e.busy().sfx).toBeLessThanOrEqual(POOL_SIZES.sfx);
    }
  });

  it("does not let a storm of lesser sounds cut off a building finishing", async () => {
    const e = engine();
    e.attach(out);
    await settle();
    e.play("complete");
    const completeVoice = out.plays[0].index;
    // Everything less important than a finished building, all at once, over and over: enough to
    // fill every voice several times.
    const lesser = EFFECTS.filter((id) => cueInfo(id).priority < cueInfo("complete").priority);
    for (let i = 0; i < 12; i++) {
      out.t = 0.01 + i * 0.2;
      for (const id of lesser) e.play(id);
      expect(e.busy().sfx).toBe(POOL_SIZES.sfx);
    }
    const stolen = out.plays.filter((p) => p.stolen).length;
    expect(stolen).toBeGreaterThan(0);
    expect(out.plays.filter((p) => p.index === completeVoice && p.bus === "sfx" && p.stolen)).toHaveLength(0);
    expect(e.playing("complete")).toBe(1);
  });

  it("casts: the element's charge for the cast time, from near its peak, then its release", async () => {
    const e = engine();
    e.attach(out);
    await settle();
    e.cast("frost", 300);
    const [charge, release] = out.plays;
    expect(charge.id).toBe(fp("charge-frost"));
    expect(charge.offset).toBeCloseTo(CHARGE_PEAK - 0.3);
    expect(release.id).toBe(fp("release-frost"));
    expect(release.at - charge.at).toBeCloseTo(0.3);
    expect(out.stops).toHaveLength(1);
    expect(out.stops[0].at).toBeCloseTo(charge.at + 0.3);
  });

  it("gives a slow spell all of its charge", async () => {
    const e = engine();
    e.attach(out);
    await settle();
    e.cast("stone", 900);
    expect(out.plays[0].offset).toBe(0);
  });
});

describe("the mix follows the game", () => {
  it("ducks the music when paused and brings it back after", () => {
    const e = engine();
    e.attach(out);
    const playing = out.last.music;
    e.setMix({ paused: true });
    expect(out.last.music).toBeLessThan(playing);
    e.setMix({ paused: false });
    expect(out.last.music).toBeCloseTo(playing);
  });

  it("ducks under read-aloud", () => {
    const e = engine();
    e.attach(out);
    const before = out.last;
    e.setMix({ speaking: true });
    expect(out.last.music).toBeLessThan(before.music * 0.5);
    expect(out.last.sfx).toBeLessThan(before.sfx);
  });

  it("goes silent on mute, and a grown-up's switch is a hard off", () => {
    const e = engine();
    e.attach(out);
    e.setMix({ settings: { ...DEFAULT_SOUND, muted: true } });
    expect(out.last).toEqual({ master: 0, sfx: 0, amb: 0, music: 0 });
    const off = engine({ enabled: false });
    off.attach(out);
    expect(out.last.master).toBe(0);
  });

  it("stops the music in calm mode, and waits for none", () => {
    const e = engine({ calm: true });
    e.attach(out);
    expect([...timers.pending.values()].some((p) => p.ms === FIRST_MUSIC_S * 1000)).toBe(false);
    expect(out.last.music).toBe(0);
  });

  it("renders calm mode's own, softer takes", () => {
    const seen: boolean[] = [];
    const e = new SoundEngine(mix({ calm: true }), new FakeTimers(), (id, o) => {
      seen.push(o.calm);
      return fakeRender(id);
    });
    e.attach(new FakeOut());
    e.play("found");
    expect(seen.every((c) => c)).toBe(true);
  });
});

describe("the soundscape", () => {
  it("cross-fades to a new country's beds, and indoors has one bed only", async () => {
    const e = engine();
    e.setZone("village");
    e.attach(out);
    await settle();
    out.beds = [];
    e.setZone("wood");
    await settle();
    expect(out.beds.find((b) => b.layer === 0)!.buf!.rate).toBe(fp("bed-leaves"));
    out.beds = [];
    e.setZone("indoors");
    await settle();
    expect(out.beds.find((b) => b.layer === 0)!.buf!.rate).toBe(fp("bed-room"));
    expect(out.beds.find((b) => b.layer === 1)!.buf).toBeNull();
    // The same country again does nothing.
    out.beds = [];
    e.setZone("indoors");
    expect(out.beds).toHaveLength(0);
  });

  it("brings a little sound now and then on the ambience's own voices, and keeps doing so", async () => {
    const e = engine();
    e.setZone("meadow");
    e.attach(out);
    await settle();
    const before = out.plays.length;
    // Fire the detail timer (the soonest one; the music's is 18 s away).
    const ms = timers.fire();
    expect(ms).toBeGreaterThanOrEqual(5000);
    expect(ms).toBeLessThanOrEqual(13000);
    expect(out.plays.length).toBe(before + 1);
    expect(out.plays[out.plays.length - 1].bus).toBe("amb");
    expect([...timers.pending.values()].some((p) => p.ms < FIRST_MUSIC_S * 1000)).toBe(true);
  });
});

describe("the music", () => {
  it("prepares its phrase ahead of time, plays it once, then leaves a long quiet", async () => {
    const e = engine();
    e.setZone("village");
    e.attach(out);
    await settle();
    // Clear the detail timer out of the way, then fire the music's.
    for (const [id, p] of timers.pending) if (p.ms !== FIRST_MUSIC_S * 1000) timers.clear(id);
    timers.fire();
    const music = out.plays.filter((p) => p.bus === "music");
    expect(music).toHaveLength(1);
    const next = [...timers.pending.values()].map((p) => p.ms / 1000).filter((s) => s > 30);
    expect(next.length).toBe(1);
    expect(next[0]).toBeGreaterThan(38);
  });

  it("is stopped when its slider goes to zero", () => {
    const e = engine();
    e.attach(out);
    e.setMix({ settings: { ...DEFAULT_SOUND, music: 0 } });
    expect([...timers.pending.values()].some((p) => p.ms === FIRST_MUSIC_S * 1000)).toBe(false);
  });
});

describe("leaving", () => {
  it("stops everything, cancels every timer, and plays nothing after", () => {
    const e = engine();
    e.setZone("village");
    e.attach(out);
    e.close();
    expect(out.closed).toBe(true);
    expect(timers.pending.size).toBe(0);
    expect(e.play("talk")).toBe(-1);
  });

  it("goes quiet in a hidden tab", () => {
    const e = engine();
    e.attach(out);
    e.hidden(true);
    expect(out.suspended).toBe(true);
    e.hidden(false);
    expect(out.suspended).toBe(false);
  });
});

describe("the warm-up", () => {
  it("synthesises every effect ahead of time in idle moments", () => {
    const rendered = new Set<string>();
    const t = new FakeTimers();
    const e = new SoundEngine(mix(), t, (id, o) => {
      rendered.add(id);
      return fakeRender(id as SoundId) ?? o;
    });
    e.attach(new FakeOut());
    t.drainIdle();
    for (const id of ["step-grass", "complete", "release-storm", "fixture-bell", "found"]) expect(rendered.has(id)).toBe(true);
  });
});

describe("review fixes: nothing heavy on the game's thread, nothing stale, nothing left open", () => {
  it("a voice a charge was cut on is not handed on until the backend has really stopped it", async () => {
    const e = engine();
    e.attach(out);
    await settle();
    e.cast("ember", 300);
    const charge = out.plays[0];
    const stopAt = out.stops[0].at;
    // Just after the stop call's time, but before its tail is done: a burst of footsteps.
    out.t = stopAt + STOP_TAIL * 0.6;
    for (let i = 0; i < 6; i++) {
      out.t += 0.001;
      e.play("ui-click");
      e.step("grass");
    }
    const reused = out.plays.slice(2).filter((p) => p.bus === "sfx" && p.index === charge.index && !p.stolen && p.at < stopAt + STOP_TAIL);
    expect(reused).toEqual([]);
  });

  it("with a worker, asks for the effects before the beds and the phrase", () => {
    const asked: string[] = [];
    const t = new FakeTimers();
    const synth = { offThread: true, render: (job: SynthJob) => (asked.push(job.kind === "sound" ? job.id : "phrase"), new Promise<SoundBuffer>(() => {})), close() {} };
    const e = new SoundEngine(mix(), t, fakeRender, synth);
    e.setZone("shore");
    e.attach(new FakeOut());
    expect(asked[0]).toBe(WARM_ORDER[0]);
    const firstBed = asked.findIndex((id) => id.startsWith("bed-"));
    const phrase = asked.indexOf("phrase");
    expect(firstBed).toBeGreaterThan(asked.indexOf("trouble-clear"));
    expect(phrase).toBeGreaterThan(asked.indexOf("trouble-clear"));
  });

  it("with a worker, never renders a sound on the game's thread at the moment it is wanted", async () => {
    let inline = 0;
    const t = new FakeTimers();
    const o = new FakeOut();
    // A worker that has not got to anything yet.
    const synth = { offThread: true, render: () => new Promise<SoundBuffer>(() => {}), close() {} };
    const e = new SoundEngine(mix(), t, (id) => (inline++, fakeRender(id)), synth);
    e.attach(o);
    expect(e.play("complete")).toBe(-1);
    e.cast("ember", 300);
    expect(inline).toBe(0);
    expect(o.plays).toHaveLength(0);
  });

  it("plays a ready sibling take rather than wait for the one it would have picked", async () => {
    const e = engine();
    e.attach(out);
    await settle();
    // Every take of a footstep is ready after the warm-up; they rotate.
    out.t = 0;
    e.step("grass");
    out.t = 1;
    e.step("grass");
    expect(out.plays).toHaveLength(2);
  });

  it("a synth that fails hands its work to this thread's idle fallback, beds and music included", async () => {
    const e = new SoundEngine(mix(), (timers = new FakeTimers()), fakeRender, { offThread: true, render: () => Promise.reject(new Error("worker threw")), close() {} });
    out = new FakeOut();
    e.setZone("shore");
    e.attach(out);
    for (let i = 0; i < 6; i++) await settle();
    expect(e.ready("trouble-clear")).toBe(true);
    expect(out.beds.filter((b) => b.buf).length).toBeGreaterThan(0);
    expect(e.ready("trouble-clear")).toBe(true);
    // The phrase is ready by the time its timer fires.
    [...timers.pending.values()].find((p) => p.ms === FIRST_MUSIC_S * 1000)!.fn();
    expect(out.plays.some((p) => p.bus === "music")).toBe(true);
  });

  it("a hidden tab queues nothing: its timers stop, and start once on return", () => {
    const e = engine();
    e.setZone("meadow");
    e.attach(out);
    expect(timers.pending.size).toBe(2);
    e.hidden(true);
    expect(timers.pending.size).toBe(0);
    e.hidden(true);
    e.hidden(false);
    expect(timers.pending.size).toBe(2);
    e.hidden(false);
    expect(timers.pending.size).toBe(2);
  });

  it("a gesture after the engine is finished opens no audio device", () => {
    const e = engine();
    e.close();
    let made = 0;
    expect(e.attachWith(() => (made++, new FakeOut()))).toBe(false);
    expect(made).toBe(0);
    expect(e.finished).toBe(true);
    const f = engine();
    expect(f.attachWith(() => (made++, out))).toBe(true);
    expect(f.attachWith(() => (made++, new FakeOut()))).toBe(false);
    expect(made).toBe(1);
  });
});

describe("is the device running", () => {
  it("only once attached, and as the output says", () => {
    const e = engine();
    expect(e.running).toBe(false);
    let state = false;
    (out as FakeOut & { running?: () => boolean }).running = () => state;
    e.attach(out);
    expect(e.running).toBe(false);
    state = true;
    expect(e.running).toBe(true);
    e.close();
    expect(e.running).toBe(false);
  });
});

describe("riding, the crown and the clock", () => {
  /** A worker that answers only when the test says so. */
  function heldWorker() {
    const asked: string[] = [];
    const held = new Map<string, (b: SoundBuffer) => void>();
    const synth = {
      offThread: true,
      render: (job: SynthJob) => {
        const id = job.kind === "sound" ? job.id : "phrase";
        asked.push(id);
        return new Promise<SoundBuffer>((res) => held.set(id, res));
      },
      close() {},
    };
    const answer = (id: SoundId) => held.get(id)?.(fakeRender(id));
    return { asked, synth, answer };
  }

  it("leaves one visit's sounds out of the usual warm-up, and makes them when the game wants them", () => {
    expect(WARM_ORDER.filter(onDemand)).toEqual([]);
    expect(onDemand("hoof-road")).toBe(true);
    expect(onDemand("crown")).toBe(true);
    expect(onDemand("step-road")).toBe(false);
    const w = heldWorker();
    const e = new SoundEngine(mix(), new FakeTimers(), fakeRender, w.synth);
    e.want(["crown"], true);
    e.want(["hoof-road", "call-whinny"]);
    e.attach(new FakeOut());
    // The crown before everything; the mount's after the usual.
    expect(w.asked[0]).toBe("crown");
    expect(w.asked.indexOf("hoof-road")).toBeGreaterThan(w.asked.indexOf("complete"));
    // Wanted after the warm-up: asked for at once.
    e.want(["farewell"]);
    expect(w.asked).toContain("farewell");
  });

  it("plays a big moment when its sound arrives, if it arrives in time, and never on the game's thread", async () => {
    let inline = 0;
    const w = heldWorker();
    const o = new FakeOut();
    const e = new SoundEngine(mix(), new FakeTimers(), (id) => (inline++, fakeRender(id)), w.synth);
    e.attach(o);
    e.moment("crown");
    expect(o.plays).toHaveLength(0);
    w.answer("crown");
    await Promise.resolve();
    await Promise.resolve();
    expect(o.plays.map((p) => p.id)).toEqual([fp("crown")]);
    // Too late: a moment that could not be made in time is let go rather than played out of place.
    e.moment("last-minute");
    o.t = MOMENT_WAIT + 1;
    w.answer("last-minute");
    await Promise.resolve();
    await Promise.resolve();
    expect(o.plays).toHaveLength(1);
    expect(inline).toBe(0);
  });

  it("steps the music back under a ducked moment, and brings it back after", async () => {
    const e = engine();
    e.attach(out);
    await settle();
    const music = out.last.music;
    e.moment("crown", { duck: true });
    expect(out.plays.at(-1)!.id).toBe(fp("crown"));
    expect(out.last.music).toBeLessThan(music * 0.1);
    // Two at once hold it back together.
    e.moment("last-minute", { duck: true });
    const back = [...timers.pending.entries()].filter(([, p]) => p.ms < 5000 && p.ms > 500);
    expect(back.length).toBe(2);
    timers.pending.delete(back[0][0]);
    back[0][1].fn();
    expect(out.last.music).toBeLessThan(music * 0.1);
    timers.pending.delete(back[1][0]);
    back[1][1].fn();
    expect(out.last.music).toBeCloseTo(music);
  });

  it("says goodbye: stops the music and the country, plays the cadence, then closes itself", async () => {
    const e = engine();
    e.setZone("meadow");
    e.attach(out);
    await settle();
    e.farewell();
    expect(out.plays.at(-1)!.id).toBe(fp("farewell"));
    expect(out.beds.slice(-2).every((b) => b.buf === null)).toBe(true);
    expect(out.last.music).toBeLessThan(0.05);
    expect(e.finished).toBe(false);
    while (timers.pending.size) timers.fire();
    expect(e.finished).toBe(true);
    expect(out.closed).toBe(true);
  });

  it("says goodbye by simply stopping when there is nothing to hear it on", () => {
    const e = engine();
    e.farewell();
    expect(e.finished).toBe(true);
  });

  it("plays a mount's footfall at the mount's own pitch", async () => {
    const e = engine();
    e.want(["gallop-hoof-road"]);
    e.attach(out);
    await settle();
    e.footfall("gallop-hoof-road", 1.2);
    expect(out.plays.at(-1)!.id).toBe(fp("gallop-hoof-road"));
  });
});
