/**
 * THE REALM'S SOUND, AS ARITHMETIC.
 *
 * Every sound the 3D Realm makes is synthesised here, in plain TypeScript, into a mono
 * `Float32Array`. No audio files, no network, no `AudioContext`: the browser's only job is to
 * play the finished samples (`web-audio.ts`). That split is what makes the sound testable under
 * jsdom, deterministic (a seeded generator, never `Math.random()`), drawable on the sound board,
 * and inspectable offline — the samples can be written to a WAV and looked at.
 *
 * The palette is deliberately small and soft: sines and triangles with rounded attacks and
 * exponential tails, noise that is always filtered, a Karplus–Strong pluck for anything wooden
 * or stringed, bell partials for anything that rings, and a small room reverb over the top so
 * nothing sounds like it was made in a vacuum. Nothing here is ever a raw square wave.
 */

/* ------------------------------------------------------------------ random */

/** mulberry32: small, fast, and the same numbers on every machine for the same seed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed from a name, so every sound has its own noise without a table of numbers. */
export function seedOf(name: string, variant = 0): number {
  let h = 2166136261 ^ variant;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------ filters */

export type FilterType = "lp" | "hp" | "bp";

/** An RBJ biquad, transposed direct form II. Coefficients can be moved mid-sound. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  constructor(
    private type: FilterType,
    private sr: number,
  ) {}

  set(freq: number, q: number): void {
    const f = Math.min(Math.max(freq, 20), this.sr * 0.45);
    const w = (2 * Math.PI * f) / this.sr;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * Math.max(0.05, q));
    const a0 = 1 + alpha;
    let b0: number, b1: number, b2: number;
    if (this.type === "lp") {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
    } else if (this.type === "hp") {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
    } else {
      // Constant 0 dB peak gain: a band-pass that does not get louder as it gets narrower.
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  run(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** Run a whole buffer through a fixed filter, in place. */
export function filterBuffer(buf: Float32Array, sr: number, type: FilterType, freq: number, q = 0.707): void {
  const f = new Biquad(type, sr);
  f.set(freq, q);
  for (let i = 0; i < buf.length; i++) buf[i] = f.run(buf[i]);
}

/* ------------------------------------------------------------------ envelopes */

/**
 * The one envelope shape: a raised-cosine rise over `attack` (never a step, so never a click),
 * then an exponential fall with time constant `decay`. `hold` keeps it at full for a while first.
 */
export function perc(t: number, attack: number, decay: number, hold = 0): number {
  if (t < 0) return 0;
  if (t < attack) return 0.5 - 0.5 * Math.cos((Math.PI * t) / attack);
  const u = t - attack - hold;
  if (u <= 0) return 1;
  return Math.exp(-u / decay);
}

/** A swell: rises over `attack` along a curve, holds, then releases over `release` to the end. */
export function swell(t: number, dur: number, attack: number, release: number, curve = 2): number {
  if (t < 0 || t > dur) return 0;
  const up = t < attack ? Math.pow(t / attack, curve) : 1;
  const left = dur - t;
  const down = left < release ? 0.5 - 0.5 * Math.cos((Math.PI * left) / release) : 1;
  return up * down;
}

/* ------------------------------------------------------------------ the builder */

export type Wave = "sine" | "tri" | "warm";

export type ToneSpec = {
  start?: number;
  /** How long the tone is written for; the envelope decides how much of it is heard. */
  dur: number;
  freq: number;
  /** Glide target. The pitch moves from `freq` to `to` with time constant `glide`. */
  to?: number;
  glide?: number;
  wave?: Wave;
  amp: number;
  attack?: number;
  decay?: number;
  hold?: number;
  /** Vibrato: rate in Hz and depth as a fraction of the pitch. */
  vib?: number;
  vibDepth?: number;
  /** Tremolo: rate in Hz and depth 0..1. */
  trem?: number;
  tremDepth?: number;
  /** Extra partials, [ratio, amplitude, decay multiplier]: bells, marimbas, kalimbas. */
  partials?: readonly (readonly [number, number, number])[];
  /** A swell instead of a percussive envelope. */
  swell?: { attack: number; release: number; curve?: number };
};

export type NoiseSpec = {
  start?: number;
  dur: number;
  amp: number;
  attack?: number;
  decay?: number;
  hold?: number;
  swell?: { attack: number; release: number; curve?: number };
  /** Brown noise is warmer (a rumble, surf); white is brighter (a brush, a hiss). */
  color?: "white" | "brown" | "pink";
  filter: FilterType;
  /** Cutoff or centre, moving from `freq` to `to` across `dur` (exponentially). */
  freq: number;
  to?: number;
  q?: number;
  /** A slow wobble of the cutoff: rate in Hz, depth as a ratio (0.3 = ±30%). */
  wobble?: number;
  wobbleDepth?: number;
};

export type PluckSpec = { start?: number; freq: number; amp: number; decay: number; bright?: number; dur?: number };

export type CrackleSpec = { start?: number; dur: number; rate: number; amp: number; freq: number; q?: number; ramp?: "up" | "down" | "flat" };

/**
 * Writes layers into one buffer. Everything adds; nothing allocates past the buffer itself and
 * the one delay line a pluck needs.
 */
export class Builder {
  readonly buf: Float32Array;
  readonly rng: () => number;

  constructor(
    readonly sr: number,
    readonly seconds: number,
    seed: number,
    readonly calm = false,
    readonly variant = 0,
  ) {
    this.buf = new Float32Array(Math.max(1, Math.ceil(sr * seconds)));
    this.rng = makeRng(seed);
  }

  /** A random number in [lo, hi), from this sound's own seeded generator. */
  r(lo = 0, hi = 1): number {
    return lo + (hi - lo) * this.rng();
  }

  tone(s: ToneSpec): this {
    const sr = this.sr;
    const i0 = Math.max(0, Math.floor((s.start ?? 0) * sr));
    const n = Math.min(this.buf.length - i0, Math.ceil(s.dur * sr));
    // Never faster than 1.5 ms: anything quicker is a click, whatever the pitch.
    const attack = Math.max(0.0015, s.attack ?? 0.006);
    const decay = s.decay ?? s.dur / 3;
    const hold = s.hold ?? 0;
    const wave = s.wave ?? "sine";
    const partials = s.partials ?? null;
    const np = partials ? partials.length : 0;
    const phases = new Float64Array(np);
    // The percussive tails are exponentials, so they are kept as running products — one multiply
    // a sample instead of an `exp` — and the loop stops once everything is 80 dB down.
    const kd = Math.exp(-1 / (decay * sr));
    const pk = new Float64Array(np);
    const pe = new Float64Array(np);
    for (let p = 0; p < np; p++) {
      pk[p] = Math.exp(-1 / (decay * partials![p][2] * sr));
      pe[p] = 1;
    }
    let env = 1;
    const tailStart = attack + hold;
    const fadeN = Math.min(n, Math.round(0.012 * sr));
    const glide = s.to !== undefined ? Math.exp(-1 / (Math.max(1e-4, s.glide ?? s.dur / 3) * sr)) : 1;
    let fOff = s.to !== undefined ? s.freq - s.to : 0;
    const fBase = s.to !== undefined ? s.to : s.freq;
    const w = (2 * Math.PI) / sr;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let f = fBase + fOff;
      fOff *= glide;
      if (s.vib) f *= 1 + (s.vibDepth ?? 0.01) * Math.sin(w * s.vib * i);
      phase += w * f;
      let v: number;
      if (wave === "sine") v = Math.sin(phase);
      else if (wave === "tri") v = (2 / Math.PI) * Math.asin(Math.sin(phase));
      else v = Math.sin(phase) + 0.28 * Math.sin(2 * phase) + 0.08 * Math.sin(3 * phase);
      let e: number;
      let rise = 1;
      if (s.swell) e = swell(t, s.dur, s.swell.attack, s.swell.release, s.swell.curve);
      else if (t < attack) e = rise = 0.5 - 0.5 * Math.cos((Math.PI * t) / attack);
      else if (t < tailStart) e = 1;
      else {
        env *= kd;
        e = env;
      }
      let out = v * e;
      let loudest = e;
      for (let p = 0; p < np; p++) {
        const [ratio, amp] = partials![p];
        phases[p] += w * f * ratio;
        let q: number;
        if (s.swell) q = e;
        else if (t < tailStart) q = rise;
        else {
          pe[p] *= pk[p];
          q = pe[p];
        }
        if (q > loudest) loudest = q;
        out += Math.sin(phases[p]) * amp * q;
      }
      if (s.trem) out *= 1 - (s.tremDepth ?? 0.3) * (0.5 + 0.5 * Math.sin(w * s.trem * i));
      // The written span ends on a short fade, never on a step.
      const left = n - i;
      if (left < fadeN) out *= left / fadeN;
      this.buf[i0 + i] += out * s.amp;
      if (!s.swell && t > tailStart && loudest < 1e-4) break;
    }
    return this;
  }

  noise(s: NoiseSpec): this {
    const sr = this.sr;
    const i0 = Math.max(0, Math.floor((s.start ?? 0) * sr));
    const n = Math.min(this.buf.length - i0, Math.ceil(s.dur * sr));
    const f = new Biquad(s.filter, sr);
    const q = s.q ?? 0.707;
    const color = s.color ?? "white";
    const to = s.to ?? s.freq;
    // Filtered noise that starts in under 2 ms is a click, not a brush.
    const attack = Math.max(0.002, s.attack ?? 0.004);
    const decay = s.decay ?? s.dur / 3;
    const hold = s.hold ?? 0;
    const kd = Math.exp(-1 / (decay * sr));
    let env = 1;
    const fadeN = Math.min(n, Math.round(0.012 * sr));
    let brown = 0;
    // Paul Kellet's economy pink filter state.
    let p0 = 0, p1 = 0, p2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 15) === 0) {
        let fc = s.freq * Math.pow(to / s.freq, Math.min(1, t / s.dur));
        if (s.wobble) fc *= 1 + (s.wobbleDepth ?? 0.3) * Math.sin(2 * Math.PI * s.wobble * t);
        f.set(fc, q);
      }
      let e: number;
      if (s.swell) e = swell(t, s.dur, s.swell.attack, s.swell.release, s.swell.curve);
      else if (t < attack) e = 0.5 - 0.5 * Math.cos((Math.PI * t) / attack);
      else if (t < attack + hold) e = 1;
      else {
        env *= kd;
        e = env;
        if (e < 1e-4) break;
      }
      const left = n - i;
      if (left < fadeN) e *= left / fadeN;
      const w = this.rng() * 2 - 1;
      let x: number;
      if (color === "white") x = w;
      else if (color === "brown") {
        brown = (brown + 0.02 * w) / 1.02;
        x = brown * 3.5;
      } else {
        p0 = 0.99765 * p0 + w * 0.099046;
        p1 = 0.963 * p1 + w * 0.2965164;
        p2 = 0.57 * p2 + w * 1.0526913;
        x = (p0 + p1 + p2 + w * 0.1848) * 0.2;
      }
      this.buf[i0 + i] += f.run(x) * e * s.amp;
    }
    return this;
  }

  /** Karplus–Strong: a plucked string, or with `bright` low, a soft wooden kalimba tine. */
  pluck(s: PluckSpec): this {
    const sr = this.sr;
    const i0 = Math.max(0, Math.floor((s.start ?? 0) * sr));
    const n = Math.min(this.buf.length - i0, Math.ceil((s.dur ?? s.decay * 5) * sr));
    const period = Math.max(2, Math.round(sr / s.freq));
    const line = new Float32Array(period);
    const bright = s.bright ?? 0.5;
    // Excite with filtered noise: less brightness is a softer pick.
    let lp = 0;
    for (let i = 0; i < period; i++) {
      lp += (this.rng() * 2 - 1 - lp) * (0.15 + 0.8 * bright);
      line[i] = lp;
    }
    // A per-sample loss chosen so the string rings for about `decay` seconds.
    const loss = Math.pow(0.001, 1 / (s.decay * s.freq));
    let idx = 0;
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const cur = line[idx];
      const next = 0.5 * (cur + prev) * loss;
      prev = cur;
      line[idx] = next;
      idx = idx + 1 === period ? 0 : idx + 1;
      // A few-millisecond fade in, so the pick is a touch, not a click.
      const t = i / sr;
      const a = t < 0.003 ? t / 0.003 : 1;
      this.buf[i0 + i] += cur * a * s.amp;
    }
    return this;
  }

  /** Sparse little clicks through a band-pass: embers, pebbles, ice, a ratchet. */
  crackle(s: CrackleSpec): this {
    // Each crackle is a tiny rounded tick — a few cycles of a sine with a soft rise — rather than
    // a raw impulse, which would be a broadband click. `q` widens or narrows the spread of pitch.
    const start = s.start ?? 0;
    const count = Math.max(1, Math.round(s.rate * s.dur));
    const spread = 0.35 / Math.max(0.5, s.q ?? 2);
    for (let k = 0; k < count; k++) {
      let u = this.rng();
      if (s.ramp === "up") u = Math.sqrt(u);
      else if (s.ramp === "down") u = 1 - Math.sqrt(1 - u);
      const gain = s.ramp === "up" ? 0.3 + 0.7 * u : s.ramp === "down" ? 1 - 0.7 * u : 1;
      const f = s.freq * (1 + spread * (this.rng() * 2 - 1));
      this.tone({ start: start + u * s.dur, dur: 0.02, freq: f, amp: s.amp * gain * (0.5 + 0.5 * this.rng()), attack: 0.0015, decay: 0.0035 });
    }
    return this;
  }
}

