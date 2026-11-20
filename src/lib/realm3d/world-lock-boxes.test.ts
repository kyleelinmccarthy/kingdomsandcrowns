import { describe, expect, it } from "vitest";
import { chestBoxes, CHEST_FOOTPRINT, DOOR_FOOTPRINT, DOOR_OPENING, vaultDoorBoxes, type LockBox } from "./world-lock-boxes";

const top = (b: LockBox) => b.y + b.sy / 2;
const bottom = (b: LockBox) => b.y - b.sy / 2;
const parts = (boxes: readonly LockBox[], part: LockBox["part"]) => boxes.filter((b) => b.part === part);
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
    const frame = (open: boolean) => vaultDoorBoxes(open).filter((b) => b.part !== "leaf");
    expect(frame(true)).toEqual(frame(false));
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
