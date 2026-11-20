import { describe, expect, it } from "vitest";
import { buildWorldLayout, PLACES, placeById, SCENERY } from "./layout";
import { realmWorld } from "@/lib/realm3d/worldgen";
import { travelGraphFor, VILLAGE_TRACKS } from "@/lib/realm3d/travel";
import { buildSpots, edgeDistance } from "@/lib/realm3d/interact";
import { quietSurfaces } from "@/lib/realm3d/quiet";
import { segmentDistance } from "@/test/world-clearance";
import { RIDDLE_STONE_HEIGHT, RIDDLE_STONE_RADIUS, RIDDLE_STONE_SPOTS, RIDDLE_STONES, riddleStoneColliders, riddleStonePosition } from "./riddle-stones";

const world = realmWorld();
// Everything else E can act on out there: the village, the castle, the places themselves and their hitching posts.
const layout = buildWorldLayout({ castleType: "castle", buildings: [] });
const others = buildSpots({
  props: layout.props,
  sitePlan: 1.5,
  landmarks: world.landmarks,
  castle: { x: 0, z: -12, hw: 3, hd: 1, label: "your castle" },
  posts: travelGraphFor(world).posts,
});

describe("the riddle stones", () => {
  it("stands one stone at every named place, and no more", () => {
    expect(RIDDLE_STONES.map((s) => s.placeId).sort()).toEqual(PLACES.map((p) => p.id).sort());
    for (const s of RIDDLE_STONES) expect(s.line.length).toBeGreaterThan(0);
  });

  it("stands each stone at its place: the place's position plus its offset, inside the place", () => {
    for (const s of RIDDLE_STONES) {
      const place = placeById(s.placeId)!;
      const at = riddleStonePosition(s.placeId);
      expect(at).toEqual({ x: place.position.x + s.offset.x, z: place.position.z + s.offset.z });
      expect(Math.hypot(at.x - place.position.x, at.z - place.position.z)).toBeLessThan(place.radius);
    }
    expect(RIDDLE_STONE_SPOTS).toEqual(RIDDLE_STONES.map((s) => ({ placeId: s.placeId, ...riddleStonePosition(s.placeId) })));
  });

  it("stands every stone outside every other spot's reach, so E at a stone means the stone", () => {
    for (const s of RIDDLE_STONE_SPOTS) {
      for (const o of others) {
        expect(edgeDistance(o, s.x, s.z), `${s.placeId} vs ${o.target.kind} ${o.target.id}`).toBeGreaterThan(o.reach);
      }
    }
  });

  it("stands every stone on dry ground, clear of the tracks and of anything solid", () => {
    const lines = [...Object.values(VILLAGE_TRACKS), ...world.roads.map((r) => r.points)];
    for (const s of RIDDLE_STONE_SPOTS) {
      expect(world.waterLevelAt(s.x, s.z) - world.heightAt(s.x, s.z), `${s.placeId} is wet`).toBeLessThan(0);
      for (const l of lines) for (let i = 0; i < l.length - 1; i++) expect(segmentDistance(s, l[i], l[i + 1]), `${s.placeId} on a track`).toBeGreaterThan(3);
      for (const p of SCENERY) {
        if (!p.solid) continue;
        // Room for a child to walk between the stone and anything they would bounce off.
        expect(Math.hypot(s.x - p.position.x, s.z - p.position.z) - p.size.w / 2 - RIDDLE_STONE_RADIUS, `${s.placeId} against ${p.id}`).toBeGreaterThan(1);
      }
    }
  });

  it("stops the hero at each stone: one round collider apiece, standing on the ground there", () => {
    const solids = riddleStoneColliders(world.heightAt);
    expect(solids).toHaveLength(RIDDLE_STONE_SPOTS.length);
    for (const [i, s] of RIDDLE_STONE_SPOTS.entries()) {
      const ground = world.heightAt(s.x, s.z);
      expect(solids[i]).toEqual({ x: s.x, z: s.z, hw: RIDDLE_STONE_RADIUS, hd: RIDDLE_STONE_RADIUS, round: true, base: ground - 1, top: ground + RIDDLE_STONE_HEIGHT });
    }
  });

  it("throws for a place that has no stone", () => {
    expect(() => riddleStonePosition("nowhere")).toThrow();
  });

  it("stays awake in the quiet world: learning is reachable at 0 minutes", () => {
    // `quietSurfaces` names what rests; a riddle stone is not among them.
    expect(Object.keys(quietSurfaces(true))).not.toContain("riddleStones");
    expect(Object.keys(quietSurfaces(true)).sort()).toEqual(["recess", "riding", "troubles"]);
  });
});
