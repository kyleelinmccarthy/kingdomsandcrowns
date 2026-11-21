import { describe, expect, it } from "vitest";
import { DECOR_IDS } from "@/lib/realm/decor";
import { PUZZLE_TOWER } from "@/lib/realm/puzzle-tower";
import { chestBoxes, CHEST_FOOTPRINT, decorBoxes, DOOR_FOOTPRINT, DOOR_OPENING, towerBoxes, vaultDoorBoxes, type LockBox } from "./world-lock-boxes";

const top = (b: LockBox) => b.y + b.sy / 2;
const bottom = (b: LockBox) => b.y - b.sy / 2;
const parts = (boxes: readonly LockBox[], part: LockBox["part"]) => boxes.filter((b) => b.part === part);
/** A colour's lightness and saturation (HSL), 0..1: how bright, and how far from grey. */
function hsl(hex: string): { l: number; s: number; warm: boolean } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { l, s, warm: r > b + 0.1 };
}
/** Is the box's centre inside the door's opening, between its posts and in the frame's own plane? */
const inOpening = (b: LockBox) => Math.abs(b.x) < DOOR_OPENING.hw && Math.abs(b.z) < DOOR_OPENING.hd;

describe("a chest", () => {
  it("has a lid, and an open lid stands higher than a closed one", () => {
    const [shut] = parts(chestBoxes(false), "lid");
    const [open] = parts(chestBoxes(true), "lid");
    expect(shut).toBeDefined();
    expect(open).toBeDefined();
    expect(top(open)).toBeGreaterThan(top(shut));
    expect(open.y).toBeGreaterThan(shut.y);
  });

  it("is the same chest under the lid, open or shut, and shows what is inside only when open", () => {
    const body = (open: boolean) => chestBoxes(open).filter((b) => !b.part);
    expect(body(true)).toEqual(body(false));
    expect(parts(chestBoxes(false), "inside")).toEqual([]);
    expect(parts(chestBoxes(true), "inside").length).toBeGreaterThan(0);
  });
});

describe("a vault door", () => {
  it("has its leaves within the frame when shut", () => {
    const leaves = parts(vaultDoorBoxes(false), "leaf");
    expect(leaves.length).toBeGreaterThan(0);
    for (const l of leaves) expect(inOpening(l)).toBe(true);
  });

  it("has its leaves swung out of the frame when open", () => {
    const leaves = parts(vaultDoorBoxes(true), "leaf");
    expect(leaves.length).toBe(parts(vaultDoorBoxes(false), "leaf").length);
    for (const l of leaves) expect(inOpening(l)).toBe(false);
  });

  it("keeps the same frame, open or shut", () => {
    const frame = (open: boolean) => vaultDoorBoxes(open).filter((b) => b.part !== "leaf" && b.part !== "inside");
    expect(frame(true)).toEqual(frame(false));
  });

  it("shows a lit opening when open, and none when shut, so open never looks like shut (smoke cosmetic)", () => {
    expect(parts(vaultDoorBoxes(false), "inside")).toEqual([]);
    const lit = parts(vaultDoorBoxes(true), "inside");
    expect(lit.length).toBeGreaterThan(0);
    for (const b of lit) {
      expect(inOpening(b), JSON.stringify(b)).toBe(true);
      expect(hsl(b.color).l, b.color).toBeGreaterThan(0.6);
      expect(hsl(b.color).warm, b.color).toBe(true);
    }
  });

  it("has a warm trim on its frame, so it stands out from grey rock", () => {
    const frame = vaultDoorBoxes(false).filter((b) => !b.part);
    expect(frame.some((b) => hsl(b.color).warm && hsl(b.color).s > 0.3), frame.map((b) => b.color).join(" ")).toBe(true);
  });
});

describe("every lock's boxes", () => {
  const cases = [
    ["a shut chest", chestBoxes(false), CHEST_FOOTPRINT],
    ["an open chest", chestBoxes(true), CHEST_FOOTPRINT],
    ["a shut vault door", vaultDoorBoxes(false), DOOR_FOOTPRINT],
    ["an open vault door", vaultDoorBoxes(true), DOOR_FOOTPRINT],
  ] as const;

  it.each(cases)("%s stands on the ground and keeps within its footprint", (_what, boxes, foot) => {
    expect(Math.min(...boxes.map(bottom))).toBeCloseTo(0);
    for (const b of boxes) {
      expect(Math.abs(b.x) + b.sx / 2, JSON.stringify(b)).toBeLessThanOrEqual(foot.hw + 1e-9);
      expect(Math.abs(b.z) + b.sz / 2, JSON.stringify(b)).toBeLessThanOrEqual(foot.hd + 1e-9);
      for (const n of [b.sx, b.sy, b.sz]) expect(n).toBeGreaterThan(0);
    }
  });
});

