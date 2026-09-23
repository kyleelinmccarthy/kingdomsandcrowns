import { describe, expect, it } from "vitest";
import { busGains, DEFAULT_SOUND, musicWanted, PAUSE_DUCK, sameSound, sliderGain, soundFrom, soundToStored, SPEECH_DUCK, type MixState } from "./settings";

const mix = (o: Partial<MixState> = {}): MixState => ({ settings: DEFAULT_SOUND, enabled: true, calm: false, paused: false, speaking: false, ...o });

describe("the stored settings", () => {
  it("start moderate: the volume at a little over half, the music under the effects", () => {
    expect(DEFAULT_SOUND.master).toBeGreaterThanOrEqual(40);
    expect(DEFAULT_SOUND.master).toBeLessThanOrEqual(70);
    expect(DEFAULT_SOUND.music).toBeLessThan(DEFAULT_SOUND.effects);
    expect(DEFAULT_SOUND.muted).toBe(false);
  });

  it("read anything at all without an error: null, junk, half an object, numbers out of range", () => {
    expect(soundFrom(null)).toEqual(DEFAULT_SOUND);
    expect(soundFrom("not json")).toEqual(DEFAULT_SOUND);
    expect(soundFrom(42)).toEqual(DEFAULT_SOUND);
    expect(soundFrom({ master: 20 })).toEqual({ ...DEFAULT_SOUND, master: 20 });
    expect(soundFrom({ master: 250, effects: -4, music: 33.6, muted: "yes" })).toEqual({ master: 100, effects: 0, music: 34, muted: false });
    expect(soundFrom(JSON.stringify({ master: 10, effects: 20, music: 30, muted: true }))).toEqual({ master: 10, effects: 20, music: 30, muted: true });
  });

  it("round-trips through the column", () => {
    const s = { master: 35, effects: 90, music: 0, muted: true };
    expect(soundFrom(soundToStored(s))).toEqual(s);
    expect(sameSound(s, { ...s })).toBe(true);
    expect(sameSound(s, { ...s, music: 5 })).toBe(false);
  });
});

describe("the mix", () => {
  it("follows the sliders on a loudness curve, so half is about half as loud", () => {
    expect(sliderGain(0)).toBe(0);
    expect(sliderGain(100)).toBe(1);
    expect(sliderGain(50)).toBeCloseTo(0.25);
  });

  it("is silent when muted, and silent when a grown-up switched sound off", () => {
    expect(busGains(mix({ settings: { ...DEFAULT_SOUND, muted: true } }))).toEqual({ master: 0, sfx: 0, amb: 0, music: 0 });
    expect(busGains(mix({ enabled: false }))).toEqual({ master: 0, sfx: 0, amb: 0, music: 0 });
    expect(musicWanted(mix({ enabled: false }))).toBe(false);
  });

  it("has no music in calm mode, and a quieter master", () => {
    const calm = busGains(mix({ calm: true }));
    const full = busGains(mix());
    expect(calm.music).toBe(0);
    expect(calm.master).toBeLessThan(full.master);
    expect(musicWanted(mix({ calm: true }))).toBe(false);
    expect(musicWanted(mix())).toBe(true);
  });

  it("ducks the music under the pause menu, and the world a little", () => {
    const open = busGains(mix({ paused: true }));
    const play = busGains(mix());
    expect(open.music).toBeCloseTo(play.music * PAUSE_DUCK.music);
    expect(open.amb).toBeLessThan(play.amb);
    expect(open.sfx).toBe(play.sfx);
  });

  it("ducks the music hardest of all under read-aloud, so a question is never buried", () => {
    const speaking = busGains(mix({ speaking: true }));
    const play = busGains(mix());
    expect(speaking.music).toBeCloseTo(play.music * SPEECH_DUCK.music);
    expect(speaking.music / play.music).toBeLessThan(speaking.amb / play.amb);
    expect(speaking.amb / play.amb).toBeLessThan(speaking.sfx / play.sfx);
    // Both at once duck further still.
    expect(busGains(mix({ speaking: true, paused: true })).music).toBeLessThan(speaking.music);
  });

  it("keeps the ambience under the effects at the same slider", () => {
    const g = busGains(mix());
    expect(g.amb).toBeLessThan(g.sfx);
  });

  it("wants no music with its slider or the volume at zero", () => {
    expect(musicWanted(mix({ settings: { ...DEFAULT_SOUND, music: 0 } }))).toBe(false);
    expect(musicWanted(mix({ settings: { ...DEFAULT_SOUND, master: 0 } }))).toBe(false);
  });
});
