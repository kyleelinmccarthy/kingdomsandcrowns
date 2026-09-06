import { describe, it, expect } from "vitest";
import { buildKingdomOverview } from "./deeds";
import { BUILDINGS } from "@/lib/utils/kingdom";

describe("buildKingdomOverview", () => {
  it("lists every building with progress, clamped, and tone-aware stories", () => {
    const gentle = buildKingdomOverview([{ buildingId: "well", deedsDone: 3 }, { buildingId: "bridge", deedsDone: 9 }], "gentle");
    expect(gentle.length).toBe(BUILDINGS.length);
    expect(gentle.find((b) => b.id === "well")).toMatchObject({ done: 3, total: 5, complete: false });
    expect(gentle.find((b) => b.id === "bridge")).toMatchObject({ done: 5, total: 5, complete: true });
    expect(gentle.find((b) => b.id === "mill")).toMatchObject({ done: 0, complete: false });
    const planks = gentle.find((b) => b.id === "bridge")!.deeds.find((d) => d.id === "bridge-planks")!;
    const monsters = buildKingdomOverview([], "monsters").find((b) => b.id === "bridge")!.deeds.find((d) => d.id === "bridge-planks")!;
    expect(planks.story).not.toBe(monsters.story);
    expect(monsters.story).toMatch(/Shadow blobs/);
  });
});
