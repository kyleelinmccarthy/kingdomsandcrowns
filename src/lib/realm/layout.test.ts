import { describe, it, expect } from "vitest";
import { buildWorldLayout, buildingFootprint, CASTLE_FOOTPRINTS, BUILDING_SLOTS, WORLD_SIZE, CASTLE_POSITION, SPAWN, FOUNDATION_COLOR, BANNER_SIZE, BANNER_MARGIN, DECOR_SPOTS, spriteSizeFor, type Prop } from "./layout";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { REACH, VILLAGER_OFFSET } from "./villagers";
import { crownForOrdinal } from "@/lib/utils/crown-catalog";
import { LAP_WAYPOINTS } from "./recess/recess";

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

describe("decorations", () => {
  const allBuilt = BUILDINGS.map((b) => ({ id: b.id, done: b.deedsToBuild, total: b.deedsToBuild, complete: true }));
  const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

  it("places twelve fixed, non-solid decorations, or none when asked", () => {
    const layout = buildWorldLayout({ castleType: "citadel", buildings: allBuilt });
    const decor = layout.props.filter((p) => p.kind === "decor");
    expect(decor).toHaveLength(12);
    expect(decor.every((d) => !d.solid && d.label === "" && d.variant)).toBe(true);
    expect(layout.colliders.some((c) => c.kind === "decor")).toBe(false);
    expect(buildWorldLayout({ castleType: "citadel", buildings: allBuilt, decor: false }).props.some((p) => p.kind === "decor")).toBe(false);
  });

  it("keeps every decoration clear of the path, the sites, the lap ring, the ceremony plaza and the world's edge", () => {
    const layout = buildWorldLayout({ castleType: "citadel", buildings: allBuilt });
    const sites = layout.props.filter((p) => p.kind === "castle" || p.kind === "building" || p.kind === "foundation");
    const castle = layout.props.find((p) => p.kind === "castle")!;
    const south = castle.position.z + castle.size.d / 2;
    for (const spot of DECOR_SPOTS) {
      expect(Math.abs(spot.x)).toBeGreaterThanOrEqual(3.5);
      expect(Math.abs(spot.x)).toBeLessThanOrEqual(WORLD_SIZE / 2 - 2);
      expect(Math.abs(spot.z)).toBeLessThanOrEqual(WORLD_SIZE / 2 - 2);
      for (const s of sites) {
        const inside = Math.abs(spot.x - s.position.x) < s.size.w / 2 + 2 && Math.abs(spot.z - s.position.z) < s.size.d / 2 + 2;
        expect(inside).toBe(false);
      }
      for (const w of LAP_WAYPOINTS) expect(dist(spot, w)).toBeGreaterThanOrEqual(2);
      const inPlaza = Math.abs(spot.x) <= 4.5 && spot.z >= south && spot.z <= south + 8;
      expect(inPlaza).toBe(false);
    }
  });

  it("sizes sprites from footprints", () => {
    const layout = buildWorldLayout({ castleType: "keep", buildings: allBuilt });
    const castle = layout.props.find((p) => p.kind === "castle")!;
    expect(spriteSizeFor(castle)).toEqual({ w: CASTLE_FOOTPRINTS.keep.w + 1, h: CASTLE_FOOTPRINTS.keep.h + 1.5 });
    const well = layout.props.find((p) => p.id === "well")!;
    expect(spriteSizeFor(well)).toEqual({ w: 3.5, h: 3.5 });
    const oak = layout.props.find((p) => p.kind === "decor" && p.variant === "oak")!;
    expect(spriteSizeFor(oak)).toEqual({ w: 1.2, h: 1.6 });
    const rock = layout.props.find((p) => p.kind === "decor" && p.variant === "rock")!;
    expect(spriteSizeFor(rock)).toEqual({ w: 0.9, h: 0.9 });
  });
});

describe("castle tier on the layout", () => {
  it("carries the castle type so the scene can pick its figure", () => {
    expect(buildWorldLayout({ ...none, castleType: "keep" }).castleType).toBe("keep");
    expect(buildWorldLayout({ ...none, castleType: "moon-base" }).castleType).toBe("campsite");
  });
});