describe("a decoration", () => {
  /** A found decoration stands at a spot the village holds clear to this size (G1's clearance tests). */
  const FOOT = 0.7;
  const MAX_TALL = 2.6;

  it.each(DECOR_IDS)("%s has boxes, stands on the ground, and fits a 1.4 by 1.4 footprint, at most 2.6 tall", (id) => {
    const boxes = decorBoxes(id);
    expect(boxes.length).toBeGreaterThan(0);
    expect(Math.min(...boxes.map(bottom))).toBeCloseTo(0);
    expect(Math.max(...boxes.map(top))).toBeLessThanOrEqual(MAX_TALL);
    for (const b of boxes) {
      expect(Math.abs(b.x) + b.sx / 2, JSON.stringify(b)).toBeLessThanOrEqual(FOOT + 1e-9);
      expect(Math.abs(b.z) + b.sz / 2, JSON.stringify(b)).toBeLessThanOrEqual(FOOT + 1e-9);
      for (const n of [b.sx, b.sy, b.sz]) expect(n).toBeGreaterThan(0);
      expect(b.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("a stone bench reads as a bench: a seat wider than its legs, standing on them, and a back above it (smoke cosmetic)", () => {
    const boxes = decorBoxes("stone-bench");
    const seat = boxes.reduce((a, b) => (b.sx * b.sz > a.sx * a.sz ? b : a));
    const legs = boxes.filter((b) => top(b) <= bottom(seat) + 1e-9 && bottom(b) < 1e-9);
    expect(legs.length).toBeGreaterThanOrEqual(2);
    for (const l of legs) expect(l.sx).toBeLessThan(seat.sx / 2);
    const back = boxes.filter((b) => bottom(b) >= top(seat) - 1e-9 && b.z < 0);
    expect(back.length).toBeGreaterThan(0);
    expect(new Set(boxes.map((b) => b.color)).size, "the seat and the legs are two tones").toBeGreaterThan(1);
  });

  it("gives every decoration its own shape", () => {
    const shapes = DECOR_IDS.map((id) => JSON.stringify(decorBoxes(id)));
    expect(new Set(shapes).size).toBe(DECOR_IDS.length);
  });
});

describe("the Puzzle Tower", () => {
  const { baseH, storeyH, body, door } = PUZZLE_TOWER;
  const highest = (boxes: readonly LockBox[]) => Math.max(...boxes.map(top));

  it("is the base alone with no floor open", () => {
    expect(highest(towerBoxes(0))).toBeCloseTo(baseH);
  });

  it("grows one storey for each open floor", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(highest(towerBoxes(n)), `${n} open`).toBeCloseTo(baseH + n * storeyH);
  });

  it("holds the base and every lower storey unchanged as it grows", () => {
    const same = (a: readonly LockBox[], b: readonly LockBox[]) => a.every((x) => b.some((y) => JSON.stringify(x) === JSON.stringify(y)));
    for (const n of [0, 1, 2, 3, 4]) expect(same(towerBoxes(n), towerBoxes(n + 1)), `${n} within ${n + 1}`).toBe(true);
  });

  it("stops at five storeys, and never below the base", () => {
    expect(towerBoxes(9)).toEqual(towerBoxes(5));
    expect(towerBoxes(99)).toEqual(towerBoxes(5));
    expect(towerBoxes(-3)).toEqual(towerBoxes(0));
    expect(towerBoxes(2.9)).toEqual(towerBoxes(2));
  });

  it("stands on the ground, and every box keeps within the 6 by 6 body, with no zero-size box", () => {
    for (let n = 0; n <= 5; n++) {
      const boxes = towerBoxes(n);
      expect(Math.min(...boxes.map(bottom)), `${n} open`).toBeCloseTo(0);
      for (const b of boxes) {
        expect(Math.abs(b.x) + b.sx / 2, JSON.stringify(b)).toBeLessThanOrEqual(body / 2 + 1e-9);
        expect(Math.abs(b.z) + b.sz / 2, JSON.stringify(b)).toBeLessThanOrEqual(body / 2 + 1e-9);
        for (const v of [b.sx, b.sy, b.sz]) expect(v).toBeGreaterThan(0);
        expect(b.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("has a door on the west face, where E climbs: a slab flush with the body's west edge, on the plinth, narrower than the wall", () => {
    expect(door.x - PUZZLE_TOWER.x).toBeLessThan(-body / 2);
    const slabs = towerBoxes(0).filter((b) => Math.abs(b.x - b.sx / 2 + body / 2) < 1e-9 && b.sz < body / 2 && bottom(b) > 0 && bottom(b) < 0.5 && top(b) < baseH);
    expect(slabs.length).toBeGreaterThan(0);
  });

  it("has a coloured door, and a coloured banner and trim on every storey, so it is no drab grey box (smoke cosmetic)", () => {
    const coloured = (boxes: readonly LockBox[]) => boxes.filter((b) => b.color !== "#9ccfe3" && hsl(b.color).s > 0.45);
    // The ground floor's door, flush with the west face.
    expect(coloured(towerBoxes(0)).some((b) => b.x - b.sx / 2 <= -body / 2 + 1e-9), "a coloured door").toBe(true);
    for (let n = 1; n <= 5; n++) {
      const added = towerBoxes(n).filter((b) => !towerBoxes(n - 1).some((a) => JSON.stringify(a) === JSON.stringify(b)));
      expect(coloured(added).length, `storey ${n}`).toBeGreaterThanOrEqual(2);
      // The banner hangs on the west face, toward the village, under the storey's cornice.
      expect(added.some((b) => coloured([b]).length === 1 && b.x < -body / 2 + 0.3 && b.sz < 1.2), `storey ${n} banner`).toBe(true);
    }
  });

  it("is one box more or fewer per floor, never a different tower: each storey adds boxes", () => {
    for (let n = 0; n < 5; n++) expect(towerBoxes(n + 1).length).toBeGreaterThan(towerBoxes(n).length);
  });
});