/* ------------------------------------------------------------------ the room */

/**
 * A small Schroeder reverb (four damped combs into two all-passes), mixed in place. `size`
 * scales the comb lengths: 0.6 is a cottage, 1 a hall, 1.4 a chapel. The buffer must already
 * be long enough to hold the tail.
 */
export function reverb(buf: Float32Array, sr: number, mix: number, size = 1, damp = 0.35): void {
  if (mix <= 0) return;
  new Reverb(sr, mix, size, damp).run(buf, 0, buf.length);
}

/** The same reverb as a stateful object, so a long buffer can be processed a slice at a time. */
export class Reverb {
  private combs: { line: Float32Array; i: number; store: number }[];
  private aps: { line: Float32Array; i: number }[];
  private fb: number;

  constructor(
    sr: number,
    private mix: number,
    size = 1,
    private damp = 0.35,
  ) {
    const scale = (sr / 44100) * size;
    this.combs = [1116, 1188, 1277, 1356].map((l) => ({ line: new Float32Array(Math.max(8, Math.round(l * scale))), i: 0, store: 0 }));
    this.aps = [556, 441].map((l) => ({ line: new Float32Array(Math.max(4, Math.round(l * scale))), i: 0 }));
    this.fb = 0.72 + (0.1 * Math.min(1.5, size)) / 1.5;
  }

