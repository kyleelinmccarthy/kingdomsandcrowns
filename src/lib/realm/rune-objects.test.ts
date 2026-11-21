import { describe, expect, it } from "vitest";
import { ANCHORS } from "./anchors";
import { PLACES, placeById } from "./layout";
import { realmWorld } from "@/lib/realm3d/worldgen";
import { edgeDistance } from "@/lib/realm3d/interact";
import { RUNE_EFFECT_IDS, RUNE_OBJECTS, RUNE_RESET_DAYS, RUNE_SPOT, VILLAGE_RUNE_OBJECTS, isRuneObjectId, runeObjectById } from "./rune-objects";
import { runeSpotAt, runeSpotFailures } from "@/test/rune-spots";

const wholeWord = (word: string, text: string) => new RegExp(`(^|[^a-z])${word}([^a-z]|$)`, "i").test(text);
const placeObjects = RUNE_OBJECTS.filter((o) => o.place !== null);

describe("the rune objects' catalog", () => {
  it("has fifteen objects, prefixed, unique: two per effect in the village and one at each named place", () => {
    expect(RUNE_OBJECTS).toHaveLength(15);
    expect(new Set(RUNE_OBJECTS.map((o) => o.id)).size).toBe(15);
    for (const o of RUNE_OBJECTS) expect(o.id).toMatch(/^rune:[a-z-]+$/);
    expect(VILLAGE_RUNE_OBJECTS).toHaveLength(10);
    expect(VILLAGE_RUNE_OBJECTS.every((o) => o.place === null)).toBe(true);
    for (const e of RUNE_EFFECT_IDS) {
      expect(VILLAGE_RUNE_OBJECTS.filter((o) => o.effect === e), e).toHaveLength(2);
      expect(placeObjects.filter((o) => o.effect === e), e).toHaveLength(1);
    }
    for (const o of RUNE_OBJECTS) expect(o.resetAfterDays, o.id).toBe(4);
    expect(RUNE_RESET_DAYS).toBe(4);
    expect(RUNE_SPOT).toEqual({ radius: 0.6, reach: 1.6 });
  });

  it("has the five effects in their order", () => {
    expect(RUNE_EFFECT_IDS).toEqual(["mend", "light", "water", "open", "grow"]);
  });

  it("stands one object at each named place, inside it, on dry ground", () => {
    expect(placeObjects.map((o) => o.place).sort()).toEqual(PLACES.map((p) => p.id).sort());
    const world = realmWorld();
    for (const o of placeObjects) {
      const place = placeById(o.place!)!;
      expect(Math.hypot(o.x - place.position.x, o.z - place.position.z), o.id).toBeLessThan(place.radius);
      expect(world.waterLevelAt(o.x, o.z) - world.heightAt(o.x, o.z), `${o.id} is wet`).toBeLessThan(0);
    }
  });

  it("faces each place object toward its place", () => {
    for (const o of placeObjects) {
      const place = placeById(o.place!)!;
      const len = Math.hypot(place.position.x - o.x, place.position.z - o.z);
      expect(Math.sin(o.ry), o.id).toBeCloseTo((place.position.x - o.x) / len, 6);
      expect(Math.cos(o.ry), o.id).toBeCloseTo((place.position.z - o.z) / len, 6);
    }
  });

  it("knows an id by its own keys only", () => {
    for (const bad of ["toString", "__proto__", "constructor", "chest:west-lane", "door:longwater", "rune:nope", "", 42, null, undefined, {}]) {
      expect(isRuneObjectId(bad), String(bad)).toBe(false);
      expect(runeObjectById(bad as string), String(bad)).toBeNull();
    }
    expect(isRuneObjectId("rune:west-wagon")).toBe(true);
    for (const o of RUNE_OBJECTS) expect(runeObjectById(o.id)).toBe(o);
  });

  it("labels a village object with no trail anchor's name, so a clue can mean only the hay cart", () => {
    for (const o of VILLAGE_RUNE_OBJECTS) {
      for (const a of Object.values(ANCHORS)) {
        for (const n of a.names) {
          expect(wholeWord(n, o.label), `"${n}" is a word of ${o.id}'s label`).toBe(false);
          expect(wholeWord(n, o.fixedLabel), `"${n}" is a word of ${o.id}'s fixed label`).toBe(false);
        }
      }
    }
  });

  it("keeps labels short and clean", () => {
    for (const o of RUNE_OBJECTS) {
      for (const l of [o.label, o.fixedLabel]) {
        expect(l, o.id).toMatch(/^the /);
        expect(l.length, l).toBeLessThanOrEqual(28);
        expect(l, l).not.toMatch(/\bgrades?\b|\bkindergarten\b/i);
        expect(l, l).not.toMatch(/\b(behind|ahead)\b/i);
        expect(l, l).not.toMatch(/</);
      }
    }
  });

  it("reads a fixed object by its label without the state word (RI-a / N8)", () => {
    for (const o of RUNE_OBJECTS) {
      const m = /^the (broken|dark|cold|dry|stuck|wilted|drooping) /.exec(o.label);
      expect(m, `${o.id}'s label "${o.label}" has no state word`).not.toBeNull();
      expect(o.label.replace(m![1] + " ", ""), o.id).toBe(o.fixedLabel);
      expect(o.fixedLabel, o.id).not.toBe(o.label);
    }
  });
});

describe("every rune object clears the village and its place", () => {
  it("passes the clearance, level, track, reach and stake checks", () => {
    expect(RUNE_OBJECTS.flatMap((o) => runeSpotFailures(o))).toEqual([]);
  });

  it("stands the village's objects inside the village", () => {
    for (const o of VILLAGE_RUNE_OBJECTS) {
      expect(Math.abs(o.x), o.id).toBeLessThanOrEqual(26);
      expect(o.z, o.id).toBeGreaterThanOrEqual(-16);
      expect(o.z, o.id).toBeLessThanOrEqual(26);
    }
  });

  it("keeps every rune object out of every other's reach, so E at one means that one", () => {
    const held: string[] = [];
    for (const a of RUNE_OBJECTS) {
      for (const b of RUNE_OBJECTS) {
        if (a !== b && edgeDistance(runeSpotAt(a), b.x, b.z) <= RUNE_SPOT.reach) held.push(`${a.id} holds ${b.id}`);
      }
    }
    expect(held).toEqual([]);
  });

  it("keeps 1.0 between every pair of village objects' footprints", () => {
    const close: string[] = [];
    for (const a of VILLAGE_RUNE_OBJECTS) {
      for (const b of VILLAGE_RUNE_OBJECTS) {
        if (a === b) continue;
        const gap = Math.hypot(Math.max(0, Math.abs(a.x - b.x) - 1.4), Math.max(0, Math.abs(a.z - b.z) - 1.4));
        if (gap < 1.0) close.push(`${a.id} and ${b.id}`);
      }
    }
    expect(close).toEqual([]);
  });
});
