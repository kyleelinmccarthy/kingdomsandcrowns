/**
 * THE SOUND SETTINGS, and the mix they make. Pure.
 *
 * Three sliders and a mute, stored per child on `realm_settings.sound` — and a visiting
 * grown-up's own in the `realm_visitor_sound` table, one row per grown-up, so a parent who likes
 * it quiet does not turn their child's Realm down by visiting it. Stored as JSON text so a slider can be added without a
 * migration; anything unreadable falls back to the defaults, never to an error.
 *
 * Everything the mix does is decided in `busGains`: the sliders, the parent's switch in the
 * learning profile, calm mode, the pause menu and read-aloud all meet there, as one function of
 * one state, with a test for every rule.
 */

export type SoundSettings = {
  /** 0..100 each. */
  master: number;
  effects: number;
  music: number;
  muted: boolean;
};

/**
 * Moderate by default: the master at 60 and the music well under the effects. Loud enough to
 * notice on a laptop, quiet enough that nobody reaches for the volume key in the first minute.
 */
export const DEFAULT_SOUND: SoundSettings = { master: 60, effects: 80, music: 50, muted: false };

function level(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.round(Math.min(100, Math.max(0, v)));
}

/** Anything at all — a stored string, a parsed object, null — to a whole, valid settings object. */
export function soundFrom(raw: unknown): SoundSettings {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      v = null;
    }
  }
  if (!v || typeof v !== "object") return { ...DEFAULT_SOUND };
  const o = v as Record<string, unknown>;
  return {
    master: level(o.master, DEFAULT_SOUND.master),
    effects: level(o.effects, DEFAULT_SOUND.effects),
    music: level(o.music, DEFAULT_SOUND.music),
    muted: typeof o.muted === "boolean" ? o.muted : DEFAULT_SOUND.muted,
  };
}

/** What is written to the column: always the whole object, validated. */
export function soundToStored(s: SoundSettings): string {
  return JSON.stringify(soundFrom(s));
}

export function sameSound(a: SoundSettings, b: SoundSettings): boolean {
  return a.master === b.master && a.effects === b.effects && a.music === b.music && a.muted === b.muted;
}

/**
 * A slider's 0..100 to a linear gain. Squared, because loudness is not linear: a slider at half
 * should sound about half as loud, and a linear gain of 0.5 sounds nearly as loud as full.
 */
export function sliderGain(v: number): number {
  const x = Math.min(100, Math.max(0, v)) / 100;
  return x * x;
}

/* ------------------------------------------------------------------ the mix */

export type MixState = {
  settings: SoundSettings;
  /**
   * False when there must be no sound at all: a child whose grown-up switched Sound off in their
   * learning profile. The child's own mute is `settings.muted`, which they can undo; this they cannot.
   */
  enabled: boolean;
  /** Reduced motion or low stimulus: quieter, no music, fewer little sounds. */
  calm: boolean;
  /** A menu or panel is open over the world. */
  paused: boolean;
  /** Read-aloud is speaking. */
  speaking: boolean;
  /** A big moment is sounding (the crown, the goodbye): the music steps right back for it. */
  duck?: boolean;
};

export type BusGains = { master: number; sfx: number; amb: number; music: number };

/** How much each bus drops while a menu is open: the music most, the world a little. */
export const PAUSE_DUCK = { music: 0.35, amb: 0.6, sfx: 1 } as const;
/** And while read-aloud speaks: enough that a question is never buried under a kalimba. */
export const SPEECH_DUCK = { music: 0.15, amb: 0.4, sfx: 0.6 } as const;
/**
 * And under a big moment — the crown's fanfare, the last-minute chime, the goodbye — the music
 * all but stops, so the two never sound as one: it is in the same key, but not in the same time.
 */
export const MOMENT_DUCK = { music: 0.08, amb: 0.7, sfx: 1 } as const;
/** Calm mode's master. */
export const CALM_MASTER = 0.7;
/**
 * The master bus's gain before the sliders. The recipes are levelled with headroom (their peaks
 * sit at 0.1–0.46), so this brings the whole up to a moderate listening level at the default
 * sliders: the biggest moment, a building finished, peaks near -13 dBFS, a footstep near -21,
 * the beds and the music well under both. The output's soft limiter (`web-audio.ts`) catches the
 * rare pile-up with every slider at full.
 */
export const OUTPUT_GAIN = 2;
/** The ambience sits under the effects even at the same slider. */
export const AMB_TRIM = 0.7;

export function busGains(m: MixState): BusGains {
  if (!m.enabled || m.settings.muted) return { master: 0, sfx: 0, amb: 0, music: 0 };
  const master = OUTPUT_GAIN * sliderGain(m.settings.master) * (m.calm ? CALM_MASTER : 1);
  const effects = sliderGain(m.settings.effects);
  let sfx = effects;
  let amb = effects * AMB_TRIM;
  let music = m.calm ? 0 : sliderGain(m.settings.music);
  if (m.paused) {
    sfx *= PAUSE_DUCK.sfx;
    amb *= PAUSE_DUCK.amb;
    music *= PAUSE_DUCK.music;
  }
  if (m.speaking) {
    sfx *= SPEECH_DUCK.sfx;
    amb *= SPEECH_DUCK.amb;
    music *= SPEECH_DUCK.music;
  }
  if (m.duck) {
    sfx *= MOMENT_DUCK.sfx;
    amb *= MOMENT_DUCK.amb;
    music *= MOMENT_DUCK.music;
  }
  return { master, sfx, amb, music };
}

/** Whether the music should play at all: never in calm mode, never with its slider at zero. */
export function musicWanted(m: MixState): boolean {
  return m.enabled && !m.settings.muted && !m.calm && m.settings.music > 0 && m.settings.master > 0;
}

/** How often the little ambient details come, as a multiplier on their gaps: calm halves them. */
export function detailSpacing(calm: boolean): number {
  return calm ? 2 : 1;
}
