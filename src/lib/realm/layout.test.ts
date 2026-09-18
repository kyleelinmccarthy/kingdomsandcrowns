import { describe, it, expect } from "vitest";
import { arrivalText, buildWorldLayout, buildingFootprint, CASTLE_FOOTPRINTS, BUILDING_SLOTS, WORLD_SIZE, VILLAGE_SIZE, CASTLE_POSITION, SPAWN, FOUNDATION_COLOR, BANNER_SIZE, BANNER_MARGIN, DECOR_SPOTS, PLACES, PLACE_LEAVE, placeAt, placeById, SCENERY, TERRAIN, spriteSizeFor, type Prop, type Vec2 } from "./layout";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { REACH, VILLAGER_OFFSET } from "./villagers";
import { HERO_RADIUS } from "./movement";
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
    // The village's own colliders; the wilderness's stone and water are asserted on their own below.
    const village = layout.colliders.filter((c) => !c.id.startsWith("wild-") && !c.id.startsWith("water-"));
    expect(village.map((c) => c.id).sort()).toEqual(["castle", "well"]);
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

  it("keeps every decoration out of `props`, where the minimap and the spawners would trip over it", () => {
    const layout = buildWorldLayout({ castleType: "citadel", buildings: allBuilt });
    expect(layout.props.some((p) => p.kind === "decor")).toBe(false);
    expect(layout.scenery.length).toBeGreaterThan(100);
    expect(layout.scenery.every((d) => d.kind === "decor" && d.label === "" && Boolean(d.variant))).toBe(true);
    // The minimap frames the world from `props`; scenery must not move that frame.
    const xs = layout.props.map((p) => Math.abs(p.position.x));
    const zs = layout.props.map((p) => Math.abs(p.position.z));
    expect(Math.max(...xs, ...zs)).toBeLessThanOrEqual(VILLAGE_SIZE / 2);
  });

  it("hands out the same arrays every time, so the memoised scene never sees a new world", () => {
    const a = buildWorldLayout({ castleType: "citadel", buildings: allBuilt });
    const b = buildWorldLayout({ castleType: "keep", buildings: [], banners: 2 });
    expect(a.scenery).toBe(b.scenery);
    expect(a.terrain).toBe(b.terrain);
    expect(a.scenery).toBe(SCENERY);
    expect(a.terrain).toBe(TERRAIN);
  });

  it("keeps the terrain when the decorations are off, and never leaves a collider nobody can see", () => {
    const bare = buildWorldLayout({ castleType: "citadel", buildings: allBuilt, decor: false });
    expect(bare.scenery).toEqual([]);
    // lowStimulus mutes the world; the water and the tracks still say where you are.
    expect(bare.terrain).toBe(TERRAIN);
    expect(bare.terrain.length).toBeGreaterThan(50);
    const invisible = bare.colliders.filter((c) => c.kind === "decor");
    expect(invisible).toEqual([]);
    // ...but the lake still stops you: it is drawn from `terrain`, which is still there.
    expect(bare.colliders.some((c) => c.id.startsWith("water-"))).toBe(true);
  });

  it("keeps the village's own twelve exactly where they were: clear of the path, the sites, the lap ring and the plaza", () => {
    const layout = buildWorldLayout({ castleType: "citadel", buildings: allBuilt });
    const sites = layout.props.filter((p) => p.kind === "castle" || p.kind === "building" || p.kind === "foundation");
    const castle = layout.props.find((p) => p.kind === "castle")!;
    const south = castle.position.z + castle.size.d / 2;
    expect(DECOR_SPOTS).toHaveLength(12);
    for (const spot of DECOR_SPOTS) {
      expect(layout.scenery.some((d) => d.position.x === spot.x && d.position.z === spot.z && d.variant === spot.kind)).toBe(true);
      expect(Math.abs(spot.x)).toBeGreaterThanOrEqual(3.5);
      expect(Math.abs(spot.x)).toBeLessThanOrEqual(VILLAGE_SIZE / 2 - 2);
      expect(Math.abs(spot.z)).toBeLessThanOrEqual(VILLAGE_SIZE / 2 - 2);
      for (const s of sites) {
        const inside = Math.abs(spot.x - s.position.x) < s.size.w / 2 + 2 && Math.abs(spot.z - s.position.z) < s.size.d / 2 + 2;
        expect(inside).toBe(false);
      }
      for (const w of LAP_WAYPOINTS) expect(dist(spot, w)).toBeGreaterThanOrEqual(2);
      const inPlaza = Math.abs(spot.x) <= 4.5 && spot.z >= south && spot.z <= south + 8;
      expect(inPlaza).toBe(false);
    }
  });

  it("sizes sprites from footprints, and a bigger footprint draws a bigger tree", () => {
    const layout = buildWorldLayout({ castleType: "keep", buildings: allBuilt });
    const castle = layout.props.find((p) => p.kind === "castle")!;
    expect(spriteSizeFor(castle)).toEqual({ w: CASTLE_FOOTPRINTS.keep.w + 1, h: CASTLE_FOOTPRINTS.keep.h + 1.5 });
    const well = layout.props.find((p) => p.id === "well")!;
    expect(spriteSizeFor(well)).toEqual({ w: 3.5, h: 3.5 });
    const oak = layout.scenery.find((p) => p.variant === "oak" && p.size.w === 0.9)!;
    expect(spriteSizeFor(oak)).toEqual({ w: 1.2, h: 1.6 });
    const rock = layout.scenery.find((p) => p.variant === "rock" && p.size.w === 0.9)!;
    expect(spriteSizeFor(rock)).toEqual({ w: 0.9, h: 0.9 });
    // A great oak is twice the footprint, so it draws at twice the sprite — no second table.
    const great = layout.scenery.find((p) => p.variant === "oak" && p.size.w === 1.8)!;
    expect(spriteSizeFor(great)).toEqual({ w: 2.4, h: 3.2 });
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

describe("the world beyond the village", () => {
  const layout = buildWorldLayout({ castleType: "citadel", buildings: BUILDINGS.map((b) => ({ id: b.id, done: 0, total: b.deedsToBuild, complete: false })) });
  const HALF = WORLD_SIZE / 2;
  // The decorations that have art (world-figures.tsx's DECOR_KINDS). Hard-coded rather
  // than imported so this pure test never pulls a React module in: a variant with no figure
  // renders NOTHING, so a twelfth kind invented here would be a hole in the world.
  const DRAWABLE = ["oak", "pine", "bush", "rock", "fence", "lantern", "signpost", "menhir", "boat", "scarecrow", "cart"];

  it("is several times the village across, with the village unchanged at the heart of it", () => {
    expect(WORLD_SIZE).toBeGreaterThanOrEqual(VILLAGE_SIZE * 3);
    expect(VILLAGE_SIZE).toBe(40); // the world the village was built for
    for (const slot of Object.values(BUILDING_SLOTS)) {
      expect(Math.abs(slot.x)).toBeLessThan(VILLAGE_SIZE / 2);
      expect(Math.abs(slot.z)).toBeLessThan(VILLAGE_SIZE / 2);
    }
  });

  it("gives the world regions with their own ground: water and a bank, worked plots, and tracks", () => {
    const kinds = new Set(layout.terrain.map((t) => t.kind));
    for (const kind of ["water", "shore", "shallow", "field", "furrow", "trail"]) expect(kinds.has(kind as never)).toBe(true);
    expect(layout.terrain.filter((t) => t.kind === "trail").length).toBeGreaterThan(30);
    // Every patch is inside the world and has a real footprint.
    for (const t of layout.terrain) {
      expect(t.size.w).toBeGreaterThan(0);
      expect(t.size.d).toBeGreaterThan(0);
      expect(Math.abs(t.position.x) + t.size.w / 2).toBeLessThanOrEqual(HALF);
      expect(Math.abs(t.position.z) + t.size.d / 2).toBeLessThanOrEqual(HALF);
    }
    expect(new Set(layout.terrain.map((t) => t.id)).size).toBe(layout.terrain.length);
  });

  it("puts a wood, a shore, a fell and a fenced plot in four different directions", () => {
    const near = (x: number, z: number, radius: number, variant?: string) =>
      layout.scenery.filter((p) => Math.hypot(p.position.x - x, p.position.z - z) <= radius && (!variant || p.variant === variant)).length;
    expect(near(-50, 0, 26, "oak") + near(-50, 0, 26, "pine")).toBeGreaterThan(50); // the Old Wood, west
    expect(near(-36, -52, 22, "rock")).toBeGreaterThan(20); // the fells, north
    expect(near(42, -48, 24, "bush")).toBeGreaterThan(15); // reeds along Longwater, north-east
    expect(near(38, 0, 26, "fence")).toBeGreaterThan(20); // the fenced plots, east
    expect(near(0, 38, 20, "oak")).toBeGreaterThan(20); // the orchard rows, south
  });

  it("makes the Old Wood thick enough to be a wood, and thins it at the edge", () => {
    const trees = layout.scenery.filter((p) => p.variant === "oak" || p.variant === "pine");
    const within = (x: number, z: number, radius: number) =>
      trees.filter((p) => Math.hypot(p.position.x - x, p.position.z - z) <= radius).length / (Math.PI * radius * radius);
    // Trunks per square unit at the wood's heart. A hundred and twenty trees over this rectangle
    // was one every twenty-eight units — six on a screen, which reads as grass with stickers on
    // it. At a tree every seven units they touch, overlap and make a canopy.
    const heart = within(-50, 0, 18);
    expect(heart).toBeGreaterThan(1 / 8);
    // ...and it has an EDGE: the wood thins towards its rim rather than stopping on a line.
    expect(within(-50, 0, 40)).toBeLessThan(heart * 0.8);
    // The ground under it says "wood" too, and reaches past the last trunks as leaf litter.
    expect(layout.terrain.filter((t) => t.kind === "grove").length).toBeGreaterThan(100);
    expect(layout.terrain.filter((t) => t.kind === "litter").length).toBeGreaterThan(20);
    // And dry grass everywhere, so no stretch of open ground is every other stretch.
    expect(layout.terrain.filter((t) => t.kind === "meadow").length).toBeGreaterThan(150);
  });

  it("draws every decoration with a figure that exists, and varies the trees so a wood is not a stamp", () => {
    for (const p of layout.scenery) expect(DRAWABLE).toContain(p.variant);
    const trees = layout.scenery.filter((p) => p.variant === "oak" || p.variant === "pine");
    expect(new Set(trees.map((t) => t.size.w.toFixed(2))).size).toBeGreaterThan(20);
    expect(new Set(layout.scenery.map((p) => p.id)).size).toBe(layout.scenery.length);
    for (const p of layout.scenery) expect(Math.abs(p.position.x) <= HALF && Math.abs(p.position.z) <= HALF).toBe(true);
  });

  it("leaves the village to the village: only its own twelve and the fingerposts stand inside it, and nothing solid", () => {
    const inside = layout.scenery.filter((p) => Math.abs(p.position.x) <= VILLAGE_SIZE / 2 && Math.abs(p.position.z) <= VILLAGE_SIZE / 2);
    // The village's own twelve, plus however many track-head fingerposts stand just inside the
    // line. A post at the mouth of a track has to be visible from IN the village — that is the
    // whole invitation — so it is allowed in, and nothing else is.
    const posts = inside.filter((p) => p.variant === "signpost");
    expect(inside).toHaveLength(DECOR_SPOTS.length + posts.length);
    expect(posts.length).toBeGreaterThan(0);
    for (const p of inside) expect(p.solid).toBe(false);
  });

  it("makes stone and water solid and leaves the woods walk-through, so a forest is never a maze", () => {
    const solid = layout.scenery.filter((p) => p.solid);
    expect(solid.length).toBeGreaterThan(0);
    expect(solid.length).toBeLessThan(layout.scenery.length * 0.1);
    // A standing stone joins the list: the Ringstones and Appleway's milestone are stone, and
    // stone is the one thing in this world a child walks around rather than through.
    for (const p of solid) expect(["rock", "oak", "menhir"]).toContain(p.variant);
    // Deep water blocks, and the blocker is the rectangle the scene paints — not a guess at it.
    const water = layout.terrain.filter((t) => t.kind === "water");
    const blockers = layout.colliders.filter((c) => c.id.startsWith("water-"));
    expect(blockers.length).toBe(water.length);
    for (const b of blockers) {
      const match = water.find((w) => w.position.x === b.position.x && w.position.z === b.position.z);
      expect(match).toBeDefined();
      expect({ w: match!.size.w, d: match!.size.d }).toEqual({ w: b.size.w, d: b.size.d });
    }
    // The shallow millstream is walked straight through: no collider stands on it.
    const shallow = layout.terrain.find((t) => t.kind === "shallow")!;
    expect(layout.colliders.some((c) => Math.abs(c.position.x - shallow.position.x) < 1 && Math.abs(c.position.z - shallow.position.z) < 1)).toBe(false);
  });

  it("can be walked: every track, every site and every landmark is reachable on foot from the spawn", () => {
    // The real collider rule from movement.ts, on a one-unit grid. This is the test that says
    // the village is not walled in — and it would fail the day a ring of trees closed a way out.
    const blocked = (p: Vec2) =>
      layout.colliders.some((c) => Math.abs(p.x - c.position.x) < c.size.w / 2 + HERO_RADIUS && Math.abs(p.z - c.position.z) < c.size.d / 2 + HERO_RADIUS);
    const key = (x: number, z: number) => `${x},${z}`;
    const start = { x: Math.round(SPAWN.x), z: Math.round(SPAWN.z) };
    const seen = new Set<string>([key(start.x, start.z)]);
    const queue: { x: number; z: number }[] = [start];
    const limit = Math.floor(HALF - 1);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = { x: cur.x + dx, z: cur.z + dz };
        if (Math.abs(next.x) > limit || Math.abs(next.z) > limit) continue;
        const k = key(next.x, next.z);
        if (seen.has(k) || blocked(next)) continue;
        seen.add(k);
        queue.push(next);
      }
    }
    const walkable = (p: Vec2) => {
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        if (seen.has(key(Math.round(p.x) + dx, Math.round(p.z) + dz))) return true;
      }
      return false;
    };
    for (const tile of layout.terrain.filter((t) => t.kind === "trail")) {
      expect(walkable(tile.position), `the track at ${tile.position.x},${tile.position.z} is cut off from the village`).toBe(true);
    }
    const landmarks: [string, Vec2][] = [
      // Inside the Ringstones, in the gap the phase leaves on the track's own line: a child
      // who walks the west track to its end must be able to get INTO the circle.
      ["the middle of the Ringstones", { x: -54, z: 0 }],
      ["the Ringstones' north gap", { x: -54, z: 6.5 }],
      ["Highcairn", { x: -33, z: -54 }],
      ["Longwater's boat", { x: 31, z: -36 }],
      ["Farfurrow's scarecrow", { x: 56, z: -4 }],
      ["Appleway's cart", { x: 3, z: 53 }],
      ["the mill pool", { x: 26, z: -16 }],
      ["the north-west corner", { x: -70, z: -70 }],
      ["the south-east corner", { x: 70, z: 70 }],
    ];
    for (const [name, p] of landmarks) expect(walkable(p), `${name} is unreachable on foot`).toBe(true);
    // And the middle of every named place, which is where the arrival fires: a place a child
    // is told they have reached and cannot actually stand in would be the world lying to them.
    for (const place of PLACES) expect(walkable(place.position), `${place.name} is unreachable on foot`).toBe(true);
    for (const site of Object.values(BUILDING_SLOTS)) expect(walkable({ x: site.x, z: site.z + 3 })).toBe(true);
    // And most of the world is open ground, not a corridor between walls.
    expect(seen.size).toBeGreaterThan(WORLD_SIZE * WORLD_SIZE * 0.8);
  });
});

