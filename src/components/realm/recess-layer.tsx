"use client";

import "@react-three/fiber";
import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { RecessSim } from "./use-recess-sim";
import type { SpriteTextures } from "./sprite-source";
import { GLEAM_COUNT, LAP_START, LAP_WAYPOINTS } from "@/lib/realm/recess/recess";
import { GROUND_Y, RING_CALM, RING_GOLD } from "@/lib/realm/markers";

/** Pooled gleam sprites, the ring markers, and the start banner; visible only while recess is active. */
export function RecessLayer({ sim, textures, calm, motion }: { sim: RefObject<RecessSim>; textures: SpriteTextures; calm: boolean; motion: boolean }) {
  const gleamSprites = useRef<(THREE.Sprite | null)[]>([]);
  const ring = useRef<THREE.Group>(null);

  useFrame((state) => {
    const s = sim.current.state;
    if (ring.current) ring.current.visible = s.active;
    for (let i = 0; i < GLEAM_COUNT; i++) {
      const sprite = gleamSprites.current[i];
      if (!sprite) continue;
      const g = s.gleams[i];
      if (!s.active || !g) {
        sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      const bob = motion ? Math.sin(state.clock.elapsedTime * 3 + i) * 0.1 : 0;
      sprite.position.set(g.position.x, 0.8 + bob, g.position.z);
    }
  });

  const marker = calm ? RING_CALM : RING_GOLD; // the world's one gold, imported — not re-typed as a hex literal
  return (
    <>
      {Array.from({ length: GLEAM_COUNT }, (_, i) => (
        <sprite key={`g${i}`} ref={(el) => { gleamSprites.current[i] = el; }} visible={false} scale={[0.9, 1.2, 1]}>
          <spriteMaterial map={textures.gleam ?? undefined} transparent alphaTest={0.1} />
        </sprite>
      ))}
      <group ref={ring} visible={false}>
        {LAP_WAYPOINTS.map((w, i) => (
          <mesh key={`w${i}`} position={[w.x, GROUND_Y.lapWaypoint, w.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.6, 16]} />
            <meshStandardMaterial color={marker} />
          </mesh>
        ))}
        {textures.banner && (
          <sprite position={[LAP_START.x, 1, LAP_START.z - 1.5]} scale={[1.5, 2, 1]}>
            <spriteMaterial map={textures.banner} transparent alphaTest={0.1} />
          </sprite>
        )}
      </group>
    </>
  );
}
