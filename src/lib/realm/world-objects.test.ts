import { describe, expect, it } from "vitest";
import { buildWorldLayout, PLACES, placeById, SCENERY } from "./layout";
import { realmWorld } from "@/lib/realm3d/worldgen";
import { travelGraphFor, VILLAGE_TRACKS } from "@/lib/realm3d/travel";
import { buildSpots, edgeDistance, type InteractSpot } from "@/lib/realm3d/interact";
import { ROOM_KINDS } from "@/lib/realm3d/interiors";
import { clearanceFailures, gap, levelFailures, rectAt, segmentDistance, villagePieces, yardPieces, type R } from "@/test/world-clearance";
import { REALM_PLACE_IDS } from "./places-found";
import { LORE_IDS } from "./lore";
import { PUZZLE_TOWER } from "./puzzle-tower";
import { RIDDLE_STONE_SPOTS } from "./riddle-stones";
import { CHEST_RESET_DAYS, DECOR, DECOR_IDS, isWorldObjectId, LOCK_SPOT, rewardKey, WORLD_OBJECTS, worldObjectById, type WorldObject } from "./world-objects";

const chests = WORLD_OBJECTS.filter((o) => o.type === "chest");
const doors = WORLD_OBJECTS.filter((o) => o.type === "door");
const villageChests = chests.filter((o) => !o.room);

describe("the world's objects", () => {
  it("has unique ids, each a chest or a door", () => {
    expect(new Set(WORLD_OBJECTS.map((o) => o.id)).size).toBe(WORLD_OBJECTS.length);
    for (const o of WORLD_OBJECTS) expect(o.id.startsWith(`${o.type}:`), o.id).toBe(true);
    expect(chests).toHaveLength(5);
    expect(doors).toHaveLength(5);
  });

  it("refills a chest weekly and opens a door once", () => {
    expect(CHEST_RESET_DAYS).toBe(7);
    for (const o of chests) expect(o.resetAfterDays, o.id).toBe(CHEST_RESET_DAYS);
    for (const o of doors) expect(o.resetAfterDays, o.id).toBeUndefined();
  });

  it("gives every reward from the catalogs, and every decoration and page from exactly one object", () => {
    const given = new Map<string, string[]>();
    for (const o of WORLD_OBJECTS) {
      expect(o.rewards.length, o.id).toBeGreaterThan(0);
      for (const r of o.rewards) {
        if (r.kind === "decor") expect(DECOR_IDS).toContain(r.id);
        if (r.kind === "lore") expect(LORE_IDS).toContain(r.id);
        given.set(rewardKey(r), [...(given.get(rewardKey(r)) ?? []), o.id]);
      }
    }
    for (const id of DECOR_IDS) expect(given.get(`decor:${id}`), `decor ${id}`).toHaveLength(1);
    for (const id of LORE_IDS) expect(given.get(`lore:${id}`), `lore ${id}`).toHaveLength(1);
    // Nothing is given twice, whatever it is.
    for (const [key, by] of given) expect(by, key).toHaveLength(1);
  });

  it("names rewards by a key that cannot be mistaken for another kind", () => {
    expect(rewardKey({ kind: "decor", id: "sundial" })).toBe("decor:sundial");
    expect(rewardKey({ kind: "lore", id: "the-locksmith" })).toBe("lore:the-locksmith");
    expect(rewardKey({ kind: "fragment", placeId: "summit-7" })).toBe("place:summit-7");
  });

  it("hides a generated place behind each door: real, never authored, never the same twice", () => {
    const fragments = doors.flatMap((o) => o.rewards.filter((r) => r.kind === "fragment")).map((r) => (r.kind === "fragment" ? r.placeId : ""));
    expect(fragments).toHaveLength(doors.length);
    expect(new Set(fragments).size).toBe(fragments.length);
    for (const id of fragments) {
      expect(REALM_PLACE_IDS, id).toContain(id);
      expect(placeById(id), `${id} is authored`).toBeNull();
    }
  });

  it("gives a door a lore page too, and a chest a page last", () => {
    for (const o of doors) expect(o.rewards.map((r) => r.kind).sort(), o.id).toEqual(["fragment", "lore"]);
    for (const o of chests) expect(o.rewards.map((r) => r.kind), o.id).toEqual(["decor", "decor", "lore"]);
  });

  it("has one door per named place, read from the id's suffix", () => {
    expect(doors.map((o) => o.id.slice("door:".length)).sort()).toEqual(PLACES.map((p) => p.id).sort());
  });

  it("keeps room chests to the library (language) and the garden (science)", () => {
    const rooms = chests.filter((o) => o.room).map((o) => [o.room, o.draws]);
    expect(rooms).toEqual([["library", "language"], ["garden", "science"]]);
    for (const o of WORLD_OBJECTS) if (o.room) expect(ROOM_KINDS, o.id).toContain(o.room);
  });

  it("draws logic everywhere else", () => {
    for (const o of WORLD_OBJECTS) if (!o.room) expect(o.draws, o.id).toBe("logic");
  });

  it("faces each one inward: a door toward its place, a room chest toward the room's middle", () => {
    const facing = (ry: number) => ({ x: Math.sin(ry), z: Math.cos(ry) });
    for (const o of doors) {
      const place = placeById(o.id.slice("door:".length))!;
      const len = Math.hypot(place.position.x - o.x, place.position.z - o.z);
      expect(facing(o.ry).x, o.id).toBeCloseTo((place.position.x - o.x) / len, 6);
      expect(facing(o.ry).z, o.id).toBeCloseTo((place.position.z - o.z) / len, 6);
    }
    for (const o of chests.filter((c) => c.room)) {
      const len = Math.hypot(o.x, o.z);
      expect(facing(o.ry).x, o.id).toBeCloseTo(-o.x / len, 6);
      expect(facing(o.ry).z, o.id).toBeCloseTo(-o.z / len, 6);
    }
  });

  it("labels what it stands for", () => {
    for (const o of chests) expect(o.label).toBe("the old chest");
    for (const o of doors) expect(o.label).toBe("the vault door");
  });

  it("answers worldObjectById for its own entries only", () => {
    for (const o of WORLD_OBJECTS) expect(worldObjectById(o.id)).toBe(o);
    for (const junk of ["toString", "__proto__", "constructor", "hasOwnProperty", "chest:nope", "", null, undefined]) expect(worldObjectById(junk), String(junk)).toBeNull();
    expect(isWorldObjectId("chest:library")).toBe(true);
    expect(isWorldObjectId("tower:k1")).toBe(false);
    expect(isWorldObjectId("toString")).toBe(false);
    expect(isWorldObjectId(42)).toBe(false);
  });
});

