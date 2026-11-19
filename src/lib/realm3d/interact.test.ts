import { describe, expect, it } from "vitest";
import { buildWorldLayout } from "@/lib/realm/layout";
import { KEEP_YARD } from "@/lib/realm/keep-yard";
import { buildSpots, edgeDistance, pickSpot, PLANS_TARGET, RIDDLE_LABEL, RIDDLE_VERB, siteLabel } from "./interact";

const layout = buildWorldLayout({
  castleType: "castle",
  buildings: [
    { id: "well", done: 5, total: 5, complete: true },
    { id: "chapel", done: 3, total: 5, complete: false },
  ],
  objectiveIds: ["chapel"],
});
const landmarks = [{ id: "summit-6", name: "Cloudfoot", position: { x: -184, z: -96 } }];
const spots = buildSpots({
  props: layout.props,
  sitePlan: 1.5,
  landmarks,
  castle: { x: 0, z: -12, hw: 3, hd: 1, label: "your castle" },
});
const find = (kind: string, id: string) => spots.findIndex((s) => s.target.kind === kind && s.target.id === id);

describe("what E can act on", () => {
  it("covers villagers, every site built or not, the castle and the landmarks", () => {
    expect(find("villager", "bram")).toBeGreaterThanOrEqual(0);
    expect(find("site", "well")).toBeGreaterThanOrEqual(0);
    expect(find("site", "chapel")).toBeGreaterThanOrEqual(0); // a foundation
    expect(find("site", "garden")).toBeGreaterThanOrEqual(0); // no progress at all
    expect(find("castle", "castle")).toBeGreaterThanOrEqual(0);
    expect(find("landmark", "summit-6")).toBeGreaterThanOrEqual(0);
  });

  it("labels things the way the prompt says them", () => {
    expect(spots[find("villager", "bram")].target.label).toBe("Old Bram");
    // A foundation's E is its villager's conversation, so it is labelled for them (interact-prompt.test.ts).
    expect(spots[find("site", "chapel")].target.label).toBe("Sister Wren");
    expect(siteLabel("Chapel")).toBe("the Chapel");
    expect(spots[find("landmark", "summit-6")].target.label).toBe("Cloudfoot");
    expect(siteLabel("the Mill")).toBe("the Mill");
  });

  it("leaves the castle out when there is none", () => {
    const none = buildSpots({ props: layout.props, sitePlan: 1.5, landmarks, castle: null });
    expect(none.some((s) => s.target.kind === "castle")).toBe(false);
  });

  it("measures reach from the edge of a building, not its middle", () => {
    const well = spots[find("site", "well")];
    expect(edgeDistance(well, well.x, well.z)).toBe(0);
    expect(edgeDistance(well, well.x + well.hw + 1, well.z)).toBeCloseTo(1);
  });

  it("finds nothing out in an empty field", () => {
    expect(pickSpot(spots, 60, 60, -1)).toBe(-1);
  });

  it("prefers the villager to the site they stand in front of", () => {
    const bram = spots[find("villager", "bram")];
    const i = pickSpot(spots, bram.x, bram.z + 0.9, -1);
    expect(spots[i].target.id).toBe("bram");
  });

  it("holds its choice instead of flickering between two equally close things", () => {
    const well = spots[find("site", "well")];
    const x = well.x - well.hw - 1.2; // west of the well, out of the villager's reach
    const first = pickSpot(spots, x, well.z, -1);
    expect(spots[first].target.id).toBe("well");
    // Step to where something else is only barely nearer: the well is kept.
    expect(pickSpot(spots, x, well.z, first)).toBe(first);
  });

  it("lets go once the child walks away", () => {
    const well = spots[find("site", "well")];
    const i = find("site", "well");
    expect(pickSpot(spots, well.x - well.hw - 6, well.z, i)).not.toBe(i);
  });
});

describe("the riddle stones", () => {
  it("adds one round spot per stone, read with E, its id the place's", () => {
    const stones = [{ placeId: "longwater", x: 33, z: -30.5 }, { placeId: "appleway", x: -5.5, z: 49 }];
    const withStones = buildSpots({ props: layout.props, sitePlan: 1.5, landmarks, castle: null, stones });
    const riddles = withStones.filter((s) => s.target.kind === "riddle");
    expect(riddles.map((s) => s.target)).toEqual([
      { kind: "riddle", id: "longwater", label: RIDDLE_LABEL, verb: RIDDLE_VERB },
      { kind: "riddle", id: "appleway", label: RIDDLE_LABEL, verb: RIDDLE_VERB },
    ]);
    expect(RIDDLE_VERB).toBe("Read");
    expect(riddles[0]).toMatchObject({ x: 33, z: -30.5, round: true });
    // Standing beside it, E is at the stone.
    expect(withStones[pickSpot(withStones, 33, -29.5, -1)].target).toMatchObject({ kind: "riddle", id: "longwater" });
  });

  it("has none when none are given", () => {
    expect(spots.some((s) => s.target.kind === "riddle")).toBe(false);
  });
});

describe("the plans board", () => {
  const board = KEEP_YARD.plansBoard;
  const withBoard = buildSpots({ props: layout.props, sitePlan: 1.5, landmarks, castle: null, plans: board });

  it("adds one spot at the board, read with E", () => {
    const plans = withBoard.filter((s) => s.target.kind === "plans");
    expect(plans.map((s) => s.target)).toEqual([{ kind: "plans", id: "plans-board", label: "Kingdom plans", verb: "Read" }]);
    expect(plans[0].target).toBe(PLANS_TARGET);
    expect(plans[0]).toMatchObject({ x: board.x, z: board.z });
  });

  it("is what E acts on when the hero walks up to it, from any side", () => {
    for (const [dx, dz] of [[0, 1.8], [1.8, 0], [0, -1.8], [-1.8, 0]]) {
      expect(withBoard[pickSpot(withBoard, board.x + dx, board.z + dz, -1)]?.target, `${dx},${dz}`).toBe(PLANS_TARGET);
    }
  });

  it("lets go once the hero walks on", () => {
    const i = withBoard.findIndex((s) => s.target.kind === "plans");
    expect(pickSpot(withBoard, board.x + 6, board.z, i)).not.toBe(i);
  });

  it("has none when none is given", () => {
    expect(spots.some((s) => s.target.kind === "plans")).toBe(false);
  });
});
