import { describe, it, expect } from "vitest";
import { buildWorldLayout, CASTLE_FOOTPRINTS, BUILDING_SLOTS, WORLD_SIZE, CASTLE_POSITION, SPAWN } from "./layout";

describe("buildWorldLayout", () => {
  it("places a castle scaled to its tier, defaulting unknown tiers to a campsite", () => {
    const citadel = buildWorldLayout({ castleType: "citadel", builtBuildingIds: [] });
    const camp = buildWorldLayout({ castleType: "campsite", builtBuildingIds: [] });
    const unknown = buildWorldLayout({ castleType: "moon-base", builtBuildingIds: [] });
    const c = citadel.props.find((p) => p.kind === "castle")!;
    expect(c.position).toEqual(CASTLE_POSITION);
    expect(c.size).toEqual(CASTLE_FOOTPRINTS.citadel);
    expect(c.size.h).toBeGreaterThan(camp.props.find((p) => p.kind === "castle")!.size.h);
    expect(unknown.props.find((p) => p.kind === "castle")!.size).toEqual(CASTLE_FOOTPRINTS.campsite);
  });

  it("shows only built buildings, at their slots, and ignores unknown or repeated ids", () => {
    const layout = buildWorldLayout({ castleType: "keep", builtBuildingIds: ["well", "library", "well", "nope"] });
    const buildings = layout.props.filter((p) => p.kind === "building");
    expect(buildings.map((b) => b.id).sort()).toEqual(["library", "well"]);
    expect(buildings.find((b) => b.id === "well")!.position).toEqual(BUILDING_SLOTS.well);
    expect(buildings.find((b) => b.id === "well")!.label).toBe("Village Well");
  });

  it("lays a walkable path from the gate to the castle and keeps it out of the colliders", () => {
    const layout = buildWorldLayout({ castleType: "castle", builtBuildingIds: [] });
    const path = layout.props.filter((p) => p.kind === "path");
    expect(path.length).toBeGreaterThan(5);
    for (const tile of path) expect(tile.solid).toBe(false);
    expect(layout.colliders.every((c) => c.solid)).toBe(true);
    expect(layout.colliders.some((c) => c.kind === "path")).toBe(false);
    expect(Math.max(...path.map((p) => p.position.z))).toBe(17);
  });

  it("spawns inside the world, south of the castle", () => {
    const layout = buildWorldLayout({ castleType: "campsite", builtBuildingIds: [] });
    expect(layout.spawn).toEqual(SPAWN);
    expect(Math.abs(layout.spawn.z)).toBeLessThan(WORLD_SIZE / 2);
    expect(layout.spawn.z).toBeGreaterThan(CASTLE_POSITION.z);
  });

  it("gives every building slot a home inside the world", () => {
    for (const slot of Object.values(BUILDING_SLOTS)) {
      expect(Math.abs(slot.x)).toBeLessThan(WORLD_SIZE / 2 - 2);
      expect(Math.abs(slot.z)).toBeLessThan(WORLD_SIZE / 2 - 2);
    }
  });
});
