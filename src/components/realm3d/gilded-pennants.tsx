"use client";

/**
 * A GOLD PENNANT over every building whose stars are all earned (`isGilded`): a reward the child
 * can see in their own village. Where each one flies is `pennantSpots`; this only draws it.
 *
 * Two shared geometries (the pole; the flag and its finial) and two shared materials, made once
 * for every pennant. The gold glows a little, as the village's lit windows do, so it still reads
 * as gold under the moon and never as the tan of a thatched roof behind it. It never moves: a flag
 * that ripples under NearestFilter reads as crawling pixels, so it hangs at a fixed angle instead.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { WorldLayout } from "@/lib/realm/layout";
import { heightAt } from "@/lib/realm3d/heightfield";
import { pennantSpots, type PennantPlan } from "@/lib/realm3d/pennants";
import { merge } from "./geo-kit";

const NONE: readonly string[] = [];
const GOLD = "#ffc93a";
/** The lit windows' glow colour (`day-light.tsx`), held low and steady. */
const GLOW = "#e8bd4a";
const POLE = "#5a3a22";
const POLE_H = 2.6;
const FLAG_W = 1.6;
const FLAG_H = 1;
/** Turned a little off square to the camera, so the flag reads as a flag and not a sign. */
const TURN = 0.35;

/** The flag and the ball atop the pole: everything gold, in one geometry. */
function flagGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(FLAG_W, -FLAG_H / 2 - 0.1); // the tip droops a touch
  shape.lineTo(0, -FLAG_H);
  shape.closePath();
  // An extrusion comes unindexed and a sphere indexed; the merge wants them alike.
  const flag = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }).translate(0.05, POLE_H - 0.12, -0.03);
  const ball = new THREE.SphereGeometry(0.14, 8, 6).translate(0, POLE_H + 0.08, 0);
  const parts = [flag, ball.toNonIndexed()];
  const merged = merge(parts);
  for (const g of [...parts, ball]) g.dispose();
  return merged;
}

/** `sitePlan`, `wallH`, `roofH`: the scene's own building plan, so a pole stands on the roof it draws. */
export function GildedPennants({ layout, gilded = NONE, sitePlan, wallH, roofH }: { layout: WorldLayout; gilded?: readonly string[] } & PennantPlan) {
  const spots = useMemo(() => pennantSpots(layout.props, gilded, heightAt, { sitePlan, wallH, roofH }), [layout.props, gilded, sitePlan, wallH, roofH]);
  const kit = useMemo(
    () => ({
      pole: new THREE.CylinderGeometry(0.06, 0.07, POLE_H, 6).translate(0, POLE_H / 2, 0),
      flag: flagGeometry(),
      wood: new THREE.MeshStandardMaterial({ color: POLE, flatShading: true, roughness: 0.9 }),
      gold: new THREE.MeshStandardMaterial({ color: GOLD, emissive: GLOW, emissiveIntensity: 0.35, metalness: 0.25, roughness: 0.45, flatShading: true }),
    }),
    [],
  );
  useEffect(
    () => () => {
      kit.pole.dispose();
      kit.flag.dispose();
      kit.wood.dispose();
      kit.gold.dispose();
    },
    [kit],
  );
  return (
    <>
      {spots.map((s) => (
        <group key={s.id} position={[s.x, s.y - 0.1, s.z]} rotation={[0, TURN, 0]}>
          <mesh geometry={kit.pole} material={kit.wood} castShadow />
          <mesh geometry={kit.flag} material={kit.gold} castShadow />
        </group>
      ))}
    </>
  );
}
