import { describe, it, expect } from "vitest";
import {
  worldBounds,
  projectToMap,
  minimapView,
  mapSpan,
  mapFrame,
  mapPan,
  rimMark,
  mapDegrees,
  parseTransform,
  landKind,
  MAP_WINDOW,
  RIM_INSET,
  type MinimapBounds,
} from "./minimap";
import { buildWorldLayout, WORLD_SIZE, type Prop } from "./layout";
import { facingAngle } from "./markers";
import { surfacesFor } from "./depth";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

// SiteProgress is { id, done, total, complete } — the label comes from BUILDINGS in
// src/lib/utils/kingdom.ts, keyed by id, so these ids must be real ones ("well", "mill",
// "bridge", "chapel", "market", "library", "watchtower", "garden").
const PROGRESS = [
  { id: "well", done: 0, total: 5, complete: false },
  { id: "mill", done: 5, total: 5, complete: true },
];
const layout = buildWorldLayout({ castleType: "campsite", buildings: PROGRESS, objectiveIds: ["well"] });
const profile = DEFAULT_LEARNING_PROFILE;
const full = surfacesFor("full", profile);
const simple = surfacesFor("full", { ...profile, fewerChoices: true });
const base = { layout, hero: layout.spawn, facing: "n" as const, troubles: [] as { id: string; position: { x: number; z: number } }[], surfaces: full };

/** A prop of any kind, so the land rules can be asked about props the layout does not build yet. */
const prop = (over: Partial<Prop>): Prop => ({
  id: "x",
  kind: "decor",
  label: "",
  position: { x: 0, z: 0 },
  size: { w: 1, d: 1, h: 1 },
  color: "#fff",
  solid: false,
  ...over,
});

describe("worldBounds", () => {
  it("contains every prop and the spawn", () => {
    const b = worldBounds(layout);
    for (const p of layout.props) {
      expect(p.position.x).toBeGreaterThanOrEqual(b.minX);
      expect(p.position.x).toBeLessThanOrEqual(b.maxX);
      expect(p.position.z).toBeGreaterThanOrEqual(b.minZ);
      expect(p.position.z).toBeLessThanOrEqual(b.maxZ);
    }
    // Both ends, not just the lower one: the original pair checked `>= minX`/`>= minZ` only,
    // so half the claim in this test's own name was unguarded.
    expect(layout.spawn.x).toBeGreaterThanOrEqual(b.minX);
    expect(layout.spawn.x).toBeLessThanOrEqual(b.maxX);
    expect(layout.spawn.z).toBeGreaterThanOrEqual(b.minZ);
    expect(layout.spawn.z).toBeLessThanOrEqual(b.maxZ);
  });

  it("contains the spawn even when no prop reaches it", () => {
    // The assertions above pass whether or not `worldBounds` looks at the spawn at all: the
    // path tiles run to z=17, past SPAWN's z=15, so the props happen to enclose it. Dropping
    // the spawn from the bounds therefore survived every check — and the day the path row is
    // shortened, the hero's dot would sit clamped against the edge of the map at spawn, which
    // is the one dot a child uses to find themselves. So: a world whose only prop is nowhere
    // near the spawn, where the spawn is the extreme point and the bounds must stretch to it.
    const far = { ...layout.props[0], position: { x: layout.spawn.x - WORLD_SIZE, z: layout.spawn.z - WORLD_SIZE } };
    const b = worldBounds({ ...layout, props: [far] });
    expect(layout.spawn.x).toBeGreaterThanOrEqual(b.minX);
    expect(layout.spawn.x).toBeLessThanOrEqual(b.maxX);
    expect(layout.spawn.z).toBeGreaterThanOrEqual(b.minZ);
    expect(layout.spawn.z).toBeLessThanOrEqual(b.maxZ);
  });

  it("covers the whole square the hero can walk on, not just the props standing on it", () => {
    // `movement.ts` clamps the hero to WORLD_SIZE / 2, which is further out than any prop.
    // Bounds taken from props alone would let a child walk clean off their own map — which is
    // exactly what the old clamp inside `projectToMap` hid, by pinning the dot to the edge.
    const b = worldBounds(layout);
    const half = WORLD_SIZE / 2;
    expect(b.minX).toBeLessThanOrEqual(-half);
    expect(b.maxX).toBeGreaterThanOrEqual(half);
    expect(b.minZ).toBeLessThanOrEqual(-half);
    expect(b.maxZ).toBeGreaterThanOrEqual(half);
  });

  it("is never degenerate, so a one-prop world cannot divide by zero", () => {
    const b = worldBounds({ ...layout, props: [layout.props[0]] });
    expect(b.maxX).toBeGreaterThan(b.minX);
    expect(b.maxZ).toBeGreaterThan(b.minZ);
  });
});

