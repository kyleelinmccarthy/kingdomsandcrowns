"use client";

/**
 * One merged, vertex-coloured geometry drawn as a single mesh with its own lit material, both
 * disposed when it is replaced or the scene goes. What the world's locks and the decorations they
 * give share (`world-locks.tsx`, `decorations.tsx`); `null` draws nothing. Nothing here is solid.
 */

import { useEffect, useMemo } from "react";
import type * as THREE from "three";
import { litMaterial } from "./geo-kit";

export function MergedMesh({ geometry }: { geometry: THREE.BufferGeometry | null }) {
  const material = useMemo(() => litMaterial(), []);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return geometry ? <mesh geometry={geometry} material={material} castShadow receiveShadow /> : null;
}