  run(buf: Float32Array, from: number, to: number): void {
    const { combs, aps, fb, damp, mix } = this;
    for (let n = from; n < to; n++) {
      const x = buf[n] * 0.2;
      let wet = 0;
      for (let k = 0; k < combs.length; k++) {
        const c = combs[k];
        const y = c.line[c.i];
        c.store = y * (1 - damp) + c.store * damp;
        c.line[c.i] = x + c.store * fb;
        c.i = c.i + 1 === c.line.length ? 0 : c.i + 1;
        wet += y;
      }
      for (let k = 0; k < aps.length; k++) {
        const a = aps[k];
        const y = a.line[a.i];
        const v = wet + y * 0.5;
        a.line[a.i] = v;
        a.i = a.i + 1 === a.line.length ? 0 : a.i + 1;
        wet = y - v * 0.5;
      }
      buf[n] = buf[n] + wet * mix;
    }
  }
}

/* ------------------------------------------------------------------ finishing */

export type FinishOptions = {
  /** The peak the sound is normalised to, 0..1. This is the sound's loudness in the mix. */
  level: number;
  /** Fades at both ends, in seconds, so no sound ever starts or stops on a step. */
  fadeIn?: number;
  fadeOut?: number;
  /** A final low-pass: calm mode's softening, or a sound that should be darker. */
  lowpass?: number;
  /**
   * A final high-pass. Energy under ~80 Hz is inaudible on the laptop speakers these children
   * play on, but it still eats headroom and muddies everything else; it is taken out.
   */
  highpass?: number;
};