describe("mapSpan", () => {
  it("shows the whole world while it fits inside the window", () => {
    const small: MinimapBounds = { minX: -15, maxX: 15, minZ: -15, maxZ: 15 };
    expect(mapSpan(small)).toBe(30);
    expect(mapFrame(small).follows).toBe(false);
  });

  it("stops zooming out at the window, and follows the hero instead", () => {
    const big: MinimapBounds = { minX: -80, maxX: 80, minZ: -80, maxZ: 80 };
    expect(mapSpan(big)).toBe(MAP_WINDOW);
    expect(mapFrame(big).follows).toBe(true);
  });

  it("takes the wider axis, so a long world is never cut off along it", () => {
    expect(mapSpan({ minX: -5, maxX: 5, minZ: -20, maxZ: 20 })).toBe(40);
  });
});

describe("projectToMap", () => {
  const b = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

  it("puts the centre at the centre and the corners at the corners", () => {
    expect(projectToMap({ x: 0, z: 0 }, b)).toEqual({ x: 0.5, y: 0.5 });
    expect(projectToMap({ x: -10, z: -10 }, b)).toEqual({ x: 0, y: 0 });
    expect(projectToMap({ x: 10, z: 10 }, b)).toEqual({ x: 1, y: 1 });
  });

  it("uses one scale on both axes, so the land keeps its shape in a world that is not square", () => {
    // The old projection divided each axis by its own span, which stretched the map: a round
    // pond in a wide world came out as an ellipse and the road bent. Ten units north is the
    // same distance on the map as ten units east, whatever shape the world is.
    const wide = { minX: -50, maxX: 50, minZ: -10, maxZ: 10 };
    const o = projectToMap({ x: 0, z: 0 }, wide);
    const east = projectToMap({ x: 10, z: 0 }, wide);
    const south = projectToMap({ x: 0, z: 10 }, wide);
    expect(east.x - o.x).toBeCloseTo(south.y - o.y, 10);
  });

  it("puts north up and east right, which is what the hero's arrow is measured against", () => {
    const o = projectToMap({ x: 0, z: 0 }, b);
    expect(projectToMap({ x: 0, z: -5 }, b).y).toBeLessThan(o.y); // world -z is north
    expect(projectToMap({ x: 5, z: 0 }, b).x).toBeGreaterThan(o.x); // world +x is east
  });

  it("does not clamp: a thing off the map keeps its true place, which is what the rim arrow needs", () => {
    const far = projectToMap({ x: -999, z: 999 }, b);
    expect(far.x).toBeLessThan(0);
    expect(far.y).toBeGreaterThan(1);
  });
});

describe("mapPan", () => {
  const fits = mapFrame({ minX: -15, maxX: 15, minZ: -15, maxZ: 15 });
  const big = mapFrame({ minX: -MAP_WINDOW, maxX: MAP_WINDOW, minZ: -MAP_WINDOW, maxZ: MAP_WINDOW });

  it("never moves a map that already holds the whole world", () => {
    expect(mapPan({ x: 0, y: 0 }, fits)).toEqual({ x: 0, y: 0 });
    expect(mapPan({ x: 1, y: 1 }, fits)).toEqual({ x: 0, y: 0 });
  });

  it("centres the hero once the world is bigger than the window", () => {
    const pan = mapPan({ x: 0.7, y: 0.2 }, big);
    expect(0.7 + pan.x).toBeCloseTo(0.5, 10);
    expect(0.2 + pan.y).toBeCloseTo(0.5, 10);
  });

  it("holds at the world's edge rather than showing void beyond it", () => {
    const pan = mapPan({ x: big.x.min, y: big.y.max }, big);
    expect(big.x.min + pan.x).toBeCloseTo(0, 10); // the hero at the far west sits on the map's west edge
    expect(big.y.max + pan.y).toBeCloseTo(1, 10);
    // ...and no land beyond the world is ever pulled into view.
    expect(big.x.min + pan.x).toBeGreaterThanOrEqual(0);
    expect(big.y.min + pan.y).toBeLessThanOrEqual(0);
  });

  it("pans per axis, so a wide shallow world scrolls sideways only", () => {
    const wide = mapFrame({ minX: -MAP_WINDOW * 2, maxX: MAP_WINDOW * 2, minZ: -5, maxZ: 5 });
    const pan = mapPan({ x: 0.9, y: 0.6 }, wide);
    expect(pan.x).not.toBe(0);
    expect(pan.y).toBe(0);
  });
});

