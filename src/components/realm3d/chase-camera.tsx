"use client";

/**
 * THE CAMERA, where the child put it and nowhere else.
 *
 * On the child's own boom — their yaw, their pitch, their distance (`chaseLens`, `controls.ts`) — off
 * the ground under them, not their head, so a jump is them rising in frame. It never swings round a
 * roof, ducks under a canopy, lifts over a tower or comes in along a blocked line: whatever stands
 * between it and the child is seen through (`see-through.ts`). The one thing it does on its own is
 * stay above the ground under the lens, and that only ever raises it. Riding raises and pulls it
 * back so the mount is in the shot (`camOffsets`).
 */

import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { supportHeight, type Collider } from "@/lib/realm3d/collision";
import { chaseLens, DEFAULT_PITCH, PITCH_MIN, terrainClearance, type LookState } from "@/lib/realm3d/controls";
import { camOffsets, type RideBus } from "@/lib/realm3d/riding";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import type { RealmWorld } from "@/lib/realm3d/worldgen";

/** How much of a jump the camera follows. 0 and the child leaves the frame; 1 and the jump is invisible. */
const CAM_LIFT = 0.3;
/** How high over the ground under it the lens stays, on top of the pitch's own clearance. */
const OVER_GROUND = 0.6;
/** How fast the lens settles to a new height while the mouse is not on it: a hill is a rise, not a jolt. */
const SETTLE = 12;

export function ChaseCamera({
  heroRef,
  yawRef,
  view,
  bus,
  close,
  solids,
  world,
  ride = null,
}: {
  heroRef: React.RefObject<THREE.Vector3>;
  yawRef: React.RefObject<number>;
  view: React.RefObject<LookState>;
  bus: HudBus;
  close: boolean;
  solids: Collider[];
  world: RealmWorld;
  ride?: RideBus | null;
}) {
  const { camera } = useThree();
  const lens = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const off = useMemo(() => new THREE.Vector3(), []);
  const rideCam = useMemo(() => ({ lift: 0, pull: 0, tilt: 0 }), []);

  useFrame((_, rawDt) => {
    if (bus.paused) return;
    const dt = Math.min(0.05, rawDt);
    const p = heroRef.current;
    const v = view.current;
    const floorY = supportHeight(p.x, p.z, world.heightAt(p.x, p.z), solids);
    camOffsets(ride ? ride.cam : 0, rideCam);
    const anchorY = floorY + (p.y - floorY) * CAM_LIFT + rideCam.lift;

    // `?close` drops the camera to the hero's shoulder: a way to look at the figure, not a mode.
    if (close) {
      off.set(0, 2.4, 4.2).applyAxisAngle(up, yawRef.current);
      const cx = p.x + off.x;
      const cz = p.z + off.z;
      lens.set(cx, Math.max(anchorY + off.y, world.heightAt(cx, cz) + 0.6), cz);
      camera.position.lerp(lens, 1 - Math.exp(-dt * 6));
      look.set(p.x, anchorY + 1.7, p.z);
      camera.lookAt(look);
      return;
    }

    const pitch = Math.max(PITCH_MIN, v.pitch - rideCam.tilt);
    const dist = v.dist * (1 + rideCam.pull);
    chaseLens(lens, p.x, anchorY, p.z, yawRef.current, pitch, dist, world.heightAt, terrainClearance(v.pitch) + OVER_GROUND);
    // Rigid on the ground plane, so a turn of the mouse is a turn of the view and never a drift.
    // The height settles while the mouse is off it, so walking over a hill is not a jolt.
    const y = v.held ? lens.y : camera.position.y + (lens.y - camera.position.y) * (1 - Math.exp(-dt * SETTLE));
    camera.position.set(lens.x, y, lens.z);
    look.set(p.x, anchorY + 1.2 + 2.2 * Math.min(1, v.pitch / DEFAULT_PITCH), p.z);
    camera.lookAt(look);
  });
  return null;
}
