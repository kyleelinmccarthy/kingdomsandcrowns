/**
 * THE SPEAKERS: `AudioOut` over the Web Audio API. Browser only; everything it decides was
 * decided in `engine.ts`, which is where the tests are.
 *
 * The graph is built once, when the context is:
 *
 *   voice (gain → panner) ×14 ─┐
 *                              ├→ sfx bus ─┐
 *   ambience voices ×4 ────────┼→ amb bus ─┼→ master → a soft limiter → speakers
 *   bed layers ×2 ─────────────┘           │
 *   music voices ×2 ──────────→ music bus ─┘
 *
 * The one node that is made per sound is the `AudioBufferSourceNode`, because the API allows a
 * source to be started exactly once — that is how Web Audio is meant to be used, it is cheap,
 * and it is made on an event (a footfall, a spell), never on a frame. The gains and panners
 * that carry it are the pool, and live for the whole visit. `AudioBuffer`s are made once per
 * sound and kept.
 */

import type { Bus } from "./cues";
import type { AudioOut, SoundBuffer } from "./engine";
import { POOL_SIZES, BED_LAYERS } from "./engine";
import type { BusGains } from "./settings";

type Voice = { gain: GainNode; pan: StereoPannerNode; src: AudioBufferSourceNode | null };
type Layer = { gain: GainNode; pan: StereoPannerNode; src: AudioBufferSourceNode | null; buf: SoundBuffer | null };

type Ctor = typeof AudioContext;

/**
 * The limiter's curve, over an input range of ±2 (the signal is halved on the way in): linear to
 * 0.6, then bending smoothly towards 1, so a pile-up is rounded off instead of clipped.
 */
