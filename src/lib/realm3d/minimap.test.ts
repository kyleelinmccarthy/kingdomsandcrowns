import { describe, expect, it } from "vitest";
import { PLACES } from "@/lib/realm/layout";
import {
  BAKE_N,
  headingDegrees,
  insideMap,
  LEAVE_FACTOR,
  makeMapPoint,
  makeRimMark,
  mapPoint,
  mapShade,
  MAP_WINDOW,
  placeAt,
  rimMark,
} from "./minimap";

const deg = (d: number) => ((d % 360) + 360) % 360;

describe("world to map", () => {
  it("puts the point the map is centred on in the middle of it", () => {
    const p = mapPoint(makeMapPoint(), 40, -120, 40, -120);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(0.5);
  });

  /**
   * The whole reason this is not a port of the flat Realm's `worldToMap`: that function had a
   * 45° rotation baked in (`MAP_TILT`) because its camera's screen axes were the world axes
   * turned. Here the map is north-up in the world's own x/z, so east is right and south is
   * down, with no basis change at all.
   */
  it("is north-up in the world's own axes: +x right, +z down, no tilt", () => {
    const east = mapPoint(makeMapPoint(), 60, 0, 0, 0);
    const south = mapPoint(makeMapPoint(), 0, 60, 0, 0);
    expect(east.x).toBeGreaterThan(0.5);
    expect(east.y).toBeCloseTo(0.5);
    expect(south.y).toBeGreaterThan(0.5);
    expect(south.x).toBeCloseTo(0.5);
  });

  it("shows exactly MAP_WINDOW units across", () => {
    const edge = mapPoint(makeMapPoint(), MAP_WINDOW / 2, 0, 0, 0);
    expect(edge.x).toBeCloseTo(1);
  });

  it("does NOT clamp, so a rim arrow can still be pointed at the truth", () => {
    const far = mapPoint(makeMapPoint(), 3000, 0, 0, 0);
    expect(far.x).toBeGreaterThan(1);
  });

  it("allocates nothing", () => {
    const out = makeMapPoint();
    expect(mapPoint(out, 1, 2, 0, 0)).toBe(out);
  });
});

describe("insideMap", () => {
  it("knows the square, and the square inset", () => {
    expect(insideMap({ x: 0.5, y: 0.5 })).toBe(true);
    expect(insideMap({ x: 1.2, y: 0.5 })).toBe(false);
    expect(insideMap({ x: 0.04, y: 0.5 }, 0.07)).toBe(false);
    expect(insideMap({ x: 0.5, y: 0.5 }, 0.07)).toBe(true);
  });
});

describe("which way the hero arrow points", () => {
  it("turns a facing of +z into a glyph pointing down the map", () => {
    expect(deg(headingDegrees(0))).toBeCloseTo(180);
  });

  it("puts east on the right and west on the left, the way the world has them", () => {
    expect(deg(headingDegrees(Math.PI / 2))).toBeCloseTo(90);
    expect(deg(headingDegrees(-Math.PI / 2))).toBeCloseTo(270);
  });

  it("turns north up the map", () => {
    expect(deg(headingDegrees(Math.PI))).toBeCloseTo(0);
  });

  /**
   * The property that matters more than any single angle: the glyph must turn the same way
   * round the map as the child turns in the world, with no mirror anywhere.
   */
  it("agrees with the direction it is derived from at every angle", () => {
    for (let f = -Math.PI; f < Math.PI; f += 0.3) {
      const a = (headingDegrees(f) * Math.PI) / 180;
      // A glyph drawn pointing up, rotated clockwise by `a`, points at (sin a, -cos a).
      expect(Math.sin(a)).toBeCloseTo(Math.sin(f)); // east/west
      expect(-Math.cos(a)).toBeCloseTo(Math.cos(f)); // north/south
    }
  });
});

