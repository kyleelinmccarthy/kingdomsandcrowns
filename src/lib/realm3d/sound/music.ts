/**
 * THE MUSIC: a few bars on a kalimba, now and then, and a lot of quiet in between.
 *
 * The decision, argued once. A looping track is the one sound a parent in the next room will
 * come to hate — the same eight bars, every thirty seconds, for an hour — and a child stops
 * hearing it at all after the third time round, which is worse than useless. Silence throughout
 * is honest but leaves the Realm feeling unfinished; the owner's bar is a game kids want to play.
 *
 * So the music here works the way the quiet games do: a short phrase — two call-and-answer
 * lines over four soft bass notes, about fourteen seconds — then nothing but the world for most
 * of a minute, then a different phrase. Every phrase is generated from a seed (so it is
 * deterministic and testable), always in C major pentatonic (so it can never clash with itself
 * or with any sound effect, which are all in the same key), slow, low in the mix, and on its own
 * slider. Calm mode has no music at all, and it ducks under speech and the pause menu.
 *
 * Nothing here touches the audio clock: `composePhrase` is notes as data, and `renderPhrase`
 * turns them into one buffer the engine plays as one voice.
 */

import { Builder, finish, makeRng, Reverb } from "./dsp";
import { hz, kalimba } from "./recipes";

/** Tempo: slow, a lullaby's walk. */
export const MUSIC_BPM = 72;
const EIGHTH = 60 / MUSIC_BPM / 2;

/** The melody's scale: C major pentatonic from C4 to E5, as MIDI. */
export const MELODY = [60, 62, 64, 67, 69, 72, 74, 76] as const;

/** Four-bar progressions, as bass roots (MIDI). All diatonic to C, all gentle. */
const PROGRESSIONS: readonly (readonly number[])[] = [
  [48, 45, 41, 43], // C  Am F  G
  [48, 41, 48, 43], // C  F  C  G
  [45, 41, 48, 43], // Am F  C  G
  [41, 48, 43, 48], // F  C  G  C
];

/** Which pitch classes sound good on top of each bass root: the chord's own tones. */
const CHORD_TONES: Record<number, readonly number[]> = {
  0: [0, 4, 7], // C
  9: [9, 0, 4], // Am
  5: [5, 9, 0], // F (A and C are in the scale; F itself is not in the melody's)
  7: [7, 11, 2], // G (D is in the scale)
};

/** Two-bar rhythms, in eighths: 1 plays a note. Sparse on purpose — five to seven notes. */
const RHYTHMS: readonly (readonly number[])[] = [
  [1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0],
  [1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0],
  [1, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0],
  [1, 0, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 0],
];

export type MusicNote = { t: number; midi: number; vel: number; kind: "melody" | "bass" };
export type Phrase = { seed: number; seconds: number; notes: MusicNote[] };