describe("objective focus and villager status", () => {
  // The five fields §3.14(a) freezes: spawnTroubles, the gleam placement and the ceremony read only these.
  const strip = (p: Prop) => ({ id: p.id, kind: p.kind, position: p.position, size: p.size, solid: p.solid });
  const mixed = [
    { id: "well", done: 5, total: 5, complete: true },
    { id: "mill", done: 2, total: 5, complete: false },
    { id: "bridge", done: 1, total: 5, complete: false },
    { id: "chapel", done: 0, total: 5, complete: false },
  ];

  it("adds nothing to the village: with and without objectiveIds every prop and every collider is identical", () => {
    const plain = buildWorldLayout({ castleType: "keep", buildings: mixed, banners: 3 });
    const marked = buildWorldLayout({ castleType: "keep", buildings: mixed, banners: 3, objectiveIds: ["mill", "bridge", "well"] });
    expect(marked.props.map(strip)).toEqual(plain.props.map(strip));
    expect(marked.colliders).toEqual(plain.colliders);
    expect(marked.props.length).toBe(plain.props.length);
    expect(marked.spawn).toEqual(plain.spawn);
    // spawnTroubles filters kind === "foundation": same foundations, same order, same count.
    expect(marked.props.filter((p) => p.kind === "foundation").map((p) => p.id)).toEqual(plain.props.filter((p) => p.kind === "foundation").map((p) => p.id));
    expect(marked.villagers.map((v) => v.position)).toEqual(plain.villagers.map((v) => v.position));
  });

  it("marks the first objective, tracks the rest, calls a raised site done, and leaves everything else unmarked", () => {
    const layout = buildWorldLayout({ castleType: "keep", buildings: mixed, objectiveIds: ["mill", "bridge"] });
    const site = (id: string) => layout.props.find((p) => p.id === id)!;
    const villager = (buildingId: string) => layout.villagers.find((v) => v.buildingId === buildingId)!;
    expect(site("mill").focus).toBe("objective");
    expect(villager("mill").status).toBe("objective");
    expect(site("bridge").focus).toBe("tracked");
    expect(villager("bridge").status).toBe("work");
    expect(site("well").focus).toBe("done");
    expect(villager("well").status).toBe("built");
    expect(site("chapel").focus).toBeUndefined();
    expect(villager("chapel").status).toBe("work");
    // Only sites are ever marked: never the castle, a path tile, a banner, a villager prop or a decoration.
    expect(layout.props.filter((p) => p.focus !== undefined).map((p) => p.kind).sort()).toEqual(["building", "foundation", "foundation"]);
    expect(buildWorldLayout(none).props.every((p) => p.focus === undefined)).toBe(true);
    expect(buildWorldLayout({ ...none, objectiveIds: ["nope"] }).props.some((p) => p.focus === "objective")).toBe(false);
    // A raised site is never a quest, whatever the caller asks for.
    const built = buildWorldLayout({ castleType: "keep", buildings: [{ id: "well", done: 5, total: 5, complete: true }], objectiveIds: ["well"] });
    expect(built.props.find((p) => p.id === "well")!.focus).toBe("done");
    expect(built.villagers.find((v) => v.buildingId === "well")!.status).toBe("built");
  });

  it("promotes the next open site when a completed id leads objectiveIds", () => {
    // A completed id must not consume rank 0 and leave the world with no objective at all.
    const layout = buildWorldLayout({ castleType: "keep", buildings: mixed, objectiveIds: ["well", "mill", "bridge"] });
    const site = (id: string) => layout.props.find((p) => p.id === id)!;
    expect(site("well").focus).toBe("done");
    expect(site("mill").focus).toBe("objective");
    expect(site("bridge").focus).toBe("tracked");
    expect(layout.villagers.find((v) => v.buildingId === "mill")!.status).toBe("objective");
    expect(layout.props.filter((p) => p.focus === "objective")).toHaveLength(1);
    // And the village itself is still untouched by the reordering.
    const plain = buildWorldLayout({ castleType: "keep", buildings: mixed });
    expect(layout.props.map(strip)).toEqual(plain.props.map(strip));
    expect(layout.colliders).toEqual(plain.colliders);
  });

  it("gives every villager placement its site's name and progress", () => {
    const layout = buildWorldLayout({ castleType: "keep", buildings: mixed });
    expect(layout.villagers.find((v) => v.buildingId === "well")).toMatchObject({ label: "Village Well", done: 5, total: 5, status: "built" });
    expect(layout.villagers.find((v) => v.buildingId === "mill")).toMatchObject({ label: "Grain Mill", done: 2, total: 5, status: "work" });
    expect(layout.villagers.find((v) => v.buildingId === "garden")).toMatchObject({ label: "Royal Garden", done: 0, total: 5, status: "work" });
    expect(layout.villagers.every((v) => v.total > 0 && v.label.length > 0)).toBe(true);
  });
});
