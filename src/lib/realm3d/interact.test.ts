import { describe, expect, it } from "vitest";
import { buildWorldLayout } from "@/lib/realm/layout";
import { buildSpots, edgeDistance, pickSpot, siteLabel } from "./interact";

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
    expect(spots[find("site", "chapel")].target.label).toBe("the Chapel");
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