describe("rimMark", () => {
  const pan = { x: 0, y: 0 };

  it("says nothing about a thing that is already on the map", () => {
    expect(rimMark({ x: 0.5, y: 0.5 }, pan).off).toBe(false);
  });

  it("brings a thing off the top of the map back to the rim, pointing north", () => {
    const at = rimMark({ x: 0.5, y: -3 }, pan);
    expect(at.off).toBe(true);
    expect(at.y).toBeCloseTo(RIM_INSET, 10);
    expect(at.x).toBeCloseTo(0.5, 10);
    expect(at.angle).toBeCloseTo(0, 10); // zero is up, the same convention the hero's arrow uses
  });

  it("points east for a thing off the right-hand edge, and west for one off the left", () => {
    expect(rimMark({ x: 4, y: 0.5 }, pan).angle).toBeCloseTo(Math.PI / 2, 10);
    expect(rimMark({ x: -4, y: 0.5 }, pan).angle).toBeCloseTo(-Math.PI / 2, 10);
  });

  it("is measured after the pan, so it follows the hero rather than the world", () => {
    const target = { x: 0.9, y: 0.5 };
    expect(rimMark(target, { x: 0, y: 0 }).off).toBe(false);
    // The hero walks east until the thing behind them falls off the map's western edge.
    const gone = rimMark(target, { x: -0.9, y: 0 });
    expect(gone.off).toBe(true);
    expect(gone.angle).toBeCloseTo(-Math.PI / 2, 10); // and the arrow points back west, at it
  });
});

describe("mapDegrees", () => {
  /** SVG's own rotation, so the claim below is about what a child actually sees. */
  const turn = (v: { x: number; y: number }, degrees: number) => {
    const r = (degrees * Math.PI) / 180;
    return { x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) };
  };
  const up = { x: 0, y: -1 };
  const mapPoint = (facing: "n" | "e" | "s" | "w") => turn(up, mapDegrees((facingAngle(facing) * 180) / Math.PI));

  it("turns the hero's arrow the way the hero is walking, east included", () => {
    // The bug this exists for: `facingAngle` is the ground RING's angle, and the ring is
    // rotated about X before it is spun, which mirrors east and west against a map. Used raw,
    // the map's arrow pointed west while the child walked east.
    expect(mapPoint("n").y).toBeCloseTo(-1, 10);
    expect(mapPoint("s").y).toBeCloseTo(1, 10);
    expect(mapPoint("e").x).toBeCloseTo(1, 10);
    expect(mapPoint("w").x).toBeCloseTo(-1, 10);
  });

  it("agrees with the map's own axes", () => {
    const b = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    const o = projectToMap({ x: 0, z: 0 }, b);
    const east = projectToMap({ x: 5, z: 0 }, b);
    expect(Math.sign(mapPoint("e").x)).toBe(Math.sign(east.x - o.x));
  });
});

describe("parseTransform", () => {
  it("reads the transform the scene writes", () => {
    expect(parseTransform("translate(42 17) rotate(90)")).toEqual({ x: 42, y: 17, deg: 90 });
  });

  it("reads a comma-separated translate, a negative angle and a missing one", () => {
    expect(parseTransform("translate(-4.5, 7) rotate(-180)")).toEqual({ x: -4.5, y: 7, deg: -180 });
    expect(parseTransform("translate(1 2)")).toEqual({ x: 1, y: 2, deg: 0 });
  });

  it("returns nothing rather than NaN for an attribute it cannot read", () => {
    expect(parseTransform(null)).toBeNull();
    expect(parseTransform("")).toBeNull();
    expect(parseTransform("rotate(90)")).toBeNull();
    expect(parseTransform("translate(nonsense)")).toBeNull();
  });
});