function nearestChordTone(idx: number, root: number): number {
  const tones = CHORD_TONES[root % 12] ?? [0, 4, 7];
  let best = idx;
  let bestD = 99;
  for (let i = 0; i < MELODY.length; i++) {
    if (!tones.includes(MELODY[i] % 12)) continue;
    const d = Math.abs(i - idx);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * One appearance of the music, as notes. Deterministic in `seed`. The melody is a gentle random
 * walk over the scale that prefers steps to leaps, lands on a chord tone on each bar's first
 * note, and ends the answering line on the tonic, so every phrase sounds finished.
 */
export function composePhrase(seed: number): Phrase {
  const rng = makeRng(seed ^ 0x5eed);
  const prog = PROGRESSIONS[Math.floor(rng() * PROGRESSIONS.length)];
  const notes: MusicNote[] = [];
  const bar = EIGHTH * 8;
  // The bass: one soft note per bar, held.
  prog.forEach((root, i) => notes.push({ t: i * bar, midi: root, vel: 0.9, kind: "bass" }));
  let idx = 2 + Math.floor(rng() * 3);
  for (let line = 0; line < 2; line++) {
    const rhythm = RHYTHMS[Math.floor(rng() * RHYTHMS.length)];
    const hits: number[] = [];
    rhythm.forEach((on, i) => on && hits.push(i));
    hits.forEach((e, n) => {
      const barIdx = line * 2 + (e >= 8 ? 1 : 0);
      const root = prog[barIdx];
      const prev = idx;
      const r = rng();
      const move = r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.82 ? 2 : r < 0.94 ? -2 : 0;
      idx = Math.max(0, Math.min(MELODY.length - 1, idx + move));
      const first = n === 0 || (e >= 8 && hits[n - 1] < 8);
      if (first) idx = nearestChordTone(idx, root);
      const last = line === 1 && n === hits.length - 1;
      // Home, to whichever C is nearer the note before it: never a leap of an octave to get there.
      if (last) idx = Math.abs(prev - 5) <= Math.abs(prev - 0) ? 5 : 0;
      notes.push({ t: line * 2 * bar + e * EIGHTH, midi: MELODY[idx], vel: 0.7 + 0.3 * rng() * (first ? 1 : 0.8), kind: "melody" });
    });
  }
  notes.sort((a, b) => a.t - b.t);
  return { seed, seconds: 4 * bar + 3, notes };
}

/** The music's sample rate: a kalimba's highest partial here is under 4 kHz. */
export const MUSIC_RATE = 22050;

/**
 * The phrase, played — kalimba over a warm, slow bass, in a soft room — rendered a piece at a
 * time. Each `step()` does one note, or one slice of the room, a few milliseconds of work, so
 * the engine can prepare the next phrase in idle moments during the quiet between phrases and
 * never cost the game a frame. `step()` returns true when the buffer is finished.
 */
export function phraseRenderer(phrase: Phrase, rate = MUSIC_RATE): { step: () => boolean; result: () => { data: Float32Array; rate: number } } {
  const b = new Builder(rate, phrase.seconds, phrase.seed, false);
  const bar = EIGHTH * 8;
  const room = new Reverb(rate, 0.28, 1.3);
  const slice = rate * 2;
  let note = 0;
  let wet = 0;
  let done = false;
  const step = (): boolean => {
    if (done) return true;
    if (note < phrase.notes.length) {
      const n = phrase.notes[note++];
      if (n.kind === "bass") {
        b.tone({ start: n.t, dur: bar * 1.25, freq: hz(n.midi), amp: 0.13 * n.vel, wave: "warm", swell: { attack: 0.35, release: bar * 0.7 } });
        b.tone({ start: n.t, dur: bar * 1.25, freq: hz(n.midi + 7), amp: 0.05 * n.vel, swell: { attack: 0.5, release: bar * 0.7 } });
      } else {
        kalimba(b, n.t, n.midi, 0.32 * n.vel, 0.75);
      }
      return false;
    }
    if (wet < b.buf.length) {
      const to = Math.min(b.buf.length, wet + slice);
      room.run(b.buf, wet, to);
      wet = to;
      return false;
    }
    finish(b.buf, rate, { level: 0.3, lowpass: 3200, fadeOut: 0.8 });
    done = true;
    return true;
  };
  return { step, result: () => ({ data: b.buf, rate }) };
}

/** The whole phrase at once: for tests and the sound board. */
export function renderPhrase(phrase: Phrase, rate = MUSIC_RATE): { data: Float32Array; rate: number } {
  const r = phraseRenderer(phrase, rate);
  while (!r.step()) {
    /* keep going */
  }
  return r.result();
}

/** Seconds of quiet before the next phrase: most of a minute, never the same twice. */
export function musicGap(seed: number): number {
  const rng = makeRng(seed ^ 0x9a9);
  return 38 + rng() * 40;
}

/** The first phrase waits until the child has had a little while in the world. */
export const FIRST_MUSIC_S = 18;
