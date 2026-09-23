/**
 * The ground under the hero, for the sound: water, road, or grass, and which country this is.
 * Built once from the generated world and the village layout; every query is a few arithmetic
 * operations and a height lookup, with no allocation, and it is asked a few times a second.
 */

import type { Prop } from "@/lib/realm/layout";
import type { RealmWorld } from "@/lib/realm3d/worldgen";
import type { GroundProbe } from "./cues";

/** The village lane's tiles are drawn twice their plan width (`spike-scene.tsx`'s `Road`). */
const LANE_HALF = 2.1;

type Seg = { ax: number; az: number; dx: number; dz: number; len2: number; hw2: number };

export function groundProbe(world: Pick<RealmWorld, "heightAt" | "waterLevelAt" | "biomeAt" | "roads">, paths: readonly Pick<Prop, "position" | "size">[]): GroundProbe {
  const segs: Seg[] = [];
  for (const r of world.roads) {
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1];
      const b = r.points[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      // A little wider than the drawn ribbon: the edge of a track still sounds like the track.
      const hw = r.halfWidth + 0.4;
      segs.push({ ax: a.x, az: a.z, dx, dz, len2: dx * dx + dz * dz || 1, hw2: hw * hw });
    }
  }
  let laneZ0 = Infinity;
  let laneZ1 = -Infinity;
  let laneX = 0;
  for (const p of paths) {
    laneZ0 = Math.min(laneZ0, p.position.z - p.size.d / 2);
    laneZ1 = Math.max(laneZ1, p.position.z + p.size.d / 2);
    laneX = p.position.x;
  }
  return {
    waterDepth: (x, z) => world.waterLevelAt(x, z) - world.heightAt(x, z),
    onRoad(x, z) {
      if (z >= laneZ0 && z <= laneZ1 && Math.abs(x - laneX) <= LANE_HALF) return true;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.len2));
        const ex = s.ax + s.dx * t - x;
        const ez = s.az + s.dz * t - z;
        if (ex * ex + ez * ez <= s.hw2) return true;
      }
      return false;
    },
    biome: (x, z) => world.biomeAt(x, z),
    fromVillage: (x, z) => Math.hypot(x, z),
  };
}