describe("rim arrows", () => {
  it("says nothing for something comfortably on the map", () => {
    const r = rimMark(makeRimMark(), { x: 0.5, y: 0.5 }, 0.07);
    expect(r.off).toBe(false);
  });

  it("pins an off-map point to the rim circle", () => {
    const r = rimMark(makeRimMark(), { x: 4, y: 0.5 }, 0.07);
    expect(r.off).toBe(true);
    expect(Math.hypot(r.x - 0.5, r.y - 0.5)).toBeCloseTo(0.5 - 0.07);
  });

  it("points at where the thing really is, not at the corner it was squashed into", () => {
    // Due north, a very long way: the arrow must point straight up the map.
    const north = rimMark(makeRimMark(), { x: 0.5, y: -9 }, 0.07);
    expect(deg(north.angle)).toBeCloseTo(0);
    const east = rimMark(makeRimMark(), { x: 9, y: 0.5 }, 0.07);
    expect(deg(east.angle)).toBeCloseTo(90);
    const south = rimMark(makeRimMark(), { x: 0.5, y: 9 }, 0.07);
    expect(deg(south.angle)).toBeCloseTo(180);
  });

  it("agrees with the hero arrow about what an angle means", () => {
    // Something due south of the child, off the map: its rim arrow and the arrow of a child
    // WALKING due south must point the same way.
    const r = rimMark(makeRimMark(), { x: 0.5, y: 9 }, 0.07);
    expect(deg(r.angle)).toBeCloseTo(deg(headingDegrees(0)));
  });

  it("allocates nothing", () => {
    const out = makeRimMark();
    expect(rimMark(out, { x: 9, y: 9 }, 0.07)).toBe(out);
  });
});

describe("standing in a named place", () => {
  const places = [
    { id: "a", position: { x: 0, z: 0 }, radius: 10 },
    { id: "far", position: { x: 80, z: 0 }, radius: 10 },
  ];

  it("is nowhere until the hero is inside one", () => {
    expect(placeAt({ x: 40, z: 40 }, places, null)).toBeNull();
    expect(placeAt({ x: 10.1, z: 0 }, places, null)).toBeNull();
    expect(placeAt({ x: 9.9, z: 0 }, places, null)).toBe("a");
  });

  it("holds on past the rim, so shuffling on the edge does not re-arrive for ever", () => {
    const justOut = 10 * LEAVE_FACTOR - 0.1;
    expect(placeAt({ x: justOut, z: 0 }, places, null)).toBeNull();
    expect(placeAt({ x: justOut, z: 0 }, places, "a")).toBe("a");
  });

  it("lets go once the hero is properly clear", () => {
    expect(placeAt({ x: 10 * LEAVE_FACTOR + 0.1, z: 0 }, places, "a")).toBeNull();
  });

  it("gives the nearest when two overlap", () => {
    const pair = [
      { id: "a", position: { x: 0, z: 0 }, radius: 10 },
      { id: "b", position: { x: 14, z: 0 }, radius: 10 },
    ];
    expect(placeAt({ x: 9, z: 0 }, pair, null)).toBe("b");
    expect(placeAt({ x: 3, z: 0 }, pair, null)).toBe("a");
  });

  it("works on the realm's own authored places", () => {
    const ringstones = PLACES[0];
    expect(placeAt(ringstones.position, PLACES, null)).toBe(ringstones.id);
    for (const p of PLACES) expect(placeAt(p.position, PLACES, null)).toBe(p.id);
  });
});

describe("the baked land", () => {
  it("bakes at a resolution finer than the window it is shown through", () => {
    // 160 cells over 640 units is four units a cell, and the window is 240 units, so the map
    // shows 60 cells across a ~190px circle — a painted map, not a grid of squares.
    expect(640 / BAKE_N).toBeCloseTo(4);
    expect(MAP_WINDOW / (640 / BAKE_N)).toBeGreaterThan(40);
  });

  it("darkens a colour without leaving the colour", () => {
    expect(mapShade("#ffffff", 1)).toBe("rgb(255,255,255)");
    expect(mapShade("#ffffff", 0.5)).toBe("rgb(128,128,128)");
    expect(mapShade("#2c5f86", 1)).toBe("rgb(44,95,134)");
    expect(mapShade("#336699", 0)).toBe("rgb(0,0,0)");
  });
});