describe("landKind", () => {
  it("reads land off what a prop calls itself, so a new kind of ground needs no edit here", () => {
    expect(landKind(prop({ kind: "path", id: "path-9" }))).toBe("trail");
    expect(landKind(prop({ variant: "oak" }))).toBe("forest");
    expect(landKind(prop({ variant: "pine" }))).toBe("forest");
    expect(landKind(prop({ id: "river-3" }))).toBe("water");
    expect(landKind(prop({ id: "wheatfield-2" }))).toBe("field");
    expect(landKind(prop({ variant: "rock", id: "wild-12" }))).toBeNull();
  });

  it("never turns a landmark into ground, whatever it is called", () => {
    expect(landKind(prop({ kind: "building", id: "garden" }))).toBeNull();
    expect(landKind(prop({ kind: "foundation", id: "bridge" }))).toBeNull();
    expect(landKind(prop({ kind: "castle", id: "castle" }))).toBeNull();
    expect(landKind(prop({ kind: "villager", id: "villager-aldo" }))).toBeNull();
  });

  it("leaves out what is not land at all, so the map does not become a diagram of every prop", () => {
    expect(landKind(prop({ variant: "rock" }))).toBeNull();
    expect(landKind(prop({ variant: "fence" }))).toBeNull();
    expect(landKind(prop({ variant: "lantern" }))).toBeNull();
  });
});

