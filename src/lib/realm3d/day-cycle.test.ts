import { describe, expect, it } from "vitest";
import { brightness, GROUND_FLOOR, hourFrom, lightAt, localHour, makeDayLight, NIGHT_FLOOR } from "./day-cycle";

const hex = (h: string) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
const light = (hour: number) => lightAt(hour, makeDayLight());
const close = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => {
  expect(a.r).toBeCloseTo(b.r, 5);
  expect(a.g).toBeCloseTo(b.g, 5);
  expect(a.b).toBeCloseTo(b.b, 5);
};

describe("the hour where the family lives", () => {
  const at = new Date("2026-09-28T18:30:00Z");
  it("reads the family's zone, half-hour zones included", () => {
    expect(localHour(at, "America/Denver")).toBeCloseTo(12.5, 6);
    expect(localHour(at, "Asia/Tokyo")).toBeCloseTo(3.5, 6);
    expect(localHour(at, "Australia/Adelaide")).toBeCloseTo(4, 6);
  });

  it("falls back to this computer's own clock for no zone, an empty one, or one that is not a zone", () => {
    const own = localHour(at, null);
    expect(localHour(at, "")).toBe(own);
    expect(localHour(at, "Mars/Olympus_Mons")).toBe(own);
    expect(localHour(at, undefined)).toBe(own);
  });

  it("takes a forced hour for a screenshot only when it is a real hour", () => {
    expect(hourFrom("21")).toBe(21);
    expect(hourFrom("6.5")).toBe(6.5);
    expect(hourFrom("0")).toBe(0);
    for (const bad of ["24", "-1", "noon", "", null]) expect(hourFrom(bad)).toBeNull();
  });
});

describe("the light at each hour", () => {
  it("is the approved noon shot at noon", () => {
    const l = light(12);
    expect(l.sunI).toBeCloseTo(3.1, 6);
    close(l.sun, hex("#fff3d2"));
    close(l.skyTop, hex("#2c6fb8"));
    close(l.fog, hex("#bcdcec"));
    const n = Math.hypot(0.58, 0.44, -0.52);
    expect(l.sunDir.x).toBeCloseTo(0.58 / n, 5);
    expect(l.sunDir.y).toBeCloseTo(0.44 / n, 5);
    expect(l.lamp).toBe(1);
  });

  it("is moonlit at midnight, with the lamps up", () => {
    const l = light(0);
    close(l.sun, hex("#7aa2ff"));
    close(l.skyTop, hex("#0a1a4a"));
    expect(l.lamp).toBeCloseTo(2.4, 6);
    // Blue moonlight: the ground's bounce is navy, not a green-grey, and blue leads in every light.
    close(l.hemiGround, hex("#1a2a5c"));
    for (const c of [l.sun, l.hemiSky, l.hemiGround, l.fog]) expect(c.b).toBeGreaterThan(c.g);
  });

  it("tints the ground white at noon and blue at night, so the moon reads blue on the grass", () => {
    expect(light(12).groundTint).toEqual({ r: 1, g: 1, b: 1 });
    const n = light(0).groundTint;
    expect(n.b).toBeGreaterThan(n.g);
    expect(n.g).toBeGreaterThan(n.r);
  });

  it("reddens at dawn and at dusk", () => {
    close(light(6.25).sun, hex("#ffb27a"));
    close(light(18.75).sun, hex("#ff9a5c"));
  });

  it("never jumps: a minute changes little, and midnight joins itself", () => {
    let prev = light(0);
    for (let m = 1; m <= 24 * 60; m++) {
      const next = light(m / 60);
      expect(Math.abs(next.sunI - prev.sunI)).toBeLessThan(0.05);
      expect(Math.abs(next.skyTop.b - prev.skyTop.b)).toBeLessThan(0.02);
      for (const c of ["r", "g", "b"] as const) expect(Math.abs(next.groundTint[c] - prev.groundTint[c]), `groundTint.${c}`).toBeLessThan(0.02);
      prev = next;
    }
    expect(light(23.9999).sunI).toBeCloseTo(light(0).sunI, 3);
  });

  it("keeps the night playable: never darker than the floor's share of noon", () => {
    const noon = brightness(light(12));
    for (let h = 0; h < 24; h += 0.25) expect(brightness(light(h)) / noon).toBeGreaterThanOrEqual(NIGHT_FLOOR);
  });

  it("keeps the lit ground playable: light times the tint's linear luminance stays a share of noon's", () => {
    const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const lum = (t: { r: number; g: number; b: number }) => 0.2126 * linear(t.r) + 0.7152 * linear(t.g) + 0.0722 * linear(t.b);
    const noon = brightness(light(12)) * lum(light(12).groundTint);
    for (let h = 0; h < 24; h += 0.25) {
      const l = light(h);
      expect((brightness(l) * lum(l.groundTint)) / noon, `hour ${h}`).toBeGreaterThanOrEqual(GROUND_FLOOR);
    }
  });

  it("keeps the sun's direction a unit vector at every hour", () => {
    for (let h = 0; h < 24; h += 0.5) {
      const d = light(h).sunDir;
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6);
    }
  });
});
