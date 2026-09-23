"use client";

/**
 * WHAT A CAST LOOKS LIKE, as geometry. The arithmetic is `@/lib/realm3d/spell-fx`; this file
 * owns the meshes and does as it is told.
 *
 * One pool, built once. Every slot is a group holding one mesh and one additive glow sprite,
 * and a spawn swaps the mesh's geometry rather than building anything: at sixty frames a
 * second with a child holding a key down, a renderer that constructs a geometry per cast is a
 * renderer that stutters, and a stutter is the one thing the owner will notice before the
 * spell. Nothing in the frame loop below allocates — not a vector, not a colour, not a string.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FX_POOL, fxAlpha, fxScale, glowLift, type FxKind, type FxSlot } from "@/lib/realm3d/spell-fx";

export { FX_POOL };

/**
 * The six shapes, unit-sized and pre-oriented so a slot's only rotation is its heading.
 * A ring lies flat, a beam runs from the origin along +z (so scaling z is "reach further"),
 * and a wall stands on the ground with its base at y = 0.
 */
function fxGeometries(): Record<FxKind, THREE.BufferGeometry> {
  return {
    charge: new THREE.IcosahedronGeometry(1, 1),
    bolt: new THREE.IcosahedronGeometry(1, 1),
    ring: new THREE.TorusGeometry(1, 0.17, 6, 24).rotateX(-Math.PI / 2),
    beam: new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    slab: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    aura: new THREE.TorusGeometry(1, 0.2, 6, 26).rotateX(-Math.PI / 2),
    // The summoned Sprite: a small bright knot, like a bolt that stayed.
    sprite: new THREE.OctahedronGeometry(1, 0),
  };
}

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * How a kind's unit geometry is stretched, written straight into the object's scale. The one
 * place the shapes' proportions live.
 */
function applyScale(target: THREE.Object3D, s: FxSlot, k: number): void {
  switch (s.kind) {
    case "charge":
      target.scale.setScalar(0.62 * k);
      return;
    case "bolt":
      // A knot, not a boulder, and it spins (see the frame loop) so it reads as alive.
      target.scale.setScalar(0.45);
      return;
    case "ring":
      target.scale.set(s.size * k, s.size * k * 0.55, s.size * k);
      return;
    case "beam":
      target.scale.set(0.42, 0.42, s.size);
      return;
    case "slab":
      target.scale.set(s.size, 3.4 * k, 0.55);
      return;
    case "aura":
      target.scale.set(s.size * k, s.size * k * 0.7, s.size * k);
      return;
    case "sprite":
      target.scale.set(0.34 * k, 0.5 * k, 0.34 * k);
      return;
  }
}

/** The glow sprite's size, per kind: generous on a bolt, which is the smallest mesh. */
function glowScale(s: FxSlot, k: number): number {
  switch (s.kind) {
    case "charge": return 2.6 * k;
    case "bolt": return 2.4;
    case "ring": return s.size * k * 1.1;
    case "beam": return 2.2;
    case "slab": return s.size * 0.7;
    case "aura": return s.size * k * 1.3;
    case "sprite": return 2.1 * k;
  }
}

export function SpellFx({ pool }: { pool: FxSlot[] }) {
  const geos = useMemo(() => fxGeometries(), []);
  const tex = useMemo(() => glowTexture(), []);
  const groups = useRef<(THREE.Group | null)[]>(new Array(FX_POOL).fill(null));
  const meshes = useRef<(THREE.Mesh | null)[]>(new Array(FX_POOL).fill(null));
  const sprites = useRef<(THREE.Sprite | null)[]>(new Array(FX_POOL).fill(null));
  /** Last `seq` drawn per slot, so a REUSED slot gets its new shape and colour. A ref, not a
      memo: the frame loop writes it, and the React compiler is right that a render's value is
      not the frame loop's to change. */
  const drawn = useRef(new Int32Array(FX_POOL));

  useEffect(() => {
    const own = geos;
    return () => {
      for (const g of Object.values(own)) g.dispose();
      tex.dispose();
    };
  }, [geos, tex]);

  useFrame((state) => {
    const spin = state.clock.elapsedTime * 6;
    for (let i = 0; i < FX_POOL; i++) {
      const g = groups.current[i];
      const mesh = meshes.current[i];
      const sprite = sprites.current[i];
      if (!g || !mesh || !sprite) continue;
      const s = pool[i];
      if (!s.live) {
        if (g.visible) g.visible = false;
        continue;
      }
      g.visible = true;
      if (drawn.current[i] !== s.seq) {
        drawn.current[i] = s.seq;
        mesh.geometry = geos[s.kind];
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.color.set(s.color);
        mat.blending = s.kind === "slab" ? THREE.NormalBlending : THREE.AdditiveBlending;
        mat.needsUpdate = true;
        (sprite.material as THREE.SpriteMaterial).color.set(s.color);
      }
      const k = fxScale(s);
      const a = fxAlpha(s);
      g.position.set(s.x, s.y, s.z);
      g.rotation.y = Math.atan2(s.dx, s.dz);
      applyScale(mesh, s, k);
      // The bolt tumbles; everything else is upright, and a ring that spun would flicker.
      mesh.rotation.set(s.kind === "bolt" ? spin : 0, s.kind === "bolt" ? spin * 0.7 : s.kind === "sprite" ? spin * 0.5 : 0, 0);
      (mesh.material as THREE.MeshBasicMaterial).opacity = a;
      const gs = glowScale(s, k);
      sprite.scale.set(gs, gs, 1);
      (sprite.material as THREE.SpriteMaterial).opacity = a * 0.8;
      // Drift the wall's glow up as it fades, so a barrier reads as dissolving upward.
      sprite.position.y = glowLift(s);
    }
  });

  return (
    <>
      {Array.from({ length: FX_POOL }, (_, i) => (
        <group key={i} ref={(el) => { groups.current[i] = el; }} visible={false}>
          <mesh ref={(el) => { meshes.current[i] = el; }} geometry={geos.ring}>
            <meshBasicMaterial
              transparent
              depthWrite={false}
              toneMapped={false}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          <sprite ref={(el) => { sprites.current[i] = el; }}>
            <spriteMaterial
              map={tex}
              transparent
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
        </group>
      ))}
    </>
  );
}
