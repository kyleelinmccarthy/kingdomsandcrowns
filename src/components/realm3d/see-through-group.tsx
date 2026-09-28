"use client";

/**
 * Everything in this group that stands between the camera and the child thins to a screen door
 * (`seeThrough` in geo-kit; the rule is `lib/realm3d/see-through.ts`). The village's houses and the
 * landmarks are drawn with dozens of small inline materials; rather than thread a hook through every
 * one, this walks its own subtree after each render and gives every material it has not seen the
 * hook, and looks again every second for anything that appeared on its own (a building going up).
 * The walk is the only cost here; the rule itself runs on the GPU.
 */

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { patchSeeThrough } from "./geo-kit";

/** Frames between the second look. */
const RESCAN_EVERY = 60;

/** A free function, not a write inside `useFrame`'s body, so the React compiler has nothing to say about a ref mutation. */
function tickRescan(group: THREE.Group | null, frames: { current: number }): void {
  frames.current += 1;
  if (frames.current % RESCAN_EVERY === 0 && group) patchSeeThrough(group);
}

export function SeeThroughGroup({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const frames = useRef(0);
  useLayoutEffect(() => {
    if (group.current) patchSeeThrough(group.current);
  });
  useFrame(() => tickRescan(group.current, frames));
  return <group ref={group}>{children}</group>;
}
