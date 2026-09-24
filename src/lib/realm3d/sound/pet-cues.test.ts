import { describe, expect, it } from "vitest";
import { filterBuffer, stats } from "./dsp";
import { cueInfo } from "./cues";
import { EFFECTS, recipeFor, renderSound } from "./recipes";

/** Energy above `hz`, as a fraction, through a steep high-pass. */
function above(data: Float32Array, rate: number, hz: number): number {
  const hi = Float32Array.from(data);
  filterBuffer(hi, rate, "hp", hz);
  filterBuffer(hi, rate, "hp", hz);
  let h = 0;
  let all = 0;
  for (let i = 0; i < data.length; i++) {
    h += hi[i] * hi[i];
    all += data[i] * data[i];
  }
  return all > 0 ? h / all : 0;
}

describe("the companion's two cues", () => {
  const ids = ["pet-lead", "pet-arrive"] as const;

  it("are in the catalogue, heard as an answer (never over a building finishing), once at a time", () => {
    for (const id of ids) {
      expect(EFFECTS).toContain(id);
      expect(cueInfo(id)).toEqual({ bus: "sfx", priority: cueInfo("travel-arrive").priority, gap: 0.3, max: 1 });
      expect(cueInfo(id).priority).toBeLessThan(cueInfo("complete").priority);
    }
  });

  it("are short, soft and warm: under the fast-travel cues, nothing much above 3 kHz", () => {
    for (const id of ids) {
      const r = renderSound(id);
      const s = stats(r.data, r.rate);
      expect(r.data.length / r.rate, id).toBeLessThan(2);
      expect(recipeFor(id).level, id).toBeLessThanOrEqual(recipeFor("travel-start").level);
      expect(s.peak, id).toBeGreaterThan(0.01);
      expect(s.edge, id).toBeLessThan(1e-3);
      expect(above(r.data, r.rate, 3000), id).toBeLessThan(0.05);
    }
  });

  it("are quieter in calm mode", () => {
    for (const id of ids) {
      const loud = renderSound(id);
      const calm = renderSound(id, { calm: true });
      expect(stats(calm.data, calm.rate).peak, id).toBeLessThan(stats(loud.data, loud.rate).peak);
    }
  });

  it("are two different sounds: setting off asks, arriving answers", () => {
    expect(renderSound("pet-lead").data).not.toEqual(renderSound("pet-arrive").data);
  });
});