describe("the decorations", () => {
  it("are ten, each with a label, a spot and a facing", () => {
    expect(DECOR_IDS).toHaveLength(10);
    expect(Object.keys(DECOR).sort()).toEqual([...DECOR_IDS].sort());
    for (const id of DECOR_IDS) {
      const d = DECOR[id];
      expect(d.label.length, id).toBeGreaterThan(0);
      for (const n of [d.x, d.z, d.ry]) expect(Number.isFinite(n), id).toBe(true);
    }
  });
});

describe("every village chest and decoration spot clears the village", () => {
  const tower = rectAt(PUZZLE_TOWER.x, PUZZLE_TOWER.z, PUZZLE_TOWER.plot, PUZZLE_TOWER.plot);
  const spots: { what: string; rect: R }[] = [
    ...villageChests.map((o) => ({ what: o.id, rect: rectAt(o.x, o.z, 1.4, 1.4) })),
    ...DECOR_IDS.map((id) => ({ what: `decor ${id}`, rect: rectAt(DECOR[id].x, DECOR[id].z, 1.4, 1.4) })),
  ];

  it("has the five village chests' spots and the ten decorations' to check", () => {
    expect(villageChests).toHaveLength(3);
    expect(spots).toHaveLength(13);
  });

  it("clears the sites, the road, the lap ring, the plaza, the scenery and every crown, on level ground", () => {
    expect(spots.flatMap((s) => [...clearanceFailures(s.what, s.rect, undefined, 0), ...levelFailures(s.what, s.rect)])).toEqual([]);
  });

  it("keeps more than 1.4 from every riding track's centreline", () => {
    const close: string[] = [];
    const spotsAt = [
      ...villageChests.map((o) => ({ what: o.id, x: o.x, z: o.z })),
      ...DECOR_IDS.map((id) => ({ what: `decor ${id}`, x: DECOR[id].x, z: DECOR[id].z })),
    ];
    for (const s of spotsAt) {
      for (const [name, l] of Object.entries(VILLAGE_TRACKS)) {
        for (let i = 0; i < l.length - 1; i++) {
          const d = segmentDistance(s, l[i], l[i + 1]);
          if (d <= 1.4) close.push(`${s.what} is ${d.toFixed(2)} from the ${name} track`);
        }
      }
    }
    expect(close).toEqual([]);
  });

  it("keeps 1.0 from the keep yard and the village's own pieces", () => {
    const close: string[] = [];
    for (const s of spots) for (const p of [...yardPieces(), ...villagePieces()]) if (gap(s.rect, p.rect) < 1) close.push(`${s.what} is ${gap(s.rect, p.rect).toFixed(2)} from ${p.what}`);
    expect(close).toEqual([]);
  });

  it("keeps 1.0 from every other chest and decoration", () => {
    const close: string[] = [];
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) if (gap(spots[i].rect, spots[j].rect) < 1) close.push(`${spots[i].what} and ${spots[j].what}`);
    expect(close).toEqual([]);
  });

  it("keeps 1.5 from the Puzzle Tower's plot", () => {
    expect(spots.filter((s) => gap(s.rect, tower) < 1.5).map((s) => s.what)).toEqual([]);
  });
});

