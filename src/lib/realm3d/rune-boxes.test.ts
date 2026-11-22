import { describe, expect, it } from "vitest";
import { RUNE_EFFECT_IDS } from "@/lib/realm/rune-objects";
import { runeMarkBoxes, runeObjectBoxes, runeObjectPaint } from "./rune-boxes";

const top = (b: { y: number; sy: number }) => b.y + b.sy / 2;
const bottom = (b: { y: number; sy: number }) => b.y - b.sy / 2;

describe("a rune object's boxes", () => {
  it("have two to ten boxes each, inside a 1.6 by 1.6 footprint and at most 2.4 tall, broken and fixed", () => {
    for (const effect of RUNE_EFFECT_IDS) {
      for (const fixed of [false, true]) {
        const boxes = runeObjectBoxes(effect, fixed);
        const what = `${effect} ${fixed ? "fixed" : "broken"}`;
        expect(boxes.length, what).toBeGreaterThanOrEqual(2);
        expect(boxes.length, what).toBeLessThanOrEqual(10);
        for (const b of boxes) {
          expect(Math.abs(b.x) + b.sx / 2, what).toBeLessThanOrEqual(0.8 + 1e-9);
          expect(Math.abs(b.z) + b.sz / 2, what).toBeLessThanOrEqual(0.8 + 1e-9);
          expect(top(b), what).toBeLessThanOrEqual(2.4);
          expect(bottom(b), what).toBeGreaterThanOrEqual(0);
          expect(b.color, what).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it("differ between broken and fixed for every effect", () => {
    for (const effect of RUNE_EFFECT_IDS) expect(runeObjectBoxes(effect, true), effect).not.toEqual(runeObjectBoxes(effect, false));
  });

  it("hands back a fresh copy each call, so a caller cannot change the shape", () => {
    const a = runeObjectBoxes("mend", false);
    a[0].x = 99;
    expect(runeObjectBoxes("mend", false)[0].x).not.toBe(99);
  });
});

describe("the stop mark", () => {
  it("floats between 2.0 and 3.0 above the ground and is at most 0.6 across", () => {
    const boxes = runeMarkBoxes();
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(bottom(b)).toBeGreaterThanOrEqual(2.0);
      expect(top(b)).toBeLessThanOrEqual(3.0);
      expect(Math.abs(b.x) + b.sx / 2).toBeLessThanOrEqual(0.3 + 1e-9);
      expect(Math.abs(b.z) + b.sz / 2).toBeLessThanOrEqual(0.3 + 1e-9);
    }
  });
});

describe("what the painter draws for each object (runeObjectPaint, I9 carry-over: `named` and `mended`)", () => {
  const spot = (id: string, effect: "mend" | "light", fixed: boolean) => ({ id, effect, label: id, x: 1, z: 2, ry: 0.5, fixed });
  const WAGON = spot("rune:west-wagon", "mend", false);
  const LANTERN = spot("rune:lane-lantern", "light", true);
  const OTHER = spot("rune:east-barrow", "mend", false);
  const withMark = (boxes: ReturnType<typeof runeObjectBoxes>) => [...boxes, ...runeMarkBoxes()];

  it("draws each object as its record says, in place, with no mark and no walk", () => {
    expect(runeObjectPaint([WAGON, LANTERN])).toEqual([
      { id: WAGON.id, x: 1, z: 2, ry: 0.5, boxes: runeObjectBoxes("mend", false) },
      { id: LANTERN.id, x: 1, z: 2, ry: 0.5, boxes: runeObjectBoxes("light", true) },
    ]);
  });

  it("a named object wears the gold mark, a fixed one too (its rune is renewed), and an object off the walk none", () => {
    const [wagon, lantern, other] = runeObjectPaint([WAGON, LANTERN, OTHER], [WAGON.id, LANTERN.id]);
    expect(wagon.boxes).toEqual(withMark(runeObjectBoxes("mend", false)));
    expect(lantern.boxes).toEqual(withMark(runeObjectBoxes("light", true)));
    expect(other.boxes).toEqual(runeObjectBoxes("mend", false));
  });

  it("a mended object is drawn fixed whatever its record says, and loses its mark (R-I21)", () => {
    const [wagon, , other] = runeObjectPaint([WAGON, LANTERN, OTHER], [WAGON.id, LANTERN.id], [WAGON.id]);
    expect(wagon.boxes).toEqual(runeObjectBoxes("mend", true));
    expect(other.boxes).toEqual(runeObjectBoxes("mend", false));
  });

  it("draws nothing with runes off (no runes listed)", () => {
    expect(runeObjectPaint(undefined, [WAGON.id], [WAGON.id])).toEqual([]);
    expect(runeObjectPaint([])).toEqual([]);
  });
});
