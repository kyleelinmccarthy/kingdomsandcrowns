"use client";

import "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CROWN_LOW, type CeremonyState, type CeremonyStep } from "@/lib/realm/ceremony/ceremony";
import type { HeroState } from "@/lib/realm/movement";
import type { SpriteTextures } from "./sprite-source";

const SPARKLES = 16;
const SPARKLE_MS = 700;

/**
 * The ceremony crown above the hero (hovering, descending, then worn for the
 * rest of the visit) and one burst of gold sparkles when it settles. Reads the
 * ceremony state from a ref every frame; renders nothing while no ceremony
 * has started.
 */
export function CeremonyLayer({ sim, heroRef, textures, calm, motion }: { sim: RefObject<CeremonyState | null>; heroRef: RefObject<HeroState>; textures: SpriteTextures; calm: boolean; motion: boolean }) {
  const crown = useRef<THREE.Sprite>(null);
  // Object3D, not Points: the JSX intrinsic's geometry generic does not match a plain THREE.Points ref (see spell-layer.tsx).
  const points = useRef<THREE.Object3D>(null);
  const burst = useRef<{ x: number; y: number; z: number; startedAt: number } | null>(null);
  const lastStep = useRef<CeremonyStep | null>(null);
  const buffer = useMemo(() => new Float32Array(SPARKLES * 3), []);

  useFrame((state) => {
    const s = sim.current;
    const nowMs = state.clock.elapsedTime * 1000;
    const p = heroRef.current.position;
    if (crown.current) {
      const visible = s !== null && s.step !== "walk";
      crown.current.visible = visible;
      if (visible && s) {
        const bob = motion && s.step !== "descend" ? Math.sin(state.clock.elapsedTime * 2) * 0.05 : 0;
        crown.current.position.set(p.x, s.crownY + bob, p.z);
      }
    }
    if (s && s.step !== lastStep.current) {
      // Sparkles once, as the crown settles. A skipped ceremony and reduced motion both go without.
      if (s.step === "hail" && motion && !s.skipped) burst.current = { x: p.x, y: CROWN_LOW, z: p.z, startedAt: nowMs };
      lastStep.current = s.step;
    }
    const pts = points.current as THREE.Points | null;
    const b = burst.current;
    if (!pts) return;
    if (!b) {
      pts.visible = false;
      return;
    }
    const k = (nowMs - b.startedAt) / SPARKLE_MS;
    if (k >= 1) {
      burst.current = null;
      pts.visible = false;
      return;
    }
    pts.visible = true;
    // Written through the BufferAttribute (like spell-layer.tsx's bursts), not by indexing
    // `buffer` directly: the React Compiler treats a useMemo's return value as immutable, but
    // the geometry attribute fetched off the ref each frame is a plain mutable handle.
    const pos = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < SPARKLES; i++) {
      const a = (i / SPARKLES) * Math.PI * 2;
      const r = 0.3 + k * 1.6;
      pos.setXYZ(i, b.x + Math.cos(a) * r, b.y + Math.sin(a * 3) * 0.4 + k * 0.6, b.z + Math.sin(a) * r);
    }
    pos.needsUpdate = true;
    (pts.material as THREE.PointsMaterial).opacity = 1 - k;
  });

  const sparkle = calm ? "#c9b27a" : "#fde68a";
  return (
    <>
      {textures.crown && (
        <sprite ref={crown} visible={false} scale={[1.2, 1.2, 1]}>
          <spriteMaterial map={textures.crown} transparent alphaTest={0.1} />
        </sprite>
      )}
      <points ref={points} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[buffer, 3]} />
        </bufferGeometry>
        <pointsMaterial color={sparkle} size={0.18} transparent sizeAttenuation depthWrite={false} />
      </points>
    </>
  );
}
