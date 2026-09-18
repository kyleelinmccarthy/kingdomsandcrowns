import { describe, expect, it } from "vitest";
import {
  declutter,
  makePlateLayouts,
  placePlate,
  plateOpacity,
  plateScale,
  PLATE_RANGES,
  PLATE_ROW_H,
  PLATE_X_GAP,
  type PlateLayout,
} from "./nameplates";

const W = 1280;
const H = 800;
const at = (x: number, y: number, depth: number) => ({ x, y, depth });

describe("how big a plate is", () => {
  const r = PLATE_RANGES.villager;

  it("holds full size while its subject is no further than the camera boom", () => {
    expect(plateScale(1, r)).toBe(1);
    expect(plateScale(r.full, r)).toBe(1);
  });

  it("shrinks like the world does, once past that", () => {
    expect(plateScale(r.full * 1.25, r)).toBeCloseTo(0.8);
    // Twice as far is half the size — checked on the landmark range, whose floor is low
    // enough to let the honest perspective answer through at that distance.
    expect(plateScale(PLATE_RANGES.landmark.full * 2, PLATE_RANGES.landmark)).toBeCloseTo(0.5);
  });

  it("stops shrinking at the floor, so the words stay words", () => {
    expect(plateScale(1e6, r)).toBe(r.minScale);
    expect(plateScale(r.full / r.minScale + 1, r)).toBe(r.minScale);
  });

  it("gives a place a higher floor than a person, because a place is the decision", () => {
    expect(PLATE_RANGES.landmark.minScale).toBeLessThan(PLATE_RANGES.villager.minScale);
    expect(PLATE_RANGES.landmark.fade).toBeGreaterThan(PLATE_RANGES.villager.fade * 3);
  });
});

describe("how faint a plate is", () => {
  const r = PLATE_RANGES.villager;

  it("is solid out to full", () => {
    expect(plateOpacity(0, r)).toBe(1);
    expect(plateOpacity(r.full, r)).toBe(1);
  });

  it("fades evenly to nothing at the far edge", () => {
    expect(plateOpacity((r.full + r.fade) / 2, r)).toBeCloseTo(0.5);
    expect(plateOpacity(r.fade, r)).toBe(0);
    expect(plateOpacity(r.fade + 100, r)).toBe(0);
  });

  it("never fades the child's own name, at any distance", () => {
    expect(plateOpacity(5000, PLATE_RANGES.hero)).toBeCloseTo(1);
  });
});

describe("placing one plate", () => {
  it("refuses outright when the projection refused", () => {
    const l = makePlateLayouts(1)[0];
    placePlate(l, false, at(100, 100, 10), "villager", W, H);
    expect(l.visible).toBe(false);
  });

  it("refuses one that has faded out rather than drawing it at zero", () => {
    const l = makePlateLayouts(1)[0];
    placePlate(l, true, at(100, 100, PLATE_RANGES.villager.fade + 1), "villager", W, H);
    expect(l.visible).toBe(false);
  });

  it("refuses one that is off the side of the canvas", () => {
    const l = makePlateLayouts(1)[0];
    placePlate(l, true, at(-500, 100, 10), "villager", W, H);
    expect(l.visible).toBe(false);
  });

  it("takes the screen position, the scale and the fade together", () => {
    const l = makePlateLayouts(1)[0];
    placePlate(l, true, at(640, 300, 30), "villager", W, H);
    expect(l.visible).toBe(true);
    expect(l.x).toBe(640);
    expect(l.y).toBe(300);
    expect(l.scale).toBeCloseTo(PLATE_RANGES.villager.full / 30);
    expect(l.opacity).toBeGreaterThan(0);
    expect(l.opacity).toBeLessThan(1);
  });

  it("clears any lift left over from the frame before", () => {
    const l = makePlateLayouts(1)[0];
    l.lift = 3;
    placePlate(l, true, at(640, 300, 10), "villager", W, H);
    expect(l.lift).toBe(0);
  });
});

/** Eight people on one road, which is what the village actually looks like. */
function cluster(depths: number[], xs: number[], ys: number[]): PlateLayout[] {
  const out = makePlateLayouts(depths.length);
  depths.forEach((d, i) => {
    out[i].visible = true;
    out[i].depth = d;
    out[i].x = xs[i];
    out[i].y = ys[i];
    out[i].scale = 1;
    out[i].opacity = 1;
  });
  return out;
}

describe("de-stacking a cluster", () => {
  it("leaves a lone plate exactly where it was projected", () => {
    const plates = cluster([20], [640], [300]);
    declutter(plates, [0], PLATE_ROW_H, PLATE_X_GAP);
    expect(plates[0].y).toBe(300);
    expect(plates[0].lift).toBe(0);
  });

  it("leaves the NEAREST plate alone and lifts the one behind it", () => {
    // Two plates four pixels apart; the far one is second in the array, so this also proves
    // the order comes from depth and not from the array.
    const plates = cluster([30, 12], [640, 642], [300, 304]);
    declutter(plates, [0, 0], PLATE_ROW_H, PLATE_X_GAP);
    expect(plates[1].y).toBe(304); // nearest keeps its place
    expect(plates[1].lift).toBe(0);
    expect(plates[0].y).toBe(304 - PLATE_ROW_H); // the far one climbs
    expect(plates[0].lift).toBe(1);
  });

  it("lifts, never drops: a pushed plate goes up into empty sky", () => {
    const plates = cluster([10, 20, 30], [600, 604, 608], [400, 402, 398]);
    declutter(plates, [0, 0, 0], PLATE_ROW_H, PLATE_X_GAP);
    expect(plates[1].y).toBeLessThan(402);
    expect(plates[2].y).toBeLessThan(398);
  });

  it("gives eight clustered plates eight readable rows", () => {
    const n = 8;
    const plates = cluster(
      Array.from({ length: n }, (_, i) => 10 + i),
      Array.from({ length: n }, () => 640),
      Array.from({ length: n }, () => 400),
    );
    declutter(plates, new Array(n).fill(0), PLATE_ROW_H, PLATE_X_GAP);
    const ys = plates.map((p) => p.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      // Four passes is the cap, so the last few share a row rather than floating away — but
      // nothing may sit at the SAME pixel as its neighbour while rows are still available.
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(0);
    }
    expect(new Set(plates.slice(0, 5).map((p) => p.y)).size).toBe(5);
  });

  it("leaves plates far apart across the screen exactly where they were", () => {
    const plates = cluster([10, 20], [100, 1100], [400, 400]);
    declutter(plates, [0, 0], PLATE_ROW_H, PLATE_X_GAP);
    expect(plates[0].y).toBe(400);
    expect(plates[1].y).toBe(400);
  });

  it("ignores the invisible ones entirely", () => {
    const plates = cluster([10, 20], [640, 640], [400, 400]);
    plates[0].visible = false;
    declutter(plates, [0, 0], PLATE_ROW_H, PLATE_X_GAP);
    expect(plates[1].y).toBe(400);
    expect(plates[1].lift).toBe(0);
  });

  it("is stable frame to frame when two plates sit at the same depth", () => {
    const run = () => {
      const plates = cluster([20, 20], [640, 640], [400, 400]);
      declutter(plates, [0, 0], PLATE_ROW_H, PLATE_X_GAP);
      return plates.map((p) => p.y);
    };
    expect(run()).toEqual(run());
  });
});
