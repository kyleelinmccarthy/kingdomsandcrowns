/**
 * THE SOUND ENGINE: what plays, when, on which voice, and how loud.
 *
 * It owns no browser object. Everything it does to the speakers goes through `AudioOut` — a
 * handful of calls the Web Audio backend (`web-audio.ts`) implements and a test fakes — and all
 * of its waiting goes through `Timers`. So every rule here (the gate, the pool, the ducking, the
 * soundscape, the music's timing) runs under jsdom with no `AudioContext` at all.
 *
 * Nothing is created per frame. The engine is called on EVENTS — a footfall, a spell, a door —
 * never polled, and each call is a cache lookup, a gate check and one `out.play`. The buffers
 * are synthesised once (`recipes.ts`), ahead of time and off the game's thread (`synth.ts`), and
 * reused.
 *
 * Before the first key press or click there is no `AudioContext` (browsers refuse one), so the
 * engine is created detached: every call is a silent no-op until `attach` hands it an output.
 */

import { castCues, cueInfo, jitter, zoneSound, type Bus } from "./cues";
import { FIRST_MUSIC_S, musicGap } from "./music";
import { DETAILS, EFFECTS, renderSound, variantsOf, type Element, type SoundId, type Surface, type Zone } from "./recipes";
import { idleSynth, jobKey, type Synth, type SynthJob } from "./synth";
import { busGains, detailSpacing, musicWanted, type BusGains, type MixState } from "./settings";
import { admit, claimVoice, clearPool, endVoice, makeGate, makePool, playingCount, type VoicePool } from "./voices";

export type SoundBuffer = { data: Float32Array; rate: number };

/** The speakers, as far as the engine is concerned. */
export interface AudioOut {
  /** The audio clock, in seconds. */
  now(): number;
  /**
   * Starts `buf` on voice `index` of `bus` at `at`, from `offset` seconds into it. If `stolen`,
   * the voice's old sound is faded out first. Every start is faded in over a few milliseconds.
   */
  play(bus: Bus, index: number, buf: SoundBuffer, at: number, gain: number, pan: number, rate: number, stolen: boolean, offset: number): void;
  /** Fades voice `index` of `bus` out from `at`. */
  stop(bus: Bus, index: number, at: number): void;
  /** Moves the four bus gains to these values over `ramp` seconds. */
  gains(g: BusGains, ramp: number): void;
  /** Loops `buf` on bed layer `layer` at `gain`, cross-fading from whatever was there over `ramp`. Null fades it out. */
  bed(layer: number, buf: SoundBuffer | null, gain: number, ramp: number): void;
  /** Pauses or resumes the whole output (a hidden tab). */
  suspend(on: boolean): void;
  /**
   * Whether the device is really running (not left suspended by a browser that did not count
   * the gesture). Optional: an output that cannot tell is taken to be running.
   */
  running?(): boolean;
  /** Stops everything and releases the device. */
  close(): void;
}

export interface Timers {
  set(fn: () => void, ms: number): number;
  clear(id: number): void;
  /** Runs `fn` when the page has a moment. `fn` gets the milliseconds it may use. */
  idle(fn: (budgetMs: number) => void): void;
}

export const POOL_SIZES: Readonly<Record<Bus, number>> = { sfx: 14, amb: 4, music: 2 };
/** How long a bus takes to move: long enough to never click, short enough to feel immediate. */
export const MIX_RAMP = 0.25;
/** Beds cross-fade slowly, so walking into the wood is the wood coming up round you. */
export const BED_FADE = 2.5;
/** How far ahead a sound is scheduled: past the audio thread's current block, so it never clips its own start. */
export const LEAD = 0.01;
/** Bed layers the engine uses. */
export const BED_LAYERS = 2;

export type PlayOptions = { gain?: number; pan?: number; rate?: number; delay?: number; offset?: number };

/**
 * How long after `AudioOut.stop` a voice's sound is really gone: the backend fades it and stops
 * its source this long after (`web-audio.ts`). A voice is not free to be claimed before then.
 */
export const STOP_TAIL = 0.2;