export function softClipCurve(points = 2049): Float32Array<ArrayBuffer> {
  const c = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = ((i / (points - 1)) * 2 - 1) * 2;
    const a = Math.abs(x);
    const y = a <= 0.6 ? a : 0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

/** The browser's AudioContext, or null where there is none (a test, an old browser). */
export function audioContextCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Makes the context and the whole graph. Call it from inside a real key press or click: that is
 * the only time a browser lets audio start. Null when there is no Web Audio, or it refuses.
 */
export function createWebAudioOut(): AudioOut | null {
  const C = audioContextCtor();
  if (!C) return null;
  let ctx: AudioContext;
  try {
    ctx = new C({ latencyHint: "interactive" });
  } catch {
    return null;
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  try {
    return buildOut(ctx);
  } catch {
    // Any part of the graph the browser will not make: no sound, and no error the child sees.
    void ctx.close().catch(() => {});
    return null;
  }
}

function buildOut(ctx: AudioContext): AudioOut {

  // The limiter is a static soft-clip curve rather than a DynamicsCompressor: it is exactly
  // transparent below 0.6 (where everything sits at sane settings), adds no latency, and has
  // none of the compressor's automatic make-up gain, which would move every level in the mix.
  const limiter = ctx.createWaveShaper();
  limiter.curve = softClipCurve();
  const headroom = ctx.createGain();
  headroom.gain.value = 0.5;
  headroom.connect(limiter);
  limiter.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(headroom);

  const buses: Record<Bus, GainNode> = { sfx: ctx.createGain(), amb: ctx.createGain(), music: ctx.createGain() };
  for (const b of Object.values(buses)) b.connect(master);

  const makeVoice = (to: AudioNode): Voice => {
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    gain.gain.value = 0;
    gain.connect(pan);
    pan.connect(to);
    return { gain, pan, src: null };
  };
  const voices: Record<Bus, Voice[]> = {
    sfx: Array.from({ length: POOL_SIZES.sfx }, () => makeVoice(buses.sfx)),
    amb: Array.from({ length: POOL_SIZES.amb }, () => makeVoice(buses.amb)),
    music: Array.from({ length: POOL_SIZES.music }, () => makeVoice(buses.music)),
  };
  // Two layers each with two slots (A and B), so a bed can cross-fade into the next.
  const layers: Layer[][] = Array.from({ length: BED_LAYERS }, (_, i) =>
    [0, 1].map(() => {
      const v = makeVoice(buses.amb);
      // The two beds sit a little apart, so the air has some width to it.
      v.pan.pan.value = i === 0 ? -0.25 : 0.25;
      return { ...v, buf: null };
    }),
  );
  const front = new Array<number>(BED_LAYERS).fill(0);

  const buffers = new WeakMap<Float32Array, AudioBuffer>();
  const toBuffer = (b: SoundBuffer): AudioBuffer => {
    let ab = buffers.get(b.data);
    if (!ab) {
      ab = ctx.createBuffer(1, b.data.length, b.rate);
      ab.copyToChannel(b.data as Float32Array<ArrayBuffer>, 0);
      buffers.set(b.data, ab);
    }
    return ab;
  };

  const retire = (src: AudioBufferSourceNode | null, at: number) => {
    if (!src) return;
    try {
      src.stop(at);
    } catch {
      /* already stopped */
    }
  };

  let closed = false;

  return {
    now: () => ctx.currentTime,

    play(bus, index, buf, at, gain, pan, rate, stolen, offset) {
      const v = voices[bus][index];
      if (!v || closed) return;
      const t = Math.max(at, ctx.currentTime);
      const g = v.gain.gain;
      g.cancelScheduledValues(t - (stolen ? 0.03 : 0));
      if (v.src) {
        // The old sound on this voice fades out over the lead-in the engine left for it, when
        // it was stolen; either way it is stopped as the new one starts, so nothing that was
        // still in its tail ever sounds on the new sound's gain.
        if (stolen) g.setTargetAtTime(0, t - 0.03, 0.008);
        retire(v.src, t);
      }
      const src = ctx.createBufferSource();
      src.buffer = toBuffer(buf);
      src.playbackRate.value = rate;
      src.connect(v.gain);
      src.onended = () => {
        src.disconnect();
        if (v.src === src) v.src = null;
      };
      v.src = src;
      v.pan.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(gain, t + (offset > 0 ? 0.015 : 0.004));
      src.start(t, offset);
    },

    stop(bus, index, at) {
      const v = voices[bus][index];
      if (!v || !v.src || closed) return;
      const t = Math.max(at, ctx.currentTime);
      v.gain.gain.setTargetAtTime(0, t, 0.02);
      retire(v.src, t + 0.2);
    },

    gains(gs: BusGains, ramp) {
      if (closed) return;
      const t = ctx.currentTime;
      const set = (p: AudioParam, v: number) => {
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
        p.linearRampToValueAtTime(v, t + Math.max(0.01, ramp));
      };
      set(master.gain, gs.master);
      set(buses.sfx.gain, gs.sfx);
      set(buses.amb.gain, gs.amb);
      set(buses.music.gain, gs.music);
    },

    bed(layer, buf, gain, ramp) {
      const pair = layers[layer];
      if (!pair || closed) return;
      const t = ctx.currentTime;
      const cur = pair[front[layer]];
      if (buf && cur.buf === buf) {
        // Same bed: only its level moves.
        cur.gain.gain.cancelScheduledValues(t);
        cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
        cur.gain.gain.linearRampToValueAtTime(gain, t + ramp);
        return;
      }
      // Fade out what is playing...
      cur.gain.gain.cancelScheduledValues(t);
      cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
      cur.gain.gain.linearRampToValueAtTime(0, t + ramp);
      // Kept on the slot while it fades, so a slot reused before the fade is done can stop it.
      retire(cur.src, t + ramp + 0.05);
      cur.buf = null;
      if (!buf) return;
      // ...and bring the new bed up in the other slot.
      front[layer] = 1 - front[layer];
      const next = pair[front[layer]];
      const ng = next.gain.gain;
      // That slot may still be fading out a bed from a moment ago (in through a door and straight
      // back out): take it down fast and stop it before the new one starts on the same gain,
      // rather than two copies of a bed at different loop points and a snap to zero.
      const at = next.src ? t + 0.04 : t;
      ng.cancelScheduledValues(t);
      if (next.src) {
        ng.setValueAtTime(ng.value, t);
        ng.linearRampToValueAtTime(0, at);
        retire(next.src, at);
      }
      const src = ctx.createBufferSource();
      src.buffer = toBuffer(buf);
      src.loop = true;
      src.connect(next.gain);
      src.onended = () => {
        src.disconnect();
        if (next.src === src) next.src = null;
      };
      next.src = src;
      next.buf = buf;
      ng.setValueAtTime(0, at);
      ng.linearRampToValueAtTime(gain, at + ramp);
      // Start somewhere other than the top of the loop, so two visits never line up.
      src.start(at, (at * 0.37) % (buf.data.length / buf.rate));
    },

    running: () => !closed && ctx.state === "running",

    suspend(on) {
      if (closed) return;
      void (on ? ctx.suspend() : ctx.resume()).catch(() => {});
    },

    close() {
      if (closed) return;
      closed = true;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.05);
      window.setTimeout(() => void ctx.close().catch(() => {}), 80);
    },
  };
}
