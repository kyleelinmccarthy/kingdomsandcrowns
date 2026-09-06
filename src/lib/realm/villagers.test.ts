import { describe, it, expect } from "vitest";
import { VILLAGERS, villagerForBuilding, villagerAvatar, villagerPosition, nearestVillager, REACH, VILLAGER_OFFSET } from "./villagers";
import { BUILDINGS } from "@/lib/utils/kingdom";

describe("villagers", () => {
  it("has exactly one villager per building, in building order, each with a name and greeting", () => {
    expect(VILLAGERS.map((v) => v.buildingId)).toEqual(BUILDINGS.map((b) => b.id));
    const ids = new Set(VILLAGERS.map((v) => v.id));
    expect(ids.size).toBe(VILLAGERS.length);
    for (const v of VILLAGERS) {
      expect(v.name.length).toBeGreaterThan(0);
      expect(v.greeting.endsWith("?")).toBe(true);
    }
    expect(villagerForBuilding("well")!.name).toBe("Old Bram");
    expect(villagerForBuilding("nope")).toBeNull();
  });

  it("builds a full avatar config for a villager with no companion or crest", () => {
    const cfg = villagerAvatar(villagerForBuilding("mill")!);
    expect(cfg.companion).toBeNull();
    expect(cfg.outfit).toBe("vest");
    expect(typeof cfg.skinTone).toBe("string");
  });

  it("stands the villager south of the footprint by the offset", () => {
    expect(villagerPosition({ x: -5, z: 8 }, { d: 3 })).toEqual({ x: -5, z: 8 + 1.5 + VILLAGER_OFFSET });
  });

  it("finds the nearest villager within reach, ties to array order, none out of reach", () => {
    const vs = [
      { id: "a", position: { x: 0, z: 0 } },
      { id: "b", position: { x: 2, z: 0 } },
      { id: "c", position: { x: 0, z: 2 } },
    ];
    expect(nearestVillager({ x: 10, z: 10 }, vs)).toBeNull();
    expect(nearestVillager({ x: 1.6, z: 0 }, vs)).toBe("b"); // 0.4 from b, 1.6 from a
    expect(nearestVillager({ x: 1, z: 1 }, vs)).toBe("a"); // all three at 1.41: equal distances resolve to array order
    expect(nearestVillager({ x: 0, z: 2 + REACH }, [vs[2]])).toBe("c"); // exactly at reach counts
    expect(nearestVillager({ x: 0, z: 2 + REACH + 0.01 }, [vs[2]])).toBeNull();
  });
});