/** Where a charge's swell peaks in its buffer (`recipes.ts` swells over 0.85 s). */
export const CHARGE_PEAK = 0.9;

/**
 * The order the effects are made in after the first gesture: what a child does in their first
 * seconds first (walking, the prompt, clicking), the rarest and heaviest last.
 */
const FIRST: readonly SoundId[] = ["step-grass", "step-road", "prompt", "ui-click", "jump", "land", "talk", "pause", "resume", "refuse"];

/**
 * Sounds only some visits want — one mount's feet and hello out of eight, a crown ceremony, the
 * clock's chimes — made only when the game says it wants them (`SoundEngine.want`), so a
 * grown-up's visit never spends the synth's first seconds on a pony they will never ride.
 */
export function onDemand(id: SoundId): boolean {
  return /^(hoof|paw|gallop|call|mount|travel)-/.test(id) || id === "wingbeat" || id === "crown" || id === "last-minute" || id === "farewell";
}

export const WARM_ORDER: readonly SoundId[] = [...FIRST, ...EFFECTS.filter((id) => !FIRST.includes(id) && id !== "complete" && !onDemand(id)), ...DETAILS, "complete"];

/** How long a big moment may wait for its sound to be made before it is let go (`moment`). */
export const MOMENT_WAIT = 2.5;
/** How long after a ducked moment ends the music comes back. */
export const DUCK_TAIL = 0.6;

type Render = (id: SoundId, o: { calm: boolean; variant: number }) => SoundBuffer;

export class SoundEngine {
  private out: AudioOut | null = null;
  private pools: Record<Bus, VoicePool> = { sfx: makePool(POOL_SIZES.sfx), amb: makePool(POOL_SIZES.amb), music: makePool(POOL_SIZES.music) };
  private gate = makeGate();
  private cache = new Map<string, SoundBuffer>();
  private zone: Zone | null = null;
  private counter = 0;
  private detailTimer = -1;
  private musicTimer = -1;
  private musicSeed = 1;
  private nextPhrase: SoundBuffer | null = null;
  private rendering = false;
  private closed = false;
  private synth: Synth;
  /** The synth failed once and this thread's idle fallback took over. */
  private fellBack = false;
  /** The tab is hidden: the timers are stopped until it is back. */
  private away = false;
  /** Sounds wanted this visit beyond the usual ones (`want`): made ahead of the usual, or after them. */
  private early: SoundId[] = [];
  private late: SoundId[] = [];
  private warmed = false;
  /** Moments sounding with the music ducked under them, and the timers that bring it back. */
  private ducks = 0;
  private duckTimers = new Set<number>();

  /**
   * `synth` makes the buffers ahead of time (a worker in the browser); without one, the engine
   * makes them itself in idle moments. `render` is the last resort for a sound wanted before it
   * was ready, and what the tests replace to keep the DSP out of the engine's tests.
   */
  constructor(
    private mix: MixState,
    private timers: Timers,
    private render: Render = renderSound,
    synth?: Synth,
  ) {
    this.synth = synth ?? idleSynth(timers, render);
  }

  get attached(): boolean {
    return this.out !== null;
  }

  /** Attached, and the device is really running: nothing more for a gesture to do. */
  get running(): boolean {
    const out = this.out;
    return out !== null && !this.closed && (out.running ? out.running() : true);
  }

  /** Finished: `close` ran, and nothing will ever play again. */
  get finished(): boolean {
    return this.closed;
  }

  /**
   * The first gesture's call: makes the output with `make` and attaches it — but only if the
   * engine still wants one. After `close`, or once attached, `make` is never called, so a late
   * gesture can never open an audio device that nothing will close. True when it attached.
   */
  attachWith(make: () => AudioOut | null): boolean {
    if (this.closed || this.out) return false;
    const out = make();
    if (!out) return false;
    this.attach(out);
    return true;
  }

  get state(): Readonly<MixState> {
    return this.mix;
  }

  get currentZone(): Zone | null {
    return this.zone;
  }

