"use client";

import "@react-three/fiber";
import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SpellSim } from "./use-spell-sim";
import type { SpriteTextures } from "./sprite-source";

const TROUBLE_POOL = 6;
const EFFECT_POOL = 12;
const BURST_POOL = 4;
const BURST_PARTICLES = 12;
const BURST_MS = 350;
const GRAY = new THREE.Color("#9ca3af");

type Burst = { origin: THREE.Vector3; startedAt: number; color: string };

/** Draws whatever the simulation holds this frame from fixed pools; nothing here allocates per frame. */
export function SpellLayer({ sim, textures, calm, motion }: { sim: RefObject<SpellSim>; textures: SpriteTextures; calm: boolean; motion: boolean }) {
  const troubleSprites = useRef<(THREE.Sprite | null)[]>([]);
  const effectMeshes = useRef<(THREE.Mesh | null)[]>([]);
  // Typed as Object3D: @react-three/fiber's JSX intrinsic for <points> carries a
  // BufferGeometry generic (NormalOrGLBufferAttributes) that a plain THREE.Points
  // ref (NormalBufferAttributes) does not structurally match; Object3D has no such
  // generic, so it accepts either, and reads below narrow back to Points.
  const burstPoints = useRef<(THREE.Object3D | null)[]>([]);
  const bursts = useRef<(Burst | null)[]>(new Array<Burst | null>(BURST_POOL).fill(null));
  const lastEffectIds = useRef<Set<string>>(new Set());
  // Colours are set in place on the pooled materials; the calm palette pulls them 40 percent toward grey.
  const tint = (material: THREE.MeshStandardMaterial, hex: string) => {
    material.color.set(hex);
    material.emissive.set(hex);
    if (calm) {
      material.color.lerp(GRAY, 0.4);
      material.emissive.lerp(GRAY, 0.4);
    }
  };

  useFrame((state) => {
    const s = sim.current;
    const nowMs = state.clock.elapsedTime * 1000;
    // Troubles: one pooled sprite per live trouble.
    for (let i = 0; i < TROUBLE_POOL; i++) {
      const sprite = troubleSprites.current[i];
      if (!sprite) continue;
      const t = s.troubles[i];
      if (!t) {
        sprite.visible = false;
        continue;
      }
      const tex = textures.troubles[t.kind];
      const mat = sprite.material as THREE.SpriteMaterial;
      if (tex && mat.map !== tex) {
        mat.map = tex;
        mat.needsUpdate = true;
      }
      sprite.visible = !!tex;
      const bob = motion ? Math.sin(state.clock.elapsedTime * 2 + i) * 0.08 : 0;
      sprite.position.set(t.position.x, 0.9 + bob, t.position.z);
    }
    // Effects: one pooled mesh per live effect; bursts on effects that vanished by hitting.
    const liveIds = new Set<string>();
    for (let i = 0; i < EFFECT_POOL; i++) {
      const mesh = effectMeshes.current[i];
      if (!mesh) continue;
      const e = s.effects[i];
      if (!e) {
        mesh.visible = false;
        continue;
      }
      liveIds.add(e.id);
      mesh.visible = true;
      tint(mesh.material as THREE.MeshStandardMaterial, e.spell.color);
      switch (e.kind) {
        case "projectile":
          mesh.position.set(e.position.x, 0.9, e.position.z);
          mesh.scale.set(e.radius, e.radius, e.radius);
          mesh.rotation.set(0, 0, 0);
          break;
        case "area":
          mesh.position.set(e.position.x, 0.1, e.position.z);
          mesh.scale.set(e.radius, 0.1, e.radius);
          break;
        case "beam": {
          const dx = e.to.x - e.from.x;
          const dz = e.to.z - e.from.z;
          const len = Math.hypot(dx, dz);
          mesh.position.set((e.from.x + e.to.x) / 2, 0.9, (e.from.z + e.to.z) / 2);
          mesh.scale.set(len, 0.25, 0.25);
          mesh.rotation.set(0, -Math.atan2(dz, dx), 0);
          break;
        }
        case "barrier": {
          const dx = e.b.x - e.a.x;
          const dz = e.b.z - e.a.z;
          mesh.position.set((e.a.x + e.b.x) / 2, 0.6, (e.a.z + e.b.z) / 2);
          mesh.scale.set(Math.hypot(dx, dz), 1.2, 0.4);
          mesh.rotation.set(0, -Math.atan2(dz, dx), 0);
          break;
        }
        case "self":
          mesh.position.set(e.position.x, 0.15, e.position.z);
          mesh.scale.set(e.spell.range || 1.5, 0.1, e.spell.range || 1.5);
          break;
        case "summon":
          mesh.position.set(e.position.x, 1.2 + (motion ? Math.sin(state.clock.elapsedTime * 4) * 0.1 : 0), e.position.z);
          mesh.scale.set(0.35, 0.35, 0.35);
          break;
      }
    }
    if (motion) {
      for (const id of lastEffectIds.current) {
        if (liveIds.has(id)) continue;
        // An effect that vanished this frame: burst where it was, if it was a projectile that hit something.
        const slot = bursts.current.findIndex((b) => b === null || nowMs - b.startedAt > BURST_MS);
        const prev = s.lastVanished[id];
        if (slot !== -1 && prev) bursts.current[slot] = { origin: new THREE.Vector3(prev.x, 0.9, prev.z), startedAt: nowMs, color: prev.color };
      }
    }
    lastEffectIds.current = liveIds;
    for (let i = 0; i < BURST_POOL; i++) {
      const points = burstPoints.current[i] as THREE.Points | null;
      const b = bursts.current[i];
      if (!points) continue;
      if (!b || nowMs - b.startedAt > BURST_MS) {
        points.visible = false;
        continue;
      }
      points.visible = true;
      const k = (nowMs - b.startedAt) / BURST_MS;
      const pos = points.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let p = 0; p < BURST_PARTICLES; p++) {
        const angle = (p / BURST_PARTICLES) * Math.PI * 2;
        pos.setXYZ(p, b.origin.x + Math.cos(angle) * k * 1.2, b.origin.y + k * 0.8, b.origin.z + Math.sin(angle) * k * 1.2);
      }
      pos.needsUpdate = true;
      (points.material as THREE.PointsMaterial).color.set(b.color);
      (points.material as THREE.PointsMaterial).opacity = 1 - k;
    }
  });

  return (
    <>
      {Array.from({ length: TROUBLE_POOL }, (_, i) => (
        <sprite key={`t${i}`} ref={(el) => { troubleSprites.current[i] = el; }} visible={false} scale={[1.4, 1.8, 1]}>
          <spriteMaterial transparent alphaTest={0.1} />
        </sprite>
      ))}
      {Array.from({ length: EFFECT_POOL }, (_, i) => (
        <mesh key={`e${i}`} ref={(el) => { effectMeshes.current[i] = el; }} visible={false}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial transparent opacity={0.85} emissiveIntensity={0.6} />
        </mesh>
      ))}
      {Array.from({ length: BURST_POOL }, (_, i) => (
        <points key={`b${i}`} ref={(el) => { burstPoints.current[i] = el; }} visible={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[new Float32Array(BURST_PARTICLES * 3), 3]} />
          </bufferGeometry>
          <pointsMaterial size={0.18} transparent sizeAttenuation />
        </points>
      ))}
    </>
  );
}
