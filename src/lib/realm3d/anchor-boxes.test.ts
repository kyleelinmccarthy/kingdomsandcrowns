import { describe, expect, it } from "vitest";
import { ANCHOR_SPOT, ANCHORS, ANCHOR_IDS, type ObjectAnchorId } from "@/lib/realm/anchors";
import { stakeBoxes, trailObjectBoxes } from "./anchor-boxes";

const top = (b: { y: number; sy: number }) => b.y + b.sy / 2;
const OBJECT_IDS = ANCHOR_IDS.filter((id): id is ObjectAnchorId => ANCHORS[id].kind === "object");

describe("a stake's boxes", () => {
  it("stay inside the stake's spot and stand at most 1.6 tall", () => {
    for (const revealed of [false, true]) {
      const boxes = stakeBoxes(revealed);
      expect(boxes.length).toBeGreaterThan(0);
      for (const b of boxes) {
        expect(Math.hypot(Math.abs(b.x) + b.sx / 2, Math.abs(b.z) + b.sz / 2)).toBeLessThanOrEqual(ANCHOR_SPOT.radius);
        expect(top(b)).toBeLessThanOrEqual(1.6);
        expect(b.y - b.sy / 2).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("differ revealed only in colour, to the gold", () => {
    const shut = stakeBoxes(false);
    const shown = stakeBoxes(true);
    expect(shown).toHaveLength(shut.length);
    let changed = 0;
    shut.forEach((b, i) => {
      expect({ ...shown[i], color: "" }).toEqual({ ...b, color: "" });
      if (shown[i].color !== b.color) {
        changed++;
        expect(shown[i].color).toBe("#e8b84a");
      }
    });
    expect(changed).toBeGreaterThan(0);
    expect(shut.some((b) => b.color === "#e8b84a")).toBe(false);
  });
});

describe("the four small objects", () => {
  it("are the four object anchors", () => {
    expect(OBJECT_IDS).toHaveLength(4);
  });

  it("have two to eight boxes each, inside a 1.6 by 1.6 footprint and at most 2.2 tall", () => {
    for (const id of OBJECT_IDS) {
      const boxes = trailObjectBoxes(id);
      expect(boxes.length, id).toBeGreaterThanOrEqual(2);
      expect(boxes.length, id).toBeLessThanOrEqual(8);
      for (const b of boxes) {
        expect(Math.abs(b.x) + b.sx / 2, id).toBeLessThanOrEqual(0.8 + 1e-9);
        expect(Math.abs(b.z) + b.sz / 2, id).toBeLessThanOrEqual(0.8 + 1e-9);
        expect(top(b), id).toBeLessThanOrEqual(2.2);
        expect(b.y - b.sy / 2, id).toBeGreaterThanOrEqual(0);
        expect(b.color, id).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
