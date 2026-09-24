"use client";

/**
 * THE INTERACT KEY'S EYES: which thing E will act on, told to the HUD and shown in the world.
 *
 * The choosing is `pickSpot` in `lib/realm3d/interact.ts`. This component runs it once a frame,
 * announces a CHANGE through `bus.onNear` (never every frame), fires `bus.onInteract` when E is
 * pressed with something in reach, and draws one quiet ring on the ground round the current
 * target so a child can see what E will do before they press it.
 *
 * The ring hugs the ground rather than floating flat at one height: it is rebuilt — into the
 * same buffer, so nothing is allocated — only when the target changes, from `heightAt` round its
 * circumference, so it lies over a slope or a plinth edge instead of cutting through it.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import { pickSpot, type InteractSpot } from "@/lib/realm3d/interact";
import type { RealmWorld } from "@/lib/realm3d/worldgen";

const SEGMENTS = 72;
/** Half the ring's width, in world units. Thin: a hint, not a target reticle. */
const BAND = 0.14;

export function Interaction({
  spots,
  heroRef,
  keys,
  bus,
  world,
}: {
  spots: readonly InteractSpot[];
  heroRef: React.RefObject<THREE.Vector3>;
  /** The scene's key state. `interact` is set by the keydown handler and eaten here. */
  keys: React.RefObject<{ interact: boolean }>;
  bus: HudBus;
  world: RealmWorld;
}) {
  const current = useRef(-1);
  /**
   * The target last announced. The spots are rebuilt when the village changes (a building goes up
   * under the child's feet), and the same index then carries a new target — "Go into the Chapel"
   * where it said "Talk to Sister Wren" — so a change of target is announced too, not only a
   * change of index, or the prompt goes on naming what E no longer does.
   */
  const announced = useRef<InteractSpot["target"] | null>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array((SEGMENTS + 1) * 2 * 3);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const idx: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffe29a",
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [],
  );
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);

  useEffect(
    () => () => {
      // Leaving the scene with something in reach: tell the HUD there is nothing now.
      if (current.current >= 0) bus.onNear(null);
    },
    [bus],
  );

  useFrame((state) => {
    const k = keys.current;
    if (bus.paused) {
      eatPress(k);
      return;
    }
    const p = heroRef.current;
    const i = pickSpot(spots, p.x, p.z, current.current);
    const target = i < 0 ? null : spots[i].target;
    if (i !== current.current || target !== announced.current) {
      current.current = i;
      announced.current = target;
      bus.onNear(target);
      if (i >= 0) layRing(geo, spots[i], world);
    }
    if (eatPress(k) && i >= 0) bus.onInteract(spots[i].target);
    const m = mesh.current;
    if (!m) return;
    m.visible = i >= 0;
    if (i >= 0) pulse(mat, 0.34 + 0.2 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3.1)));
  });

  return <mesh ref={mesh} geometry={geo} material={mat} visible={false} renderOrder={4} frustumCulled={false} />;
}

/** Consume a queued E press. A free function, so the key state is never written to as a prop. */
function eatPress(k: { interact: boolean }): boolean {
  if (!k.interact) return false;
  k.interact = false;
  return true;
}

/** A free function, so the material is never written to as a hook result. */
function pulse(mat: THREE.Material, opacity: number): void {
  mat.opacity = opacity;
}

/** Write the ring round `s` into `geo`, draped over the ground. No allocation. */
function layRing(geo: THREE.BufferGeometry, s: InteractSpot, world: RealmWorld): void {
  const attr = geo.getAttribute("position") as THREE.BufferAttribute;
  const pos = attr.array as Float32Array;
  // Round things get a circle; a building gets a rounded rectangle hugging its plinth, as a
  // superellipse, so the line follows the walls instead of cutting across the corners.
  const ax = s.round ? s.ring : s.hw + 0.55;
  const az = s.round ? s.ring : s.hd + 0.55;
  const pow = s.round ? 1 : 0.25;
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const c = Math.sign(ca) * Math.abs(ca) ** pow;
    const n = Math.sign(sa) * Math.abs(sa) ** pow;
    for (let j = 0; j < 2; j++) {
      const d = j === 0 ? -BAND : BAND;
      const x = s.x + c * (ax + d);
      const z = s.z + n * (az + d);
      const o = (i * 2 + j) * 3;
      pos[o] = x;
      pos[o + 1] = world.heightAt(x, z) + 0.16;
      pos[o + 2] = z;
    }
  }
  attr.needsUpdate = true;
  geo.computeBoundingSphere();
}
