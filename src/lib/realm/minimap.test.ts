import { describe, it, expect } from "vitest";
import { worldBounds, projectToMap, minimapView } from "./minimap";
import { buildWorldLayout } from "./layout";
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
    const far = { ...layout.props[0], position: { x: layout.spawn.x - 30, z: layout.spawn.z - 30 } };
    const b = worldBounds({ ...layout, props: [far] });
    expect(layout.spawn.x).toBeGreaterThanOrEqual(b.minX);
    expect(layout.spawn.x).toBeLessThanOrEqual(b.maxX);
    expect(layout.spawn.z).toBeGreaterThanOrEqual(b.minZ);
    expect(layout.spawn.z).toBeLessThanOrEqual(b.maxZ);
    // ...and the dot really lands inside the map rather than clamped onto its edge.
    const dot = projectToMap(layout.spawn, b);
    expect(dot.x).toBeLessThan(1);
    expect(dot.y).toBeLessThan(1);
  });

  it("is never degenerate, so a one-prop world cannot divide by zero", () => {
    const b = worldBounds({ ...layout, props: [layout.props[0]] });
    expect(b.maxX).toBeGreaterThan(b.minX);
    expect(b.maxZ).toBeGreaterThan(b.minZ);
  });
});

describe("projectToMap", () => {
  const b = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

  it("puts the centre at the centre and the corners at the corners", () => {
    expect(projectToMap({ x: 0, z: 0 }, b)).toEqual({ x: 0.5, y: 0.5 });
    expect(projectToMap({ x: -10, z: -10 }, b)).toEqual({ x: 0, y: 0 });
    expect(projectToMap({ x: 10, z: 10 }, b)).toEqual({ x: 1, y: 1 });
  });

  it("clamps a point outside the bounds instead of drawing off the map", () => {
    expect(projectToMap({ x: -999, z: 999 }, b)).toEqual({ x: 0, y: 1 });
  });
});

describe("minimapView", () => {
  it("fills a raised site and leaves an unbuilt one hollow, reading the kind the layout already set", () => {
    const view = minimapView(base);
    const mill = view.dots.find((d) => d.id === "mill");
    expect(mill).toMatchObject({ kind: "site", filled: true });
    expect(view.dots.find((d) => d.id === "bridge")).toMatchObject({ kind: "site", filled: false });
  });

  it("draws the objective as its own kind rather than as another site", () => {
    const view = minimapView(base);
    expect(view.dots.find((d) => d.id === "well")).toMatchObject({ kind: "objective" });
    expect(view.dots.filter((d) => d.id === "well")).toHaveLength(1); // never both
  });

  it("carries the hero's facing as an angle the component can rotate a tick by", () => {
    expect(minimapView({ ...base, facing: "n" }).hero.angle).toBe(0);
    expect(minimapView({ ...base, facing: "s" }).hero.angle).toBeCloseTo(Math.PI);
  });

  it("puts a trouble on the map at full, and never a villager, path or decor prop", () => {
    const view = minimapView({ ...base, troubles: [{ id: "t1", position: { x: 1, z: 1 } }] });
    expect(view.dots.some((d) => d.kind === "trouble" && d.id === "t1")).toBe(true);
    expect(view.dots.every((d) => !d.id.startsWith("decor-") && !d.id.startsWith("villager-"))).toBe(true);
  });

  it("drops sites and troubles under objectiveOnly, and keeps the hero and the objective", () => {
    const view = minimapView({ ...base, surfaces: simple, troubles: [{ id: "t1", position: { x: 1, z: 1 } }] });
    expect(view.dots.some((d) => d.kind === "site")).toBe(false);
    expect(view.dots.some((d) => d.kind === "trouble")).toBe(false);
    expect(view.dots.some((d) => d.kind === "objective")).toBe(true);
    expect(view.hero).toBeTruthy();
  });

  it("draws a map with no objective at all rather than throwing", () => {
    const none = buildWorldLayout({ castleType: "campsite", buildings: PROGRESS });
    const view = minimapView({ ...base, layout: none });
    expect(view.dots.some((d) => d.kind === "objective")).toBe(false);
    expect(view.dots.some((d) => d.kind === "site")).toBe(true);
  });
});