  /** The first gesture happened and there is somewhere to play. Starts the soundscape and the music clock. */
  attach(out: AudioOut): void {
    if (this.closed || this.out) return;
    this.out = out;
    out.gains(busGains(this.mix), 0.05);
    this.warmAndZone();
    this.scheduleMusic(FIRST_MUSIC_S);
  }

  /**
   * Everything the child might do, made ahead of time, so no press ever waits on it; and the
   * country's beds. Off the game's thread the effects are asked for FIRST, ahead of the beds
   * (and the phrase, asked for after this), which are the heaviest jobs and not wanted for
   * seconds: a first cast in the first second must not queue behind them. On this thread the
   * beds go first, as they always did — there, whatever is asked for early is made early.
   */
  private warmAndZone(): void {
    if (this.synth.offThread) {
      this.warm();
      if (this.zone) this.startZone(this.zone);
    } else {
      if (this.zone) this.startZone(this.zone);
      this.warm();
    }
  }

  /** Changes any part of the mix; the buses follow on a short ramp. */
  setMix(patch: Partial<MixState>): void {
    const was = this.mix;
    this.mix = { ...was, ...patch };
    if (!this.out) return;
    this.out.gains(busGains(this.mix), MIX_RAMP);
    if (was.calm !== this.mix.calm) this.warmAndZone();
    const wanted = musicWanted(this.mix);
    if (wanted !== musicWanted(was)) {
      if (wanted) this.scheduleMusic(6);
      else this.stopMusic();
    }
  }

  /** Where the child is. The beds cross-fade and the little sounds change with it. */
  setZone(zone: Zone): void {
    if (zone === this.zone) return;
    this.zone = zone;
    if (this.out) this.startZone(zone);
  }

  /**
   * Plays a sound. Returns the voice it took, or -1 when it was dropped: no output yet, the gate
   * said too soon or too many, or every voice was busy with something more important.
   */
  play(id: SoundId, o: PlayOptions = {}): number {
    const out = this.out;
    if (!out || this.closed) return -1;
    const info = cueInfo(id);
    const now = out.now();
    const pool = this.pools[info.bus];
    if (!admit(this.gate, pool, id, now, info.gap, info.max)) return -1;
    const variants = variantsOf(id);
    const variant = variants > 1 ? this.counter++ % variants : 0;
    // With a worker, never made HERE, on the game's thread, at the moment it is wanted: a take
    // that is not ready yet gives way to one of its siblings that is, or — first seconds only —
    // the sound is dropped and asked for, and the next one plays.
    let buf = this.readyTake(id, variant, variants);
    if (!buf) {
      if (this.synth.offThread) {
        void this.fetch(id, variant);
        return -1;
      }
      buf = this.buffer(id, variant);
    }
    const at = now + LEAD + (o.delay ?? 0);
    const rate = o.rate ?? 1;
    const offset = Math.max(0, o.offset ?? 0);
    const seconds = (buf.data.length / buf.rate - offset) / rate + (o.delay ?? 0);
    const { index, stolen } = claimVoice(pool, id, info.priority, now, seconds);
    if (index < 0) return -1;
    out.play(info.bus, index, buf, stolen ? at + 0.03 : at, o.gain ?? 1, o.pan ?? 0, rate, stolen, offset);
    return index;
  }

  /** A footfall. Takes rotate and the pitch wanders a hair, so a walk is never a metronome. */
  step(surface: Surface): void {
    const j = jitter(this.counter);
    this.play(`step-${surface}`, { rate: 0.94 + 0.12 * j, gain: 0.85 + 0.15 * jitter(this.counter + 7), pan: (j - 0.5) * 0.12 });
  }

  /**
   * A mount's footfall (or a gallop's three beats): takes rotate, the pitch is the mount's own
   * (`rate`) and wanders a hair, like the hero's steps.
   */
  footfall(id: SoundId, rate: number, gain = 1): void {
    const j = jitter(this.counter);
    this.play(id, { rate: rate * (0.96 + 0.08 * j), gain: gain * (0.82 + 0.18 * jitter(this.counter + 7)), pan: (j - 0.5) * 0.1 });
  }

