"use client";

/**
 * THE CAMERA, where the child put it and nowhere else.
 *
 * On the child's own boom — their yaw, their pitch, their distance (`chaseShot`, `controls.ts`) — off
 * the ground under them, not their head, so a jump is them rising in frame. It never swings round a
 * roof, ducks under a canopy, lifts over a tower or comes in along a blocked line: whatever stands
 * between it and the child is seen through (`see-through.ts`). What it does on its own is stay above
 * the ground under the lens, which only ever raises it, and let the floor it hangs off glide over a
 * step (`settleFloor`). Riding raises and pulls it back so the mount is in the shot (`camOffsets`).
 */

import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { supportHeight, type Collider } from "@/lib/realm3d/collision";
import { camAnchor, chaseShot, makeCamFloor, settleFloor, type CamRide, type LookState } from "@/lib/realm3d/controls";
import { camOffsets, type RideBus } from "@/lib/realm3d/riding";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import type { RealmWorld } from "@/lib/realm3d/worldgen";

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
  const rideCam = useMemo<CamRide>(() => ({ lift: 0, pull: 0, tilt: 0 }), []);
  /** The floor under the child, eased over a step (`settleFloor`): the one thing here that glides. */
  const floor = useMemo(() => makeCamFloor(), []);

  useFrame((_, rawDt) => {
    if (bus.paused) return;
    const dt = Math.min(0.05, rawDt);
    const p = heroRef.current;
    const floorY = settleFloor(floor, p.x, p.z, supportHeight(p.x, p.z, world.heightAt(p.x, p.z), solids), dt);
    camOffsets(ride ? ride.cam : 0, rideCam);

    // `?close` drops the camera to the hero's shoulder: a way to look at the figure, not a mode.
    if (close) {
      const anchorY = camAnchor(floorY, p.y, rideCam.lift);
      off.set(0, 2.4, 4.2).applyAxisAngle(up, yawRef.current);
      const cx = p.x + off.x;
      const cz = p.z + off.z;
      lens.set(cx, Math.max(anchorY + off.y, world.heightAt(cx, cz) + 0.6), cz);
      camera.position.lerp(lens, 1 - Math.exp(-dt * 6));
      look.set(p.x, anchorY + 1.7, p.z);
      camera.lookAt(look);
      return;
    }

    // Rigid to the mouse — a turn or a tilt is a turn or a tilt of the view, never a drift — off
    // the eased floor, so stepping off a plinth is a glide and not a drop.
    const lookY = chaseShot(camera.position, p.x, p.y, p.z, floorY, yawRef.current, view.current, rideCam, world.heightAt);
    look.set(p.x, lookY, p.z);
    camera.lookAt(look);
  });
  return null;
}
