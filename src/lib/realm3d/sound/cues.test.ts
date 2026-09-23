import { describe, expect, it } from "vitest";
import type { Biome } from "@/lib/realm3d/worldgen";
import { castCues, cueInfo, elementOf, fixtureCue, jitter, makeZoneTracker, roomFloor, surfaceAt, trackZone, troubleCue, zoneAt, zoneSound, type GroundProbe } from "./cues";
import { ALL_SOUNDS, EFFECTS, ELEMENTS, ZONES } from "./recipes";

function probe(o: Partial<{ depth: number; road: boolean; biome: Biome; from: number }> = {}): GroundProbe {
  return {
    waterDepth: () => o.depth ?? -1,
    onRoad: () => o.road ?? false,
    biome: () => o.biome ?? "meadow",
    fromVillage: () => o.from ?? 100,
  };
}

describe("what makes which sound", () => {
  it("gives every trouble event its own sound", () => {
    expect(troubleCue("cleared")).toBe("trouble-clear");
    expect(troubleCue("hit")).toBe("trouble-hit");
    expect(troubleCue("bounced")).toBe("blob-bounce");
    expect(troubleCue("shielded")).toBe("trouble-shielded");
    expect(troubleCue("sighted")).toBe("trouble-sighted");
  });

  it("gives every room's one thing its sound: the bell rope, the mill lever, the throne", () => {
    expect(fixtureCue("chapel")).toBe("fixture-bell");
    expect(fixtureCue("mill")).toBe("fixture-lever");
    expect(fixtureCue("castle")).toBe("fixture-throne");
    for (const room of ["mill", "bridge", "chapel", "market", "library", "watchtower", "garden", "castle"] as const) expect(EFFECTS).toContain(fixtureCue(room));
  });

  it("walks on boards indoors, and on flagstones in the great hall", () => {
    expect(roomFloor("chapel")).toBe("wood");
    expect(roomFloor("castle")).toBe("stone");
  });

  it("knows every spell element, and nothing else", () => {
    for (const e of ELEMENTS) {
      expect(elementOf(e)).toBe(e);
      const { charge, release } = castCues(e);
      expect(EFFECTS).toContain(charge);
      expect(EFFECTS).toContain(release);
    }
    expect(elementOf("plasma")).toBeNull();
    expect(elementOf(undefined)).toBeNull();
  });
});

describe("the mix's rules for each sound", () => {
  it("covers every sound", () => {
    for (const id of ALL_SOUNDS) expect(cueInfo(id).max).toBeGreaterThan(0);
  });

  it("never lets a footstep take a voice from a moment that matters", () => {
    const step = cueInfo("step-grass").priority;
    for (const id of ["complete", "rise", "found", "deed-right", "trouble-clear", "talk", "release-ember"] as const) expect(cueInfo(id).priority).toBeGreaterThan(step);
    expect(cueInfo("complete").priority).toBeGreaterThanOrEqual(cueInfo("trouble-hit").priority);
  });

  it("keeps the ambience and the music off the effects' voices", () => {
    expect(cueInfo("amb-owl").bus).toBe("amb");
    expect(cueInfo("bed-waves").bus).toBe("amb");
    expect(cueInfo("step-road").bus).toBe("sfx");
  });
});

describe("the ground underfoot", () => {
  it("splashes in the shallows, scuffs on the road, and brushes the grass", () => {
    expect(surfaceAt(probe({ depth: 0.3 }), 0, 0)).toBe("water");
    expect(surfaceAt(probe({ depth: 0.02 }), 0, 0)).toBe("grass");
    expect(surfaceAt(probe({ road: true }), 0, 0)).toBe("road");
    expect(surfaceAt(probe({ road: true, depth: 0.5 }), 0, 0)).toBe("water");
    expect(surfaceAt(probe(), 0, 0)).toBe("grass");
  });

  it("hears the village, the wood, the shore and the summit", () => {
    expect(zoneAt(probe({ from: 10, biome: "forest" }), 0, 0)).toBe("village");
    expect(zoneAt(probe({ biome: "forest" }), 0, 0)).toBe("wood");
    expect(zoneAt(probe({ biome: "wood" }), 0, 0)).toBe("wood");
    expect(zoneAt(probe({ biome: "shore" }), 0, 0)).toBe("shore");
    expect(zoneAt(probe({ biome: "meadow", depth: 0.4 }), 0, 0)).toBe("shore");
    expect(zoneAt(probe({ biome: "crag" }), 0, 0)).toBe("summit");
    expect(zoneAt(probe({ biome: "moor" }), 0, 0)).toBe("summit");
    expect(zoneAt(probe({ biome: "heath" }), 0, 0)).toBe("meadow");
  });

  it("changes country only when two samples in a row agree", () => {
    const t = makeZoneTracker();
    expect(trackZone(t, "village")).toBe("village");
    expect(trackZone(t, "wood")).toBeNull();
    expect(trackZone(t, "village")).toBeNull();
    expect(trackZone(t, "wood")).toBeNull();
    expect(trackZone(t, "wood")).toBe("wood");
    expect(t.current).toBe("wood");
  });
});

describe("the soundscape", () => {
  it("has beds and little sounds for every country, and indoors is the quietest", () => {
    for (const z of ZONES) {
      const s = zoneSound(z);
      expect(s.beds.length).toBeGreaterThan(0);
      expect(s.details.length).toBeGreaterThan(0);
      expect(s.minGap).toBeLessThan(s.maxGap);
      for (const [bed] of s.beds) expect(ALL_SOUNDS).toContain(bed);
      for (const d of s.details) expect(ALL_SOUNDS).toContain(d);
    }
    expect(zoneSound("indoors").beds.length).toBe(1);
  });

  it("times it from a deterministic sequence", () => {
    expect(jitter(3)).toBe(jitter(3));
    const xs = Array.from({ length: 200 }, (_, i) => jitter(i));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(new Set(xs.map((x) => Math.floor(x * 10))).size).toBe(10);
  });
});