  /**
   * Sounds this visit will want that the usual warm-up leaves out (`onDemand`): the child's own
   * mount's, the crown's when a ceremony is waiting, the clock's. `first` puts them ahead of
   * everything — the ceremony is the first thing a child with a new crown sees. Asked for at
   * once if the warm-up has already run.
   */
  want(ids: readonly SoundId[], first = false): void {
    if (this.closed) return;
    const list = first ? this.early : this.late;
    for (const id of ids) if (!list.includes(id)) list.push(id);
    if (this.warmed) for (const id of ids) for (let v = 0; v < variantsOf(id); v++) void this.fetch(id, v);
  }

  /**
   * A big moment — the crown worn, the last minute, travel's start — which must not be lost to
   * a sound not made yet: played as soon as it is ready, if that is within `wait` seconds of
   * asking. `duck` steps the music back for its length, so a fanfare never plays over a phrase.
   * Never renders on the game's thread when a worker exists: it waits for the worker instead.
   */
  moment(id: SoundId, o: { duck?: boolean; wait?: number; gain?: number; delay?: number; rate?: number } = {}): void {
    const out = this.out;
    if (!out || this.closed) return;
    const asked = out.now();
    const go = (buf: SoundBuffer) => {
      const now = this.out;
      if (!now || this.closed || now.now() - asked > (o.wait ?? MOMENT_WAIT)) return;
      if (this.play(id, { gain: o.gain, delay: o.delay, rate: o.rate }) < 0) return;
      if (o.duck) this.duckFor((buf.data.length / buf.rate) / (o.rate ?? 1) + (o.delay ?? 0));
    };
    const ready = this.readyTake(id, 0, variantsOf(id));
    if (ready) go(ready);
    else if (this.synth.offThread) void this.fetch(id).then((b) => b && go(b));
    else go(this.buffer(id));
  }

  /** The music steps back for `seconds`, then returns; overlapping moments hold it back together. */
  private duckFor(seconds: number): void {
    this.ducks++;
    if (this.ducks === 1) this.setMix({ duck: true });
    const id = this.timers.set(() => {
      this.duckTimers.delete(id);
      this.ducks = Math.max(0, this.ducks - 1);
      if (this.ducks === 0 && !this.closed) this.setMix({ duck: false });
    }, (seconds + DUCK_TAIL) * 1000);
    this.duckTimers.add(id);
  }

  /**
   * The goodbye (the clock ran out): the music stops, the closing cadence plays, and the engine
   * closes itself when it has finished. Nothing else plays after it. Closes at once when there is
   * no output to say goodbye on.
   */
  farewell(): void {
    const out = this.out;
    if (this.closed) return;
    if (!out) {
      this.close();
      return;
    }
    this.stopMusic();
    if (this.detailTimer >= 0) this.timers.clear(this.detailTimer);
    this.detailTimer = -1;
    for (let layer = 0; layer < BED_LAYERS; layer++) out.bed(layer, null, 0, 1.5);
    const ready = this.readyTake("farewell", 0, 1);
    const wait = ready ? 0 : MOMENT_WAIT;
    this.moment("farewell", { duck: true });
    const seconds = ready ? ready.data.length / ready.rate : 4.8;
    this.timers.set(() => this.close(), (seconds + wait + 0.3) * 1000);
  }

  /** Landing from a jump: louder the longer the child was in the air. */
  land(air: number): void {
    this.play("land", { gain: Math.min(1, 0.45 + air) });
  }

  /**
   * A spell: its element's charge for exactly the spell's cast time, cut on a short fade as the
   * release goes off. Both are scheduled now, on the audio clock, so they line up with the
   * effect on screen however busy the frame is. A quick spell starts its charge part-way in, so
   * a 300 ms bolt still hears the swell arrive at its peak rather than only its first whisper.
   */
  cast(element: Element, castMs: number): void {
    const out = this.out;
    if (!out) return;
    const { charge, release } = castCues(element);
    const hold = Math.max(0.12, Math.min(1.0, castMs / 1000));
    const idx = this.play(charge, { offset: Math.max(0, CHARGE_PEAK - hold) });
    if (idx >= 0) {
      const at = out.now() + LEAD + hold;
      out.stop("sfx", idx, at);
      // Free when the backend has really stopped it, not before: claimed sooner, the charge's
      // swell would sound on the next sound's gain.
      endVoice(this.pools.sfx, idx, at + STOP_TAIL);
    }
    this.play(release, { delay: hold });
  }