/**
 * The last pass over every sound: take out any DC, round off anything sharp, fade both ends to
 * silence, a whisper of tape-style saturation for warmth, and normalise to the sound's level.
 */
export function finish(buf: Float32Array, sr: number, o: FinishOptions): Float32Array {
  // DC blocker (a one-pole high-pass at ~20 Hz): a pluck or a brown-noise layer can leave a
  // standing offset, which is a click at the start and end of every play.
  let x1 = 0;
  let y1 = 0;
  const R = 1 - (2 * Math.PI * 20) / sr;
  for (let i = 0; i < buf.length; i++) {
    const y = buf[i] - x1 + R * y1;
    x1 = buf[i];
    y1 = y;
    buf[i] = y;
  }
  if (o.highpass) filterBuffer(buf, sr, "hp", o.highpass, 0.6);
  if (o.lowpass) filterBuffer(buf, sr, "lp", o.lowpass, 0.6);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  if (peak > 0) {
    const pre = 1.15 / peak;
    const norm = Math.tanh(1.15);
    for (let i = 0; i < buf.length; i++) buf[i] = (Math.tanh(buf[i] * pre) / norm) * o.level;
  }
  const fi = Math.min(buf.length >> 1, Math.round((o.fadeIn ?? 0.002) * sr));
  const fo = Math.min(buf.length >> 1, Math.round((o.fadeOut ?? 0.02) * sr));
  for (let i = 0; i < fi; i++) buf[i] *= i / fi;
  for (let i = 0; i < fo; i++) buf[buf.length - 1 - i] *= i / fo;
  return buf;
}

