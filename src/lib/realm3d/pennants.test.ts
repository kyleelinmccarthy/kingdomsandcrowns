import { describe, expect, it } from "vitest";
import { buildWorldLayout, BUILDING_SLOTS } from "@/lib/realm/layout";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { pennantSpots } from "./pennants";

const layout = buildWorldLayout({
  castleType: "castle",
  buildings: BUILDINGS.map((b) => ({ id: b.id, done: 5, total: 5, complete: b.id !== "library" })),
});
const flat = () => 2;
/** The scene's own plan (spike-scene.tsx's SITE_PLAN, WALL_H, ROOF_H). */
const plan = { sitePlan: 1.5, wallH: 3.1, roofH: 2.25 };
const prop = (id: string) => layout.props.find((p) => p.id === id && p.kind === "building")!;
const every = BUILDINGS.map((b) => b.id).filter((id) => id !== "library");
const spotsFor = (o: typeof plan) => new Map(pennantSpots(layout.props, every, flat, o).map((s) => [s.id, s]));

describe("where a gold pennant flies", () => {
  it("flies over each gilded building that stands, and nowhere else", () => {
    const spots = pennantSpots(layout.props, ["well", "mill", "library", "moon-base"], flat, plan);
    expect(spots.map((s) => s.id)).toEqual(["well", "mill"]);
    expect(spots[0]).toMatchObject({ x: BUILDING_SLOTS.well.x, z: BUILDING_SLOTS.well.z });
  });

  it("takes every height and offset from the plan it is given, so it cannot drift from the scene", () => {
    for (const o of [plan, { sitePlan: 2, wallH: 4, roofH: 3 }]) {
      const spots = spotsFor(o);
      // A cottage's pole stands on its ridge: eaves plus roof.
      expect(spots.get("mill")!.y).toBeCloseTo(2 + o.wallH + o.roofH);
      // The tower stands 1.5 times its footprint height, under a 0.3 cap.
      expect(spots.get("watchtower")!.y).toBeCloseTo(2 + prop("watchtower").size.h * 1.5 + 0.3);
      // The chapel's steeple is set off the back of the re-plotted nave.
      const chapel = prop("chapel");
      expect(spots.get("chapel")!.z).toBeCloseTo(chapel.position.z - (chapel.size.d * o.sitePlan) / 2 - 0.5);
    }
  });

  it("stands every pole on or above its roof, and the garden's in its beds", () => {
    const spots = spotsFor(plan);
    for (const id of every.filter((i) => i !== "garden")) expect(spots.get(id)!.y).toBeGreaterThan(2 + 4);
    expect(spots.get("garden")!.y).toBe(2);
  });

  it("is nothing at all when nothing is gilded", () => {
    expect(pennantSpots(layout.props, [], flat, plan)).toEqual([]);
  });
});