describe("the five named places", () => {
  const layout = buildWorldLayout({ castleType: "keep", buildings: [] });
  const near = (p: Vec2, radius: number, variant: string) =>
    layout.scenery.filter((s) => s.variant === variant && Math.hypot(s.position.x - p.x, s.position.z - p.z) <= radius);

  it("names five places, each with a name a child can say out loud and a line that is one sentence", () => {
    expect(PLACES).toHaveLength(5);
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(5);
    expect(new Set(PLACES.map((p) => p.name)).size).toBe(5);
    for (const place of PLACES) {
      // A name, not a label: no digits, no colons, no "Region 3".
      expect(place.name).toMatch(/^[A-Z][A-Za-z ]+$/);
      expect(place.name.split(" ").length).toBeLessThanOrEqual(2 + 1); // "The Ringstones" at the longest
      expect(place.line.endsWith(".")).toBe(true);
      expect(place.line.length).toBeLessThanOrEqual(48); // one glanceable sentence, not a paragraph
      expect(place.radius).toBeGreaterThan(8);
    }
  });

  it("puts every one of them out in the world, well clear of the village and of each other", () => {
    const HALF = WORLD_SIZE / 2;
    for (const place of PLACES) {
      expect(Math.abs(place.position.x) + place.radius).toBeLessThan(HALF);
      expect(Math.abs(place.position.z) + place.radius).toBeLessThan(HALF);
      // Outside the village square: a place you can see from the spawn is not somewhere you went.
      expect(Math.max(Math.abs(place.position.x), Math.abs(place.position.z))).toBeGreaterThan(VILLAGE_SIZE / 2 + 4);
    }
    for (const a of PLACES) {
      for (const b of PLACES) {
        if (a === b) continue;
        expect(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z), `${a.name} overlaps ${b.name}`).toBeGreaterThan(a.radius + b.radius);
      }
    }
  });

  it("runs a track into every one of them, so no place has to be found by luck", () => {
    for (const place of PLACES) {
      const tiles = layout.terrain.filter((t) => t.kind === "trail" && Math.hypot(t.position.x - place.position.x, t.position.z - place.position.z) <= place.radius);
      expect(tiles.length, `no track reaches ${place.name}`).toBeGreaterThan(0);
    }
  });

  it("stands a fingerpost at the mouth of every track and at the far end of every one", () => {
    const posts = layout.scenery.filter((p) => p.variant === "signpost");
    expect(posts).toHaveLength(10); // five heads, five far ends
    for (const post of posts) expect(post.solid).toBe(false); // never a closed gate
    // One at the end of each track: a child who is lost has a way home from every place.
    for (const place of PLACES) {
      expect(near(place.position, place.radius, "signpost").length, `${place.name} has nothing pointing home`).toBeGreaterThan(0);
    }
    // ...and one near the village for each track, so the way out is visible from inside.
    const heads = posts.filter((p) => Math.hypot(p.position.x, p.position.z) < 30);
    expect(heads).toHaveLength(5);
  });

  it("keeps the promise each line makes: the thing named is really standing there", () => {
    const promised: Record<string, string> = {
      ringstones: "menhir",
      highcairn: "rock",
      longwater: "boat",
      farfurrow: "scarecrow",
      appleway: "cart",
    };
    for (const place of PLACES) {
      const found = near(place.position, place.radius, promised[place.id]);
      expect(found.length, `${place.name} promises ${promised[place.id]} and has none`).toBeGreaterThan(0);
    }
    // The Ringstones promise EIGHT, and eight is what a child counts.
    expect(near(placeById("ringstones")!.position, 12, "menhir")).toHaveLength(8);
  });

  it("drops every find when the decorations are off, and keeps every name", () => {
    const calm = buildWorldLayout({ castleType: "keep", buildings: [], decor: false });
    expect(calm.scenery).toEqual([]);
    // The names are pure data, not scenery: a calm world is quieter, never nameless.
    for (const place of PLACES) expect(placeAt(place.position, null)).toBe(place.id);
  });
});

