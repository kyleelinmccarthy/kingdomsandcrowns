import { describe, expect, it } from "vitest";
import { realmWorld } from "./worldgen";
import { buildTrackIndex, segmentsOf } from "./track-index";

describe("track index", () => {
  const line = segmentsOf([{ x: -20, z: 0 }, { x: 20, z: 0 }], 2);
  const idx = buildTrackIndex(line, 1.6);

  it("is full strength on the running surface", () => {
    expect(idx.nearness(0, 0)).toBe(1);
    expect(idx.nearness(-19, 1.9)).toBe(1);
  });

  it("eases out across the verge and stops", () => {
    expect(idx.nearness(0, 2.8)).toBeGreaterThan(0);
    expect(idx.nearness(0, 2.8)).toBeLessThan(1);
    expect(idx.nearness(0, 3.7)).toBe(0);
    expect(idx.nearness(0, 40)).toBe(0);
  });

  it("stops at the ends rather than running on for ever", () => {
    expect(idx.nearness(20, 0)).toBe(1);
    expect(idx.nearness(24, 0)).toBe(0);
  });

  it("takes the nearest of several runs where they cross", () => {
    const cross = buildTrackIndex([...line, ...segmentsOf([{ x: 0, z: -20 }, { x: 0, z: 20 }], 2)]);
    expect(cross.nearness(0, 10)).toBe(1);
    expect(cross.nearness(10, 0)).toBe(1);
    expect(cross.nearness(10, 10)).toBe(0);
  });

  it("drops a polyline's duplicate points instead of indexing a zero-length run", () => {
    expect(segmentsOf([{ x: 1, z: 1 }, { x: 1, z: 1 }, { x: 4, z: 1 }], 2)).toHaveLength(1);
  });

  it("finds the realm's own roads under the landmarks they lead to", () => {
    const w = realmWorld();
    const segs = w.roads.flatMap((r) => segmentsOf(r.points, r.halfWidth));
    const index = buildTrackIndex(segs);
    expect(index.count).toBeGreaterThan(40);
    // Every road ends at a landmark, so the ground there is on a track.
    for (const road of w.roads) {
      const end = road.points[road.points.length - 1];
      expect(index.nearness(end.x, end.z)).toBe(1);
    }
    // ...and the middle of the ocean is not.
    expect(index.nearness(-w.half + 2, w.half - 2)).toBe(0);
  });
});
