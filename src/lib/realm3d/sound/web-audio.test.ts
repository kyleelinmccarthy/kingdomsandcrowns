import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AudioOut } from "./engine";
import { createWebAudioOut } from "./web-audio";

/**
 * A Web Audio stand-in: only what `web-audio.ts` touches, and every source's start and stop
 * written down, so a test can see which sounds overlap on which gain.
 */
type Src = { id: number; gain: FakeGain | null; startAt: number; stopAt: number; loop: boolean };
class FakeParam {
  value = 0;
  log: string[] = [];
  cancelScheduledValues(t: number) {
    this.log.push(`cancel@${t}`);
  }
  setValueAtTime(v: number, t: number) {
    this.log.push(`set ${v}@${t}`);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.log.push(`ramp ${v}@${t}`);
  }
  setTargetAtTime(v: number, t: number) {
    this.log.push(`target ${v}@${t}`);
  }
}
class FakeGain {
  gain = new FakeParam();
  connect() {}
}
let sources: Src[] = [];
class FakeCtx {
  currentTime = 0;
  state = "running";
  destination = {};
  createGain() {
    return new FakeGain();
  }
  createStereoPanner() {
    return { pan: new FakeParam(), connect() {} };
  }
  createWaveShaper() {
    return { curve: null, connect() {} };
  }
  createBuffer(_c: number, length: number, rate: number) {
    return { length, rate, copyToChannel() {} };
  }
  createBufferSource() {
    const s: Src = { id: sources.length, gain: null, startAt: Number.NaN, stopAt: Infinity, loop: false };
    sources.push(s);
    return {
      buffer: null,
      playbackRate: { value: 1 },
      set loop(v: boolean) {
        s.loop = v;
      },
      connect(g: FakeGain) {
        s.gain = g;
      },
      disconnect() {},
      onended: null,
      start(t: number) {
        s.startAt = t;
      },
      stop(t: number) {
        s.stopAt = Math.min(s.stopAt, t);
      },
    };
  }
  resume() {
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

let ctx: FakeCtx;
beforeEach(() => {
  sources = [];
  ctx = new FakeCtx();
  // `new AudioContext()` hands back the one context the test holds.
  (window as unknown as { AudioContext: unknown }).AudioContext = function () {
    return ctx;
  };
});
afterEach(() => {
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

const buf = (seconds = 1) => ({ data: new Float32Array(Math.round(seconds * 100)), rate: 100 });

/** Whether two sources ever sound at the same time on the same gain node. */
function overlapOnOneGain(): boolean {
  for (const a of sources)
    for (const b of sources) {
      if (a === b || a.gain !== b.gain || !a.gain) continue;
      if (a.startAt < b.startAt && a.stopAt > b.startAt) return true;
    }
  return false;
}

describe("the speakers", () => {
  it("a voice reused without stealing never leaves its old sound playing on the new sound's gain", () => {
    const out = createWebAudioOut() as AudioOut;
    out.play("sfx", 3, buf(1.5), 0, 1, 0, 1, false, 0);
    out.stop("sfx", 3, 0.3);
    // The engine hands the voice on; the backend must not let the charge ring on under it.
    ctx.currentTime = 0.35;
    out.play("sfx", 3, buf(0.3), 0.36, 0.8, 0, 1, false, 0);
    expect(overlapOnOneGain()).toBe(false);
  });

  it("a bed that cross-fades back within the fade plays once, not twice", () => {
    const out = createWebAudioOut() as AudioOut;
    const air = buf(8);
    const hall = buf(8);
    out.bed(0, air, 0.5, 2.5);
    ctx.currentTime = 1;
    out.bed(0, hall, 0.5, 2.5); // through a door
    ctx.currentTime = 1.5;
    out.bed(0, air, 0.5, 2.5); // and straight back out
    const live = sources.filter((s) => s.startAt <= 1.6 && s.stopAt > 1.6);
    // At most the fading hall and ONE air.
    const byGain = new Map<unknown, number>();
    for (const s of live) byGain.set(s.gain, (byGain.get(s.gain) ?? 0) + 1);
    for (const n of byGain.values()) expect(n).toBe(1);
    expect(overlapOnOneGain()).toBe(false);
  });
});