/**
 * Makes a buffer loop without a seam: the last `overlap` seconds are cross-faded (equal power)
 * into the first, and the buffer is cut to the loop length. The input must be `loop + overlap`.
 */
export function seamless(buf: Float32Array, sr: number, overlap: number): Float32Array {
  const ov = Math.round(overlap * sr);
  const len = buf.length - ov;
  const out = buf.slice(0, len);
  for (let i = 0; i < ov; i++) {
    const t = i / ov;
    const a = Math.sin((Math.PI / 2) * t);
    const b = Math.cos((Math.PI / 2) * t);
    out[i] = buf[i] * a + buf[len + i] * b;
  }
  return out;
}

/* ------------------------------------------------------------------ measuring */

export type SoundStats = {
  seconds: number;
  peak: number;
  rms: number;
  /** The largest jump between two neighbouring samples: a click detector. */
  maxStep: number;
  /** First and last sample magnitudes: both must be ~0 or the sound starts or ends on a click. */
  edge: number;
  dc: number;
};

export function stats(buf: Float32Array, sr: number): SoundStats {
  let peak = 0;
  let sq = 0;
  let sum = 0;
  let maxStep = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    peak = Math.max(peak, Math.abs(v));
    sq += v * v;
    sum += v;
    if (i > 0) maxStep = Math.max(maxStep, Math.abs(v - buf[i - 1]));
  }
  return {
    seconds: buf.length / sr,
    peak,
    rms: Math.sqrt(sq / Math.max(1, buf.length)),
    maxStep,
    edge: Math.max(Math.abs(buf[0] ?? 0), Math.abs(buf[buf.length - 1] ?? 0)),
    dc: sum / Math.max(1, buf.length),
  };
}

/** A min/max envelope in `columns` buckets, for drawing a waveform without touching every sample. */
export function waveformPeaks(buf: Float32Array, columns: number): { min: Float32Array; max: Float32Array } {
  const min = new Float32Array(columns);
  const max = new Float32Array(columns);
  const per = buf.length / columns;
  for (let c = 0; c < columns; c++) {
    let lo = 0;
    let hi = 0;
    const a = Math.floor(c * per);
    const b = Math.min(buf.length, Math.floor((c + 1) * per));
    for (let i = a; i < b; i++) {
      const v = buf[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[c] = lo;
    max[c] = hi;
  }
  return { min, max };
}