  /** Stops every sound and the device. The engine is finished after this. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.detailTimer >= 0) this.timers.clear(this.detailTimer);
    if (this.musicTimer >= 0) this.timers.clear(this.musicTimer);
    this.detailTimer = this.musicTimer = -1;
    for (const id of this.duckTimers) this.timers.clear(id);
    this.duckTimers.clear();
    for (const bus of ["sfx", "amb", "music"] as const) clearPool(this.pools[bus]);
    this.synth.close();
    this.out?.close();
    this.out = null;
  }

  /**
   * Suspends the output while the tab is hidden, and picks it up again after. The timers stop
   * too: a hidden tab's throttled timers still fire against a frozen audio clock, and every
   * phrase and little sound they queued would start at once on return.
   */
  hidden(on: boolean): void {
    if (this.closed) return;
    this.out?.suspend(on);
    if (on) {
      if (this.detailTimer >= 0) this.timers.clear(this.detailTimer);
      if (this.musicTimer >= 0) this.timers.clear(this.musicTimer);
      this.detailTimer = this.musicTimer = -1;
      this.away = true;
      return;
    }
    if (!this.away) return;
    this.away = false;
    if (!this.out) return;
    this.scheduleDetail();
    this.scheduleMusic(musicGap(this.musicSeed));
  }

  /** How many voices of each bus are sounding: for tests and the dev hook. */
  busy(): Record<Bus, number> {
    const now = this.out ? this.out.now() : 0;
    const count = (p: VoicePool) => p.voices.filter((v) => v.endsAt > now).length;
    return { sfx: count(this.pools.sfx), amb: count(this.pools.amb), music: count(this.pools.music) };
  }

  playing(id: SoundId): number {
    const now = this.out ? this.out.now() : 0;
    return playingCount(this.pools[cueInfo(id).bus], id, now);
  }

  /* ---------------------------------------------------------------- inside */

  /** A sound's buffer now: from the cache, or — only if it was wanted before it was ready — made here. */
  buffer(id: SoundId, variant = 0): SoundBuffer {
    const job: SynthJob = { kind: "sound", id, calm: this.mix.calm, variant };
    const key = jobKey(job);
    let b = this.cache.get(key);
    if (!b) {
      b = this.render(id, { calm: job.calm, variant });
      this.cache.set(key, b);
    }
    return b;
  }

  /** A ready take of `id`: the one asked for, or any sibling take that is made. */
  private readyTake(id: SoundId, variant: number, variants: number): SoundBuffer | null {
    for (let k = 0; k < variants; k++) {
      const b = this.cache.get(jobKey({ kind: "sound", id, calm: this.mix.calm, variant: (variant + k) % variants }));
      if (b) return b;
    }
    return null;
  }

  /** Whether a sound is ready without any work on this thread. */
  ready(id: SoundId, variant = 0): boolean {
    return this.cache.has(jobKey({ kind: "sound", id, calm: this.mix.calm, variant }));
  }

  /** Asks the synth for a sound and keeps it. Resolves with it; never rejects. */
  private fetch(id: SoundId, variant = 0): Promise<SoundBuffer | null> {
    const job: SynthJob = { kind: "sound", id, calm: this.mix.calm, variant };
    const key = jobKey(job);
    const have = this.cache.get(key);
    if (have) return Promise.resolve(have);
    return this.synth.render(job).then(
      (b) => {
        if (!this.cache.has(key)) this.cache.set(key, b);
        return this.cache.get(key)!;
      },
      () => (this.fallBack() ? this.fetch(id, variant) : null),
    );
  }

  /**
   * The synth failed (a worker that loaded and then threw, or a script that would not load):
   * this thread's idle fallback takes over for good. True when a job that failed should be
   * asked again (always, until the engine is closed).
   */
  private fallBack(): boolean {
    if (this.closed) return false;
    if (!this.fellBack) {
      this.fellBack = true;
      this.synth.close();
      this.synth = idleSynth(this.timers, this.render);
    }
    // Every job the failed synth was holding comes back through here; the fallback never
    // rejects, so asking again cannot loop.
    return true;
  }

