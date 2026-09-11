import { describe, it, expect } from "vitest";
import { FACING_VEC, type Facing } from "./movement";
import type { VillagerStatus } from "./layout";
import { facingAngle, shadowFootprint, markerFor, GROUND_Y, BEACON, RING_INNER, RING_OUTER, RING_NOTCH_ARC, RING_GOLD, RING_CALM, SHADOW_OPACITY, SHADOW_OPACITY_CALM, type MarkerKind } from "./markers";

const FACINGS: Facing[] = ["n", "s", "e", "w"];

/**
 * Where the ring's notch (and the arrowhead filling it) actually points, in world space.
 * The ring group is <group rotation={[-Math.PI/2, 0, facingAngle(f)]}> and the notch points
 * along the geometry's local +Y. A three.js Euler in the default "XYZ" order with y = 0
 * composes as RX(x)·RZ(z); RZ(a)·(0,1,0) = (-sin a, cos a, 0), and RX(-PI/2) maps
 * (x,y,z) -> (x, z, -y). So local +Y lands on (-sin a, 0, -cos a).
 * Derived here rather than hardcoded, so a future ring rewrite cannot silently invert the cue.
 */
function notchDirection(angle: number): { x: number; z: number } {
  return { x: -Math.sin(angle), z: -Math.cos(angle) };
}

describe("facingAngle", () => {
  it("turns the notch to the direction the hero faces, derived from FACING_VEC", () => {
    for (const facing of FACINGS) {
      const dir = notchDirection(facingAngle(facing));
      expect(dir.x).toBeCloseTo(FACING_VEC[facing].x, 10);
      expect(dir.z).toBeCloseTo(FACING_VEC[facing].z, 10);
    }
  });
  it("gives each facing its own angle", () => {
    const angles = FACINGS.map(facingAngle);
    expect(new Set(angles).size).toBe(4);
  });
  it("is stable: the same facing always gives the same angle", () => {
    expect(facingAngle("n")).toBe(facingAngle("n"));
  });
});

describe("ring constants", () => {
  it("is a ring, not a disc", () => {
    expect(RING_INNER).toBe(0.42);
    expect(RING_OUTER).toBe(0.55);
    expect(RING_INNER).toBeLessThan(RING_OUTER);
  });
  it("notches 60 degrees out of the circle", () => {
    expect(RING_NOTCH_ARC).toBe(Math.PI / 3);
    expect(RING_NOTCH_ARC).toBeLessThan(Math.PI * 2);
  });
  it("carries a gold and a calm colour", () => {
    expect(RING_GOLD).toBe("#c9a84c");
    expect(RING_CALM).toBe("#8a7d5a");
  });
});

describe("shadowFootprint", () => {
  it("returns the prop's own width and depth, never a square", () => {
    expect(shadowFootprint({ w: 3, d: 1 })).toEqual({ w: 3, d: 1 });
    expect(shadowFootprint({ w: 0.6, d: 2.4 })).toEqual({ w: 0.6, d: 2.4 });
  });
  it("drops a prop size's height, so nothing scales a shadow by h", () => {
    // Bound to a const first: a fresh object literal passed straight in would trip
    // TypeScript's excess-property check on `{ w: number; d: number }`, and this is
    // exactly how realm-scene.tsx calls it — with a Prop's own `size`.
    const propSize = { w: 8, d: 6, h: 6 };
    expect(shadowFootprint(propSize)).toEqual({ w: 8, d: 6 });
  });
  it("returns a fresh object, so scaling a mesh can never write back into the layout", () => {
    const size = { w: 0.8, d: 0.8 };
    expect(shadowFootprint(size)).not.toBe(size);
  });
  it("keeps a figure's square footprint square", () => {
    expect(shadowFootprint({ w: 0.8, d: 0.8 })).toEqual({ w: 0.8, d: 0.8 });
  });
});

describe("shadow opacities", () => {
  it("is faint, and fainter still under a calm palette, but never gone", () => {
    expect(SHADOW_OPACITY).toBe(0.22);
    expect(SHADOW_OPACITY_CALM).toBe(0.14);
    expect(SHADOW_OPACITY_CALM).toBeLessThan(SHADOW_OPACITY);
    expect(SHADOW_OPACITY_CALM).toBeGreaterThan(0);
  });
});

describe("GROUND_Y", () => {
  it("names every rung of the ladder", () => {
    expect(GROUND_Y.water).toBe(0.02);
    expect(GROUND_Y.path).toBe(0.03);
    expect(GROUND_Y.foundation).toBe(0.04);
    expect(GROUND_Y.propShadow).toBe(0.045);
    expect(GROUND_Y.lapWaypoint).toBe(0.05);
    expect(GROUND_Y.figureShadow).toBe(0.055);
    expect(GROUND_Y.heroRing).toBe(0.06);
  });
  // Asserted over Object.values, in declaration order, so a later slice adding a rung has to
  // place it in the ladder rather than append it and quietly sink under a path tile.
  it("is strictly increasing in declaration order", () => {
    const rungs: number[] = Object.values(GROUND_Y);
    expect(rungs.length).toBeGreaterThanOrEqual(7);
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i]).toBeGreaterThan(rungs[i - 1]);
    }
  });
  it("clears the path, the foundation and the recess waypoint with the marks that sit on them", () => {
    expect(GROUND_Y.propShadow).toBeGreaterThan(GROUND_Y.foundation);
    expect(GROUND_Y.figureShadow).toBeGreaterThan(GROUND_Y.lapWaypoint);
    expect(GROUND_Y.heroRing).toBeGreaterThan(GROUND_Y.figureShadow);
    expect(GROUND_Y.water).toBeLessThan(GROUND_Y.path);
  });
});

describe("markerFor", () => {
  it("marks the objective, the built and nothing else", () => {
    expect(markerFor("objective")).toBe("quest");
    expect(markerFor("built")).toBe("done");
    expect(markerFor("work")).toBeNull();
  });
  it("answers for every status a villager can hold", () => {
    const statuses: VillagerStatus[] = ["objective", "work", "built"];
    const marks: MarkerKind[] = statuses.map(markerFor);
    expect(marks).toEqual(["quest", null, "done"]);
  });
});

describe("BEACON", () => {
  it("is a thin gold column tall enough to read over a building", () => {
    expect(BEACON).toEqual({ radius: 0.14, height: 3.4, calmHeight: 2.2, opacity: 0.45, calmOpacity: 0.18 });
  });
  it("is shorter and quieter under a calm palette, and never absent", () => {
    expect(BEACON.calmHeight).toBeLessThan(BEACON.height);
    expect(BEACON.calmOpacity).toBeLessThan(BEACON.opacity);
    expect(BEACON.calmHeight).toBeGreaterThan(0);
    expect(BEACON.calmOpacity).toBeGreaterThan(0);
  });
  it("stands clear of the ground ladder", () => {
    expect(BEACON.height).toBeGreaterThan(GROUND_Y.heroRing);
  });
});
