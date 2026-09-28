"use client";

/**
 * The villagers on the green, as people.
 *
 * Each one is the hero's own figure (`hero-figure.tsx`) wearing that villager's look
 * (`lib/realm3d/villager-look.ts`): a face, hands, hair and clothes, and the same eight people the
 * talk panel's portraits show. They stand in front of their building facing the road, and turn to
 * a child who comes near (`lib/realm3d/attention.ts`), as a keeper does indoors.
 *
 * Each is BAKED (`figure-bake.tsx`): a villager stands still, so the figure's thirty-odd parts are
 * merged into a few meshes and eight villagers cost a few dozen draws, not a few hundred.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { VillagerPlacement } from "@/lib/realm/layout";
import { heightAt } from "@/lib/realm3d/heightfield";
import { villagerLook } from "@/lib/realm3d/villager-look";
import { noticeFacing } from "@/lib/realm3d/attention";
import { turnToward } from "@/lib/realm3d/controls";
import { HeroFigure, type Gait } from "./hero-figure";
import { Baked, useBakeMaterials, type BakeMaterials } from "./figure-bake";

/** Facing the road, south: `atan2(dx, dz)` basis, where 0 is +z. */
const REST = 0;

export function Villagers({ villagers, heroRef }: { villagers: readonly VillagerPlacement[]; heroRef: React.RefObject<THREE.Vector3> }) {
  const materials = useBakeMaterials();
  return (
    <>
      {villagers.map((v) => (
        <Villager key={v.id} placement={v} heroRef={heroRef} materials={materials} />
      ))}
    </>
  );
}

function Villager({ placement, heroRef, materials }: { placement: VillagerPlacement; heroRef: React.RefObject<THREE.Vector3>; materials: BakeMaterials }) {
  const look = villagerLook(placement.id);
  const gait = useRef<Gait>({ speed: 0, phase: 0 });
  const g = useRef<THREE.Group>(null);
  const { x, z } = placement.position;
  useFrame((_, rawDt) => {
    const grp = g.current;
    if (!grp) return;
    const h = heroRef.current;
    grp.rotation.y = turnToward(grp.rotation.y, noticeFacing(x, z, REST, h.x, h.z), 4, Math.min(0.05, rawDt));
  });
  if (!look) return null;
  return (
    <group ref={g} position={[x, heightAt(x, z), z]} rotation={[0, REST, 0]}>
      <Baked materials={materials}>
        <HeroFigure look={look} gait={gait} />
      </Baked>
    </group>
  );
}