describe("minimapView", () => {
  it("fills a raised site and leaves an unbuilt one hollow, reading the kind the layout already set", () => {
    const view = minimapView(base);
    const mill = view.marks.find((d) => d.id === "mill");
    expect(mill).toMatchObject({ kind: "site", filled: true });
    expect(view.marks.find((d) => d.id === "bridge")).toMatchObject({ kind: "site", filled: false });
  });

  it("draws the objective as its own kind rather than as another site", () => {
    const view = minimapView(base);
    expect(view.marks.find((d) => d.id === "well")).toMatchObject({ kind: "objective" });
    expect(view.marks.filter((d) => d.id === "well")).toHaveLength(1); // never both
    expect(view.goal).toEqual({ x: view.marks.find((d) => d.id === "well")!.x, y: view.marks.find((d) => d.id === "well")!.y });
  });

  it("puts the castle on the map, which is the thing the child is working towards", () => {
    const view = minimapView(base);
    expect(view.marks.find((d) => d.kind === "castle")).toBeTruthy();
    expect(view.home).not.toBeNull();
    expect(projectToMap({ x: 0, z: -14 }, view.bounds)).toEqual(view.home);
  });

  it("draws the land the world actually has: its water, its fields and its tracks", () => {
    const view = minimapView(base);
    const kinds = new Set(view.areas.map((a) => a.kind));
    expect(kinds.has("water")).toBe(true);
    expect(kinds.has("field")).toBe(true);
    expect(kinds.has("trail")).toBe(true); // the village cobbles and the wilderness tracks alike
    // One rectangle per terrain patch the world lists, so the map cannot drift from the ground.
    for (const t of layout.terrain) expect(view.areas.some((a) => a.id === t.id)).toBe(true);
    // Land is sized in map fractions at the map's own scale, never in world units.
    for (const a of view.areas) {
      expect(a.w).toBeGreaterThan(0);
      expect(a.w).toBeLessThanOrEqual(1);
    }
  });

  it("draws the woods as a mass rather than as one dot per tree", () => {
    const view = minimapView(base);
    const trees = layout.scenery.filter((p) => p.variant === "oak" || p.variant === "pine").length;
    const woods = view.areas.filter((a) => a.kind === "forest");
    expect(trees).toBeGreaterThan(100); // the world really is full of them
    expect(woods.length).toBeGreaterThan(10); // ...and the map really does draw the woods
    expect(woods.length).toBeLessThan(trees); // ...but never one shape per tree
    expect(woods.every((a) => a.shape === "blob")).toBe(true);
    // Nothing that is not a tree grows a canopy: a rock, a fence, a lantern and a reed are not woods.
    expect(view.areas.some((a) => a.id.includes("fence") || a.id.includes("lantern"))).toBe(false);
  });

  it("makes one wood of a stand of trees, and leaves a lone tree its own mark", () => {
    // The shapes are dropped on a grid over the world, so a thicket costs the map a handful of
    // canopies rather than one per trunk — and the canopy is wider than the grid, so they run
    // together into a mass with a soft edge instead of reading as a rash of dots.
    const tree = (x: number, z: number): Prop => prop({ id: `t${x}-${z}`, variant: "oak", position: { x, z } });
    const stand = minimapView({ ...base, layout: { ...layout, scenery: [tree(20, 20), tree(20.5, 20.4), tree(19.6, 19.8), tree(20.2, 19.5)] } });
    expect(stand.areas.filter((a) => a.kind === "forest")).toHaveLength(1);
    const two = minimapView({ ...base, layout: { ...layout, scenery: [tree(20, 20), tree(-40, -40)] } });
    expect(two.areas.filter((a) => a.kind === "forest")).toHaveLength(2);
  });

  it("puts nothing on the map twice: the land is land and the marks are marks", () => {
    const view = minimapView(base);
    expect(view.marks.every((m) => !m.id.startsWith("path-") && !m.id.startsWith("wild-") && !m.id.startsWith("trail-"))).toBe(true);
    expect(new Set(view.areas.map((a) => a.id)).size).toBe(view.areas.length);
    expect(new Set(view.marks.map((m) => m.id)).size).toBe(view.marks.length);
  });

  it("draws the tracks last, so a track over a field still reads as a track", () => {
    const view = minimapView(base);
    const order = view.areas.map((a) => a.kind);
    expect(order[order.length - 1]).toBe("trail");
    expect(order.lastIndexOf("water")).toBeLessThan(order.indexOf("trail"));
    expect(order.lastIndexOf("shore")).toBeLessThan(order.indexOf("water")); // the bank rims the water
  });

  it("carries the hero's facing as an angle the component can rotate a tick by", () => {
    expect(minimapView({ ...base, facing: "n" }).hero.angle).toBe(0);
    expect(minimapView({ ...base, facing: "s" }).hero.angle).toBeCloseTo(Math.PI);
  });

  it("puts a trouble on the map at full, and never a villager, path or decor prop", () => {
    const view = minimapView({ ...base, troubles: [{ id: "t1", position: { x: 1, z: 1 } }] });
    expect(view.marks.some((d) => d.kind === "trouble" && d.id === "t1")).toBe(true);
    expect(view.marks.every((d) => !d.id.startsWith("decor-") && !d.id.startsWith("villager-"))).toBe(true);
  });

  it("drops sites and troubles under objectiveOnly, and keeps the hero, the objective, home and the land", () => {
    const view = minimapView({ ...base, surfaces: simple, troubles: [{ id: "t1", position: { x: 1, z: 1 } }] });
    expect(view.marks.some((d) => d.kind === "site")).toBe(false);
    expect(view.marks.some((d) => d.kind === "trouble")).toBe(false);
    expect(view.marks.some((d) => d.kind === "objective")).toBe(true);
    expect(view.hero).toBeTruthy();
    // The castle and the land stay at every depth. Neither is one more choice to weigh: they
    // are what a lost child orients by, and the younger child needs them more, not less.
    expect(view.marks.some((d) => d.kind === "castle")).toBe(true);
    expect(view.areas.length).toBeGreaterThan(0);
  });

  it("draws a map with no objective at all rather than throwing", () => {
    const none = buildWorldLayout({ castleType: "campsite", buildings: PROGRESS });
    const view = minimapView({ ...base, layout: none });
    expect(view.marks.some((d) => d.kind === "objective")).toBe(false);
    expect(view.goal).toBeNull();
    expect(view.marks.some((d) => d.kind === "site")).toBe(true);
  });

  it("keeps every mark and the hero at the same scale as the land, whatever size the world is", () => {
    const view = minimapView(base);
    const frame = view.frame;
    // Whether or not the map follows, everything it draws is in one coordinate space, and the
    // world's own extent is part of the view so the map can say where the world stops.
    expect(frame.x.max).toBeGreaterThan(frame.x.min);
    expect(frame.y.max).toBeGreaterThan(frame.y.min);
    const span = Math.max(view.bounds.maxX - view.bounds.minX, view.bounds.maxZ - view.bounds.minZ);
    expect(frame.follows).toBe(span > MAP_WINDOW);
  });
});
