import { describe, expect, it } from "vitest";
import { KEEP_YARD, YARD_RADIUS } from "@/lib/realm/keep-yard";
import { SPAWN } from "@/lib/realm/layout";
import { MATERIALS } from "@/lib/realm/materials";
import { EMPTY_WORKS } from "@/lib/realm/works-state";
import { heapBoxes, LECTERN_BOXES, LECTERN_YAW, PLANS_BOARD_BOXES, PLANS_BOARD_YAW, stockpileHeaps, type HeapBox } from "./keep-yard-boxes";

const top = (boxes: HeapBox[]) => Math.max(...boxes.map((b) => b.y + b.sy / 2));
const spread = (boxes: HeapBox[]) => Math.max(...boxes.map((b) => Math.max(Math.abs(b.x) + b.sx / 2, Math.abs(b.z) + b.sz / 2)));

describe("a stockpile heap", () => {
  it("is nothing at all when the hero holds none", () => {
    expect(heapBoxes(0)).toEqual([]);
  });

  it("grows taller and wider with each size", () => {
    const [one, two, three] = ([1, 2, 3] as const).map(heapBoxes);
    expect(top(two)).toBeGreaterThan(top(one));
    expect(top(three)).toBeGreaterThan(top(two));
    expect(spread(two)).toBeGreaterThan(spread(one));
    expect(spread(three)).toBeGreaterThan(spread(two));
  });

  it("stands on the ground and keeps inside its own spot", () => {
    for (const size of [1, 2, 3] as const) {
      const boxes = heapBoxes(size);
      expect(Math.min(...boxes.map((b) => b.y - b.sy / 2)), `size ${size}`).toBeCloseTo(0);
      expect(spread(boxes), `size ${size}`).toBeLessThanOrEqual(YARD_RADIUS.heap);
    }
  });
});

describe("the stockpile", () => {
  it("has no heaps when the satchel is empty", () => {
    expect(stockpileHeaps(EMPTY_WORKS.balance)).toEqual([]);
  });

  it("puts each material's heap on its own spot, in its own colour, sized by what the hero holds", () => {
    const heaps = stockpileHeaps({ ...EMPTY_WORKS.balance, stone: 2, timber: 12 });
    expect(heaps).toEqual([
      { id: "stone", x: KEEP_YARD.stockpile[0].x, z: KEEP_YARD.stockpile[0].z, size: 1, color: MATERIALS.stone.color },
      { id: "timber", x: KEEP_YARD.stockpile[5].x, z: KEEP_YARD.stockpile[5].z, size: 3, color: MATERIALS.timber.color },
    ]);
  });
});

describe("the plans board", () => {
  it("stands on the ground and keeps inside its spot whichever way it is turned", () => {
    expect(Math.min(...PLANS_BOARD_BOXES.map((b) => b.y - b.sy / 2))).toBeCloseTo(0);
    for (const b of PLANS_BOARD_BOXES) {
      expect(Math.hypot(Math.abs(b.x) + b.sx / 2, Math.abs(b.z) + b.sz / 2)).toBeLessThanOrEqual(YARD_RADIUS.plansBoard);
    }
  });

  it("turns its face to the road the hero walks in on", () => {
    const { x, z } = KEEP_YARD.plansBoard;
    // Its front (+z, turned by the yaw) points at the spawn.
    const fx = Math.sin(PLANS_BOARD_YAW);
    const fz = Math.cos(PLANS_BOARD_YAW);
    const dx = SPAWN.x - x;
    const dz = SPAWN.z - z;
    expect((fx * dx + fz * dz) / Math.hypot(dx, dz)).toBeCloseTo(1);
  });
});

describe("the Scribe's lectern", () => {
  it("stands on the ground and keeps inside its spot whichever way it is turned", () => {
    expect(Math.min(...LECTERN_BOXES.map((b) => b.y - b.sy / 2))).toBeCloseTo(0);
    for (const b of LECTERN_BOXES) {
      expect(Math.hypot(Math.abs(b.x) + b.sx / 2, Math.abs(b.z) + b.sz / 2)).toBeLessThanOrEqual(YARD_RADIUS.lectern);
    }
  });

  it("is low enough to see over and holds an open book, a stand and a base", () => {
    expect(Math.max(...LECTERN_BOXES.map((b) => b.y + b.sy / 2))).toBeLessThanOrEqual(1.6);
    expect(LECTERN_BOXES.length).toBeGreaterThanOrEqual(4);
  });

  it("turns its open book to +z, toward the default camera (it stands south of the hero, looking north)", () => {
    // The boxes' front (the low edge of the desk, where the reader stands) is +z in its own frame.
    expect(Math.sin(LECTERN_YAW)).toBeCloseTo(0);
    expect(Math.cos(LECTERN_YAW)).toBeCloseTo(1);
    const desk = LECTERN_BOXES.filter((b) => b.color === LECTERN_BOXES[2].color && b.y > 0.5);
    const top = (b: (typeof LECTERN_BOXES)[number]) => b.y + b.sy / 2;
    const [back, front] = [...desk].sort((a, b) => a.z - b.z);
    expect(top(back)).toBeGreaterThan(top(front));
  });
});
