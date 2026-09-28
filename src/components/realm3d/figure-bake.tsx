"use client";

/**
 * A figure drawn ONCE and frozen into a few merged meshes.
 *
 * The hero's figure (`hero-figure.tsx`) is some thirty small meshes: a draw call each, and another
 * each for the shadow. One of it costs nothing worth counting. Eight villagers made of it doubled
 * the island's draws at spawn (277 → 541 a frame). But a villager does not walk, so nothing on them
 * needs animating part by part: `Baked` mounts the figure hidden, merges every part into one
 * geometry per surface (`lib/realm3d/bake-surface.ts`), each part painted its own colour, and draws
 * those instead. The same figure and the same look — face, hands, hair, clothes and gear — at a
 * handful of draws.
 *
 * The source stays mounted, hidden, so three.js never draws it, never lights by its lamp and never
 * casts its shadow; its per-frame hooks cost a few assignments each. Whatever turns the figure as a
 * whole (the group `Baked` sits in) still turns it.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { bakeSurface, type BakeSurface, type SurfaceTraits } from "@/lib/realm3d/bake-surface";
import { merge, paint } from "./geo-kit";

export type BakeMaterials = Record<BakeSurface, THREE.Material>;

const SURFACES: readonly BakeSurface[] = ["lit", "steel", "glow", "glass"];

/** The four shared materials every baked figure draws with. One set per scene; disposed with it. */
export function useBakeMaterials(): BakeMaterials {
  const mats = useMemo<BakeMaterials>(
    () => ({
      // Double-sided: a hood, a coat's open front and a cape are open shells.
      lit: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }),
      steel: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.38, metalness: 0.62 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      glass: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return mats;
}

function traits(m: THREE.Material): SurfaceTraits {
  const s = m as Partial<THREE.MeshStandardMaterial>;
  const e = s.emissive;
  const glow = e ? (0.2126 * e.r + 0.7152 * e.g + 0.0722 * e.b) * (s.emissiveIntensity ?? 1) : 0;
  return { transparent: m.transparent, metalness: s.metalness ?? 0, glow };
}

function colorOf(m: THREE.Material): string {
  const c = (m as Partial<THREE.MeshStandardMaterial>).color;
  return c ? `#${c.getHexString()}` : "#ffffff";
}

function shown(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (!p.visible) return false;
  return true;
}

/** Every mesh under `root`, merged into one geometry per surface, in `root`'s own space. */
function bakeMeshes(root: THREE.Object3D, mats: BakeMaterials): THREE.Mesh[] {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const parts: Record<BakeSurface, THREE.BufferGeometry[]> = { lit: [], steel: [], glow: [], glass: [] };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !shown(mesh, root)) return;
    const g = mesh.geometry.clone();
    // Position and normal only: the colour is painted in, and every part must merge with every other.
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    g.applyMatrix4(rel.multiplyMatrices(toRoot, mesh.matrixWorld));
    parts[bakeSurface(traits(mesh.material))].push(paint(g, colorOf(mesh.material)));
  });
  const out: THREE.Mesh[] = [];
  for (const k of SURFACES) {
    if (parts[k].length === 0) continue;
    const mesh = new THREE.Mesh(merge(parts[k]), mats[k]);
    for (const p of parts[k]) p.dispose();
    mesh.castShadow = mesh.receiveShadow = k === "lit" || k === "steel";
    out.push(mesh);
  }
  return out;
}

/** Draws `children` (a figure standing still) as a few merged meshes. See the header. */
export function Baked({ materials, children }: { materials: BakeMaterials; children: ReactNode }) {
  const src = useRef<THREE.Group>(null);
  const out = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const s = src.current;
    const o = out.current;
    if (!s || !o) return;
    const meshes = bakeMeshes(s, materials);
    s.visible = false;
    for (const m of meshes) o.add(m);
    return () => {
      for (const m of meshes) {
        o.remove(m);
        m.geometry.dispose();
      }
    };
  }, [materials]);
  return (
    <>
      <group ref={src}>{children}</group>
      <group ref={out} />
    </>
  );
}