describe("placeAt", () => {
  it("says nothing at the spawn, and names each place from its middle", () => {
    expect(placeAt(SPAWN, null)).toBeNull();
    for (const place of PLACES) expect(placeAt(place.position, null)).toBe(place.id);
  });

  it("holds a place past its own edge and lets go beyond that, so a child on the rim never stutters it", () => {
    const place = PLACES[0];
    const out = (d: number): Vec2 => ({ x: place.position.x + d, z: place.position.z });
    // Just outside the radius, arriving fresh: not here.
    expect(placeAt(out(place.radius + 1), null)).toBeNull();
    // ...but held, if this is the place we were already standing in.
    expect(placeAt(out(place.radius + 1), place.id)).toBe(place.id);
    // And let go once past the leaving distance.
    expect(placeAt(out(place.radius * PLACE_LEAVE + 1), place.id)).toBeNull();
    expect(PLACE_LEAVE).toBeGreaterThan(1);
  });

  it("never claims a place from the far side of the world, whatever was held before", () => {
    for (const place of PLACES) expect(placeAt({ x: 0, z: 0 }, place.id)).toBeNull();
  });
});

describe("arrivalText", () => {
  const place = placeById("longwater")!;

  it("names the place and what is there the first time, and the name alone after that", () => {
    expect(arrivalText(place, true)).toBe("Longwater. A little boat is pulled up on the shore.");
    expect(arrivalText(place, false)).toBe("Longwater.");
  });

  it("says something for every place, both ways round", () => {
    for (const p of PLACES) {
      expect(arrivalText(p, true).startsWith(p.name)).toBe(true);
      expect(arrivalText(p, true).length).toBeGreaterThan(arrivalText(p, false).length);
    }
  });

  it("has nothing to say about a place that does not exist", () => {
    expect(placeById("atlantis")).toBeNull();
  });
});
