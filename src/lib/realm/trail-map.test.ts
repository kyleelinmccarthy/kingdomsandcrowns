import { describe, expect, it } from "vitest";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { ANCHOR_IDS, ANCHORS } from "./anchors";
import { TRAIL_MAP_HIT, TRAIL_MAP_VIEW, trailMapBackdrop, trailMapPoint } from "./trail-map";

const points = ANCHOR_IDS.map((id) => ({ id, ...trailMapPoint(ANCHORS[id].x, ANCHORS[id].z) }));

describe("the trail map's projection", () => {
  it("is 360 wide and no more than 480 tall", () => {
    expect(TRAIL_MAP_VIEW.w).toBe(360);
    expect(TRAIL_MAP_VIEW.h).toBeLessThanOrEqual(480);
    expect(TRAIL_MAP_HIT).toBe(20);
  });

  it("puts every anchor a full button's reach inside the picture", () => {
    for (const p of points) {
      expect(p.x, p.id).toBeGreaterThanOrEqual(TRAIL_MAP_HIT);
      expect(p.x, p.id).toBeLessThanOrEqual(TRAIL_MAP_VIEW.w - TRAIL_MAP_HIT);
      expect(p.y, p.id).toBeGreaterThanOrEqual(TRAIL_MAP_HIT);
      expect(p.y, p.id).toBeLessThanOrEqual(TRAIL_MAP_VIEW.h - TRAIL_MAP_HIT);
    }
  });

  it("keeps every two buttons apart, so none overlaps at 360 wide", () => {
    for (const p of points) {
      for (const q of points) if (p !== q) expect(Math.hypot(p.x - q.x, p.y - q.y), `${p.id} and ${q.id}`).toBeGreaterThanOrEqual(2 * TRAIL_MAP_HIT);
    }
  });

  it("has north up and a uniform scale", () => {
    expect(trailMapPoint(0, -14).y).toBeLessThan(trailMapPoint(0, 15).y);
    expect(trailMapPoint(10, 0).x).toBeGreaterThan(trailMapPoint(-10, 0).x);
    const a = trailMapPoint(0, 0);
    const dx = trailMapPoint(1, 0).x - a.x;
    const dz = trailMapPoint(0, 1).y - a.y;
    expect(dx).toBeCloseTo(dz, 9);
    expect(dx).toBeGreaterThan(0);
  });
});

describe("the trail map's backdrop", () => {
  const back = trailMapBackdrop();

  it("draws the eight sites, the castle's front and the Tower's plot, and one road", () => {
    expect(back.plots).toHaveLength(10);
    expect(back.plots.map((p) => p.id)).toEqual([...BUILDINGS.map((b) => b.id), "castle", "tower"]);
    expect(back.road).toHaveLength(1);
  });

  it("keeps every plot and the road inside the picture", () => {
    for (const p of back.plots) {
      expect(p.x, p.id).toBeGreaterThanOrEqual(0);
      expect(p.y, p.id).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w, p.id).toBeLessThanOrEqual(TRAIL_MAP_VIEW.w);
      expect(p.y + p.h, p.id).toBeLessThanOrEqual(TRAIL_MAP_VIEW.h);
    }
    for (const r of back.road) {
      for (const v of [r.x1, r.x2]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(TRAIL_MAP_VIEW.w);
      }
      for (const v of [r.y1, r.y2]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(TRAIL_MAP_VIEW.h);
      }
    }
  });

  it("runs the road from the spawn north to the castle's front", () => {
    const [r] = back.road;
    expect(r.y1).toBeGreaterThan(r.y2);
    expect(r.x1).toBeCloseTo(r.x2, 9);
    const castle = back.plots.find((p) => p.id === "castle")!;
    expect(r.y2).toBeCloseTo(castle.y + castle.h, 6);
  });
});
