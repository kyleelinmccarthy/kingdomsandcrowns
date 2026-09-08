import { describe, it, expect } from "vitest";
import { buildWorldLayout, buildingFootprint, CASTLE_FOOTPRINTS, BUILDING_SLOTS, WORLD_SIZE, CASTLE_POSITION, SPAWN, FOUNDATION_COLOR, BANNER_SIZE, BANNER_MARGIN } from "./layout";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { REACH, VILLAGER_OFFSET } from "./villagers";
import { crownForOrdinal } from "@/lib/utils/crown-catalog";

const none = { castleType: "campsite", buildings: [] };

describe("buildWorldLayout", () => {
  it("places a castle scaled to its tier, defaulting unknown tiers to a campsite", () => {
    const citadel = buildWorldLayout({ ...none, castleType: "citadel" });
    const camp = buildWorldLayout(none);
    const unknown = buildWorldLayout({ ...none, castleType: "moon-base" });
    const c = citadel.props.find((p) => p.kind === "castle")!;
    expect(c.position).toEqual(CASTLE_POSITION);
    expect(c.size).toEqual(CASTLE_FOOTPRINTS.citadel);
    expect(c.size.h).toBeGreaterThan(camp.props.find((p) => p.kind === "castle")!.size.h);
    expect(unknown.props.find((p) => p.kind === "castle")!.size).toEqual(CASTLE_FOOTPRINTS.campsite);
  });

  it("gives every building a site: a building when complete, a foundation otherwise, missing progress meaning none", () => {
    const layout = buildWorldLayout({
      castleType: "keep",
      buildings: [
        { id: "well", done: 5, total: 5, complete: true },
        { id: "library", done: 2, total: 5, complete: false },
        { id: "nope", done: 9, total: 9, complete: true },
      ],
    });
    const buildings = layout.props.filter((p) => p.kind === "building");
    const foundations = layout.props.filter((p) => p.kind === "foundation");
    expect(buildings.map((b) => b.id)).toEqual(["well"]);
    expect(buildings[0].tag).toBe("Built");
    expect(buildings[0].solid).toBe(true);
    expect(buildings[0].position).toEqual(BUILDING_SLOTS.well);
    expect(foundations.length).toBe(BUILDINGS.length - 1);
    const library = foundations.find((f) => f.id === "library")!;
    expect(library.tag).toBe("2 of 5");
    expect(library.solid).toBe(false);
    expect(library.size).toEqual({ ...buildingFootprint("library"), h: 0.2 });
    expect(library.color).toBe(FOUNDATION_COLOR);
    expect(library.label).toBe("Library");
    const mill = foundations.find((f) => f.id === "mill")!;
    expect(mill.tag).toBe("0 of 5");
    expect(layout.props.some((p) => p.id === "nope")).toBe(false);
  });

  it("stands a villager at every site, south of the footprint, never as a collider", () => {
    const layout = buildWorldLayout({ ...none, buildings: [{ id: "well", done: 5, total: 5, complete: true }] });
    expect(layout.villagers.length).toBe(BUILDINGS.length);
    const villagerProps = layout.props.filter((p) => p.kind === "villager");
    expect(villagerProps.length).toBe(BUILDINGS.length);
    const well = layout.villagers.find((v) => v.buildingId === "well")!;
    expect(well.position).toEqual({ x: BUILDING_SLOTS.well.x, z: BUILDING_SLOTS.well.z + buildingFootprint("well").d / 2 + VILLAGER_OFFSET });
    expect(layout.props.find((p) => p.id === `villager-${well.id}`)!.label).toBe("Old Bram");
    expect(layout.colliders.some((c) => c.kind === "villager" || c.kind === "foundation")).toBe(false);
    expect(layout.colliders.map((c) => c.id).sort()).toEqual(["castle", "well"]);
    // A villager stands within reach of the walkable ground beside the site, not inside the box.
    const box = layout.props.find((p) => p.id === "well")!;
    expect(well.position.z - box.position.z).toBeGreaterThan(box.size.d / 2);
    expect(REACH).toBeGreaterThan(0);
  });

  it("omits villagers and site tags when villagers is false", () => {
    const layout = buildWorldLayout({
      castleType: "keep",
      buildings: [{ id: "well", done: 5, total: 5, complete: true }],
      villagers: false,
    });
    expect(layout.villagers.length).toBe(0);
    expect(layout.props.some((p) => p.kind === "villager")).toBe(false);
    const sites = layout.props.filter((p) => p.kind === "building" || p.kind === "foundation");
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.every((p) => p.tag === undefined)).toBe(true);
  });

  it("lays a walkable path from the gate to the castle and keeps it out of the colliders", () => {
    const layout = buildWorldLayout({ ...none, castleType: "castle" });
    const path = layout.props.filter((p) => p.kind === "path");
    expect(path.length).toBeGreaterThan(5);
    for (const tile of path) expect(tile.solid).toBe(false);
    expect(layout.colliders.every((c) => c.solid)).toBe(true);
    expect(layout.colliders.some((c) => c.kind === "path")).toBe(false);
    expect(Math.max(...path.map((p) => p.position.z))).toBe(17);
  });

  it("spawns inside the world, south of the castle", () => {
    const layout = buildWorldLayout(none);
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

describe("castle banners", () => {
  it("raises one pole per completed season in tier colours, just outside the castle, capped at eight", () => {
    const three = buildWorldLayout({ ...none, castleType: "keep", banners: 3 });
    const banners = three.props.filter((p) => p.kind === "banner");
    expect(banners.map((b) => b.color)).toEqual([crownForOrdinal(1).color, crownForOrdinal(2).color, crownForOrdinal(3).color]);
    expect(banners.map((b) => b.id)).toEqual(["banner-1", "banner-2", "banner-3"]);
    expect(banners.every((b) => !b.solid && b.label === "" && b.size.h === BANNER_SIZE.h)).toBe(true);
    const castle = three.props.find((p) => p.kind === "castle")!;
    for (const b of banners) {
      const outside = Math.max(Math.abs(b.position.x - castle.position.x) - castle.size.w / 2, Math.abs(b.position.z - castle.position.z) - castle.size.d / 2);
      expect(outside).toBeCloseTo(BANNER_MARGIN, 5);
    }
    expect(banners[0].position.x).toBeLessThan(castle.position.x); // the first pole stands on the west side
    expect(banners[0].position.z).toBeGreaterThan(castle.position.z); // toward the south-west corner
    expect(three.colliders.some((c) => c.kind === "banner")).toBe(false);
    expect(buildWorldLayout({ ...none, banners: 12 }).props.filter((p) => p.kind === "banner").length).toBe(8);
    expect(buildWorldLayout({ ...none, banners: -1 }).props.filter((p) => p.kind === "banner").length).toBe(0);
    expect(buildWorldLayout(none).props.filter((p) => p.kind === "banner").length).toBe(0);
  });
});
