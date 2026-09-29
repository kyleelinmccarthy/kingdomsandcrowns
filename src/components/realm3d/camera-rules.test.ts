// src/components/realm3d/camera-rules.test.ts
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The owner: "it still zooms in when going into objects like trees and it shouldnt do that". The
 * camera sits where the child put it; what is in the way is seen through (`see-through.ts`). The
 * scenes import `three`, which nothing under Vitest may load, so this holds the line on their source.
 */
const R3 = join(process.cwd(), "src/components/realm3d");
const read = (f: string) => readFileSync(join(R3, f), "utf8");

describe("the camera never moves itself", () => {
  it("has no boom that swings, ducks, lifts or pulls in", () => {
    expect(existsSync(join(process.cwd(), "src/lib/realm3d/camera-boom.ts"))).toBe(false);
    for (const f of ["spike-scene.tsx", "doorstep.tsx", "chase-camera.tsx"]) {
      expect(read(f), f).not.toMatch(/\b(aimBoom|lensFrac|insideWall|swingStep|pickBoom|swingAllowed|orbitDrag)\b/);
    }
  });

  it("takes the island's mouse through the one look door", () => {
    const scene = read("spike-scene.tsx");
    expect(scene).toMatch(/<MouseLook\b/);
    expect(scene).toMatch(/<ChaseCamera\b/);
    expect(scene).not.toMatch(/addEventListener\("pointerdown"/);
  });
});
