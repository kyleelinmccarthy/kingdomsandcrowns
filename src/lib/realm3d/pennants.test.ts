import { describe, expect, it } from "vitest";
import { buildWorldLayout, BUILDING_SLOTS } from "@/lib/realm/layout";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { pennantSpots } from "./pennants";

const layout = buildWorldLayout({
  castleType: "castle",
  buildings: BUILDINGS.map((b) => ({ id: b.id, done: 5, total: 5, complete: b.id !== "library" })),
});
const flat = () => 2;

describe("where a gold pennant flies", () => {
  it("flies over each gilded building that stands, and nowhere else", () => {
    const spots = pennantSpots(layout.props, ["well", "mill", "library", "moon-base"], flat);
    expect(spots.map((s) => s.id)).toEqual(["well", "mill"]);
    expect(spots[0]).toMatchObject({ x: BUILDING_SLOTS.well.x, z: BUILDING_SLOTS.well.z });
  });

  it("stands above each building's roof line, measured from the ground under it", () => {
    const every = BUILDINGS.map((b) => b.id).filter((id) => id !== "library");
    const spots = new Map(pennantSpots(layout.props, every, flat).map((s) => [s.id, s]));
    // Roof tops as the scene draws them: a cottage's ridge at 5.35, the well's cap at 4.5,
    // the tower's top at 7.8, the chapel's steeple at 8.35. The garden has no roof.
    expect(spots.get("mill")!.y).toBeGreaterThanOrEqual(2 + 5.35 - 0.2);
    expect(spots.get("well")!.y).toBeGreaterThanOrEqual(2 + 4.5 - 0.2);
    expect(spots.get("watchtower")!.y).toBeGreaterThanOrEqual(2 + 7.8 - 0.2);
    expect(spots.get("chapel")!.y).toBeGreaterThanOrEqual(2 + 8.35 - 0.2);
    expect(spots.get("garden")!.y).toBe(2);
  });

  it("is nothing at all when nothing is gilded", () => {
    expect(pennantSpots(layout.props, [], flat)).toEqual([]);
  });
});
