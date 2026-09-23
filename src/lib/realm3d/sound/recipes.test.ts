import { describe, expect, it } from "vitest";
import { stats } from "./dsp";
import { ALL_SOUNDS, BEDS, DETAILS, EFFECTS, ELEMENTS, FIXTURES, isBed, recipeFor, renderSound, SURFACES, variantsOf, type SoundId } from "./recipes";
import { composePhrase, MELODY, musicGap, renderPhrase } from "./music";

/** Energy above `hz`, as a fraction, by a crude one-pole split: enough to compare two takes. */
function brightness(data: Float32Array, rate: number, hz: number): number {
  const a = Math.exp((-2 * Math.PI * hz) / rate);
  let lp = 0;
  let hi = 0;
  let all = 0;
  for (let i = 0; i < data.length; i++) {
    lp = a * lp + (1 - a) * data[i];
    const h = data[i] - lp;
    hi += h * h;
    all += data[i] * data[i];
  }
  return all > 0 ? hi / all : 0;
}

describe("the catalogue", () => {
  it("has a recipe for every sound the game asks for, and names each once", () => {
    expect(new Set(ALL_SOUNDS).size).toBe(ALL_SOUNDS.length);
    expect(ALL_SOUNDS.length).toBe(EFFECTS.length + DETAILS.length + BEDS.length);
    for (const id of ALL_SOUNDS) expect(() => recipeFor(id)).not.toThrow();
    // Every element charges and releases, every surface has a footfall, every room's thing a sound.
    for (const e of ELEMENTS) {
      expect(EFFECTS).toContain(`charge-${e}`);
      expect(EFFECTS).toContain(`release-${e}`);
    }
    for (const s of SURFACES) expect(EFFECTS).toContain(`step-${s}`);
    for (const f of FIXTURES) expect(EFFECTS).toContain(`fixture-${f}`);
  });
});

describe("every sound, rendered", () => {
  const rendered = ALL_SOUNDS.map((id) => ({ id, ...renderSound(id) }));

  it("is finite, never clips, and sits at its own level", () => {
    for (const r of rendered) {
      const s = stats(r.data, r.rate);
      expect(Number.isFinite(s.peak), r.id).toBe(true);
      expect(s.peak, r.id).toBeGreaterThan(0.01);
      expect(s.peak, r.id).toBeLessThanOrEqual(recipeFor(r.id).level + 1e-6);
      expect(Math.abs(s.dc), r.id).toBeLessThan(0.01);
    }
  });

  it("starts and ends in silence (no clicks), except the loops, which are seamless", () => {
    for (const r of rendered) {
      const s = stats(r.data, r.rate);
      if (isBed(r.id)) {
        // The loop point: the last sample runs into the first as smoothly as any two neighbours.
        const seam = Math.abs(r.data[r.data.length - 1] - r.data[0]);
        expect(seam, r.id).toBeLessThanOrEqual(s.maxStep + 1e-6);
      } else {
        expect(s.edge, r.id).toBeLessThan(1e-3);
      }
    }
  });

  it("is short, except the beds and the bell", () => {
    for (const r of rendered) {
      const seconds = r.data.length / r.rate;
      if (isBed(r.id)) expect(seconds, r.id).toBeGreaterThanOrEqual(7);
      else expect(seconds, r.id).toBeLessThan(5);
    }
    const step = rendered.find((r) => r.id === "step-grass")!;
    expect(step.data.length / step.rate).toBeLessThan(0.4);
  });

  it("puts the footsteps well under everything a child is meant to notice", () => {
    const level = (id: SoundId) => recipeFor(id).level;
    for (const s of SURFACES) {
      expect(level(`step-${s}`)).toBeLessThan(level("trouble-clear"));
      expect(level(`step-${s}`)).toBeLessThan(level("complete"));
    }
    expect(level("prompt")).toBeLessThan(level("talk"));
    expect(level("deed-wrong")).toBeLessThan(level("deed-right"));
  });
});

describe("determinism and variety", () => {
  it("renders the same samples every time", () => {
    const a = renderSound("trouble-clear");
    const b = renderSound("trouble-clear");
    expect(a.data).toEqual(b.data);
  });

  it("gives a footstep several different takes", () => {
    expect(variantsOf("step-grass")).toBeGreaterThan(1);
    const one = renderSound("step-grass", { variant: 0 }).data;
    const two = renderSound("step-grass", { variant: 1 }).data;
    expect(one).not.toEqual(two);
  });
});

describe("calm mode", () => {
  it("is quieter and softer", () => {
    for (const id of ["release-light", "trouble-clear", "complete", "step-grass"] as const) {
      const loud = renderSound(id);
      const calm = renderSound(id, { calm: true });
      expect(stats(calm.data, calm.rate).peak, id).toBeLessThan(stats(loud.data, loud.rate).peak);
      expect(brightness(calm.data, calm.rate, 3000), id).toBeLessThanOrEqual(brightness(loud.data, loud.rate, 3000) + 1e-9);
    }
  });
});

describe("the music", () => {
  it("is a different phrase each time, the same for the same seed", () => {
    expect(composePhrase(4)).toEqual(composePhrase(4));
    expect(composePhrase(4).notes).not.toEqual(composePhrase(5).notes);
  });

  it("stays in the pentatonic scale and ends at home, on C", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = composePhrase(seed);
      const melody = p.notes.filter((n) => n.kind === "melody");
      expect(melody.length).toBeGreaterThanOrEqual(8);
      for (const n of melody) expect(MELODY).toContain(n.midi);
      expect(melody[melody.length - 1].midi % 12).toBe(0);
      // Steps, mostly: no leap wider than a sixth.
      for (let i = 1; i < melody.length; i++) expect(Math.abs(melody[i].midi - melody[i - 1].midi)).toBeLessThanOrEqual(9);
    }
  });

  it("leaves most of a minute of quiet between phrases", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(musicGap(seed)).toBeGreaterThanOrEqual(38);
      expect(musicGap(seed)).toBeLessThanOrEqual(78);
    }
  });

  it("renders to a quiet, clean buffer", () => {
    const r = renderPhrase(composePhrase(2));
    const s = stats(r.data, r.rate);
    expect(s.peak).toBeLessThanOrEqual(0.35);
    expect(s.edge).toBeLessThan(1e-3);
    expect(s.seconds).toBeGreaterThan(10);
    expect(s.seconds).toBeLessThan(20);
  });
});