  private warm(): void {
    if (this.closed) return;
    this.warmed = true;
    const ask = (id: SoundId) => {
      for (let v = 0; v < variantsOf(id); v++) void this.fetch(id, v);
    };
    this.early.forEach(ask);
    WARM_ORDER.forEach(ask);
    this.late.forEach(ask);
  }

  private startZone(zone: Zone): void {
    if (!this.out) return;
    const scape = zoneSound(zone);
    for (let layer = 0; layer < BED_LAYERS; layer++) {
      const bed = scape.beds[layer];
      if (!bed) {
        this.out.bed(layer, null, 0, BED_FADE);
        continue;
      }
      // A bed not made yet comes in when it is: the old one plays on until then.
      void this.fetch(bed[0]).then((buf) => {
        if (buf && this.out && this.zone === zone) this.out.bed(layer, buf, bed[1], BED_FADE);
      });
    }
    this.scheduleDetail();
  }

  private scheduleDetail(): void {
    if (this.detailTimer >= 0) this.timers.clear(this.detailTimer);
    this.detailTimer = -1;
    const zone = this.zone;
    if (!zone || this.closed) return;
    const s = zoneSound(zone);
    const n = this.counter++;
    const wait = (s.minGap + (s.maxGap - s.minGap) * jitter(n)) * detailSpacing(this.mix.calm);
    this.detailTimer = this.timers.set(() => {
      this.detailTimer = -1;
      if (!this.zone) return;
      const scape = zoneSound(this.zone);
      const pick = scape.details[Math.floor(jitter(n + 1) * scape.details.length)];
      this.play(pick, { pan: (jitter(n + 2) - 0.5) * 1.3, gain: 0.7 + 0.3 * jitter(n + 3) });
      this.scheduleDetail();
    }, wait * 1000);
  }

  private scheduleMusic(inSeconds: number): void {
    if (this.musicTimer >= 0) this.timers.clear(this.musicTimer);
    this.musicTimer = -1;
    if (this.closed || !this.out || !musicWanted(this.mix)) return;
    this.prepareMusic();
    this.musicTimer = this.timers.set(() => {
      this.musicTimer = -1;
      if (!musicWanted(this.mix)) return;
      const buf = this.nextPhrase;
      if (!buf) {
        // Not ready (a very busy page): try again shortly rather than stall anything.
        this.scheduleMusic(4);
        return;
      }
      this.nextPhrase = null;
      this.playMusic(buf);
      this.musicSeed++;
      this.scheduleMusic(buf.data.length / buf.rate + musicGap(this.musicSeed));
    }, inSeconds * 1000);
  }

  private playMusic(buf: SoundBuffer): void {
    const out = this.out;
    if (!out) return;
    const now = out.now();
    const { index, stolen } = claimVoice(this.pools.music, "music", 1, now, buf.data.length / buf.rate);
    if (index >= 0) out.play("music", index, buf, now + LEAD, 1, 0, 1, stolen, 0);
  }

  private stopMusic(): void {
    if (this.musicTimer >= 0) this.timers.clear(this.musicTimer);
    this.musicTimer = -1;
    const out = this.out;
    if (!out) return;
    const now = out.now();
    this.pools.music.voices.forEach((v, i) => {
      if (v.endsAt > now) {
        out.stop("music", i, now);
        endVoice(this.pools.music, i, now);
      }
    });
  }

  /** Asks for the next phrase well before it is wanted. */
  private prepareMusic(): void {
    if (this.nextPhrase || this.rendering) return;
    this.rendering = true;
    const seed = this.musicSeed;
    this.synth.render({ kind: "phrase", seed }).then(
      (b) => {
        this.rendering = false;
        if (!this.closed && seed === this.musicSeed) this.nextPhrase = b;
      },
      () => {
        this.rendering = false;
        if (this.fallBack()) this.prepareMusic();
      },
    );
  }
}