describe("the vault doors", () => {
  const world = realmWorld();
  const layout = buildWorldLayout({ castleType: "castle", buildings: [] });
  // Everything else E can act on out there: the village, the castle, the places and their hitching posts, and the riddle stones.
  const others: InteractSpot[] = buildSpots({
    props: layout.props,
    sitePlan: 1.5,
    landmarks: world.landmarks,
    castle: { x: 0, z: -12, hw: 3, hd: 1, label: "your castle" },
    posts: travelGraphFor(world).posts,
    stones: RIDDLE_STONE_SPOTS,
  });
  const spotOf = (o: WorldObject): InteractSpot => ({ target: { kind: "post", id: o.id, label: o.label }, x: o.x, z: o.z, hw: LOCK_SPOT.radius, hd: LOCK_SPOT.radius, round: true, reach: LOCK_SPOT.reach, bias: 0, ring: 1 });

  it("stands inside its place", () => {
    for (const o of doors) {
      const place = placeById(o.id.slice("door:".length))!;
      expect(Math.hypot(o.x - place.position.x, o.z - place.position.z), o.id).toBeLessThan(place.radius);
    }
  });

  it("stands on dry ground", () => {
    for (const o of doors) expect(world.waterLevelAt(o.x, o.z) - world.heightAt(o.x, o.z), `${o.id} is wet`).toBeLessThan(0);
  });

  it("stands clear of the tracks and the roads, so a door's frame is beside the path and never across it", () => {
    const lines = [...Object.values(VILLAGE_TRACKS), ...world.roads.map((r) => r.points)];
    for (const o of doors) for (const l of lines) for (let i = 0; i < l.length - 1; i++) expect(segmentDistance(o, l[i], l[i + 1]), `${o.id} on a track`).toBeGreaterThan(3);
  });

  it("stands clear of anything solid", () => {
    for (const o of doors) {
      for (const p of SCENERY) {
        if (!p.solid) continue;
        expect(Math.hypot(o.x - p.position.x, o.z - p.position.z) - p.size.w / 2 - LOCK_SPOT.radius, `${o.id} against ${p.id}`).toBeGreaterThan(1);
      }
    }
  });

  it("stands outside every other spot's reach, and every other spot outside its own, so E at a door means the door", () => {
    for (const o of doors) {
      const mine = spotOf(o);
      for (const s of others) {
        expect(edgeDistance(s, o.x, o.z), `${o.id} is in reach of ${s.target.kind} ${s.target.id}`).toBeGreaterThan(s.reach);
        expect(edgeDistance(mine, s.x, s.z), `${s.target.kind} ${s.target.id} is in reach of ${o.id}`).toBeGreaterThan(mine.reach);
      }
      for (const other of doors) if (other !== o) expect(edgeDistance(mine, other.x, other.z), `${o.id} and ${other.id}`).toBeGreaterThan(mine.reach);
    }
  });
});
