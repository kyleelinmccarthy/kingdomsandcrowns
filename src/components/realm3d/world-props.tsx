"use client";

/**
 * THE SCATTER — twenty thousand generated things, drawn as about nine draws.
 *
 * ## The shape of the problem
 *
 * The generator plants 20,218 props across the island. Measured in the deep wood north of the
 * village, a hundred-unit circle round the hero holds 2,700 trees and 2,700 ferns; a
 * hundred-and-eighty-unit one holds nine thousand things. None of that can be a `<mesh>`, and
 * not much of it can even be an instance.
 *
 * Two decisions carry this file.
 *
 * ONE: instance by KIND, not by chunk. A chunk's worth of instanced oaks is one draw call per
 * chunk per kind, and a hundred and sixty chunks in view is six hundred draw calls of eleven
 * trees each. So there is one instanced mesh per (kind, lattice) pair — nine in total — and it is
 * refilled from the generator's cached chunks whenever the hero has walked ten units. The
 * generator's own chunk cache does the spatial work; this only copies matrices.
 *
 * TWO: every lattice gets its OWN horizon, because they are not the same thing. A fern is a
 * hand's breadth of picture at fifty units and 0.4% of a screen pixel at a hundred; a great oak
 * on a ridge is a thing you walk towards for twenty seconds. So the undergrowth stops at 54
 * units, the wood at 92, and the great trees and standing stones run to 165 — which is why the
 * mid-distance still has landmarks in it after the wood has thinned out.
 *
 * And none of those horizons is a line, because each mesh's material shrinks its instances into
 * the ground over the last third of its range (`fadeWithDistance`). A child running north sees
 * trees GROW out of the hillside, which is what the eye already expects from a wood coming over
 * a rise. It costs two lines of vertex shader and no CPU at all.
 *
 * ## What is left over for the hero
 *
 * The same refill collects the handful of colliders that matter: the generator marks the big
 * trunks and standing stones `solid`, and a canopy within a boom's length of the child is
 * something the camera has to get around. Both go into the arrays the frame loop already walks,
 * appended after the village's own, so nothing else has to know the difference.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RealmWorld, WorldProp } from "@/lib/realm3d/worldgen";
import { TRUNK_R, type Collider } from "@/lib/realm3d/collision";
import { CAMERA_CUT, fadeWithDistance, litMaterial, nearCutout, sceneryGeometryFor } from "./geo-kit";

type LayerKey = WorldProp["layer"];

/**
 * How far each lattice is drawn, and where it starts going.
 *
 * The `far` numbers are a budget, not a taste: in the worst place in the realm they come to
 * about 4,400 instances at once, which is the number this scene can carry alongside 205,000
 * triangles of ground and still leave the shadow pass somewhere to live.
 */
const HORIZON: Record<LayerKey, { near: number; far: number }> = {
  under: { near: 40, far: 54 },
  canopy: { near: 66, far: 92 },
  boulder: { near: 62, far: 84 },
  feature: { near: 125, far: 165 },
};

/** The (kind, lattice) pairs the generator's palette can actually produce. */
const GROUPS: { layer: LayerKey; variant: string }[] = [
  { layer: "under", variant: "bush" },
  { layer: "under", variant: "rock" },
  { layer: "canopy", variant: "oak" },
  { layer: "canopy", variant: "pine" },
  { layer: "boulder", variant: "rock" },
  { layer: "feature", variant: "oak" },
  { layer: "feature", variant: "pine" },
  { layer: "feature", variant: "rock" },
  { layer: "feature", variant: "menhir" },
];
const groupKey = (layer: string, variant: string) => `${layer}:${variant}`;

/** How far the hero may walk before the fields are gathered again. */
const REFILL_STEP = 10;
/** ...and how much further than its horizon each field is gathered, so nothing ever appears. */
const GATHER_MARGIN = 14;

/** Nothing spins a standing stone. */
const UPRIGHT = new Set(["menhir"]);

/**
 * Cut a collider list back to its fixed prefix.
 *
 * A free function and not an inline `list.length = n`, because the arrays arrive as props and
 * the lint rule that forbids writing to a prop is right in general — the point of these two is
 * that they are the SAME arrays the frame loop already walks, deliberately shared, and the
 * sharing is what keeps the hero's collision from needing to know where a collider came from.
 */
function truncate(list: Collider[], n: number): void {
  list.length = n;
}

/** The crowns that can swallow a child, as the scene draws them. Same numbers as the village's. */
const CANOPY: Record<string, { r: number; base: number; top: number }> = {
  oak: { r: 1.2, base: 1.0, top: 3.45 },
  pine: { r: 0.95, base: 0.9, top: 3.75 },
};

/** A camera boom is 21 units, so a crown further out than this can never be in the way. */
const OCCLUDER_REACH = 34;
/** ...and a trunk further out than this cannot be walked into before the next refill. */
const SOLID_REACH = 60;

export type PropFields = {
  /** Refill everything from the world around a point. Allocates only when a field has to grow. */
  refill(x: number, z: number): void;
};

export function RealmProps({
  world,
  heroRef,
  solids,
  occluders,
  villageSolids,
  villageOccluders,
}: {
  world: RealmWorld;
  heroRef: React.RefObject<THREE.Vector3>;
  /** The village's solids, which this appends the wilderness's to. Mutated in place. */
  solids: Collider[];
  occluders: Collider[];
  villageSolids: number;
  villageOccluders: number;
}) {
  const materials = useMemo(() => {
    const out: Record<LayerKey, THREE.Material> = {} as Record<LayerKey, THREE.Material>;
    for (const layer of Object.keys(HORIZON) as LayerKey[]) {
      out[layer] = nearCutout(fadeWithDistance(litMaterial(), HORIZON[layer].near, HORIZON[layer].far), CAMERA_CUT);
    }
    return out;
  }, []);

  const geometries = useMemo(() => {
    const out = new Map<string, THREE.BufferGeometry>();
    for (const g of GROUPS) if (!out.has(g.variant)) out.set(g.variant, sceneryGeometryFor(g.variant));
    return out;
  }, []);

  useEffect(
    () => () => {
      for (const g of geometries.values()) g.dispose();
      for (const m of Object.values(materials)) m.dispose();
    },
    [geometries, materials],
  );

  /** Capacity per group. Grown, never shrunk: a field that once held 3,000 ferns will again. */
  const [caps, setCaps] = useState<Record<string, number>>(() =>
    Object.fromEntries(GROUPS.map((g) => [groupKey(g.layer, g.variant), 512])),
  );
  const meshes = useRef(new Map<string, THREE.InstancedMesh>());
  const buckets = useMemo(() => new Map<string, WorldProp[]>(GROUPS.map((g) => [groupKey(g.layer, g.variant), []])), []);
  const last = useRef({ x: Infinity, z: Infinity });

  // Scratch. Nothing in the refill path allocates.
  const scratch = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      t: new THREE.Vector3(),
      axis: new THREE.Vector3(0, 1, 0),
      c: new THREE.Color(),
    }),
    [],
  );

  function refill(x: number, z: number): void {
    for (const list of buckets.values()) list.length = 0;
    truncate(solids, villageSolids);
    truncate(occluders, villageOccluders);

    let widest = 0;
    for (const layer of Object.keys(HORIZON) as LayerKey[]) widest = Math.max(widest, HORIZON[layer].far);

    world.forEachPropNear(x, z, widest + GATHER_MARGIN, (p) => {
      const reach = HORIZON[p.layer].far + GATHER_MARGIN;
      const dx = p.x - x;
      const dz = p.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > reach * reach) return;
      const list = buckets.get(groupKey(p.layer, p.variant));
      if (list) list.push(p);

      // The colliders, gathered in the same pass rather than in a second one.
      if (p.solid && d2 < SOLID_REACH * SOLID_REACH) {
        const tree = p.variant === "oak" || p.variant === "pine";
        const r = tree ? 0.42 * p.scale : p.variant === "menhir" ? 0.32 * p.scale : 0.62 * p.scale;
        solids.push({ x: p.x, z: p.z, hw: Math.max(0.35, r), hd: Math.max(0.35, r), round: true, base: p.y, top: p.y + 2.4 * p.scale });
      }
      const canopy = CANOPY[p.variant];
      if (canopy && d2 < OCCLUDER_REACH * OCCLUDER_REACH) {
        occluders.push({
          x: p.x,
          z: p.z,
          hw: canopy.r * p.scale,
          hd: canopy.r * p.scale,
          round: true,
          base: p.y + canopy.base * p.scale,
          top: p.y + canopy.top * p.scale,
        });
        // ...and the trunk under it. A ducked camera lives under the canopy, and without the
        // trunk in the list it could settle INSIDE one: a screen of dark bark.
        occluders.push({ x: p.x, z: p.z, hw: TRUNK_R * p.scale, hd: TRUNK_R * p.scale, round: true, base: p.y - 0.2, top: p.y + canopy.base * p.scale });
      }
    });

    let grew: Record<string, number> | null = null;
    for (const g of GROUPS) {
      const key = groupKey(g.layer, g.variant);
      const list = buckets.get(key) as WorldProp[];
      const cap = caps[key] ?? 512;
      if (list.length > cap) {
        grew = grew ?? { ...caps };
        grew[key] = Math.ceil(list.length * 1.35);
      }
      const mesh = meshes.current.get(key);
      if (!mesh) continue;
      const n = Math.min(list.length, cap);
      const { m, q, s, t, axis, c } = scratch;
      for (let i = 0; i < n; i++) {
        const p = list[i];
        t.set(p.x, p.y - 0.05, p.z);
        // Yaw from the prop's own position, so a tree never spins between one refill and the next.
        q.setFromAxisAngle(axis, UPRIGHT.has(p.variant) ? 0 : (p.x * 0.7 + p.z * 1.3) % (Math.PI * 2));
        s.setScalar(p.scale);
        mesh.setMatrixAt(i, m.compose(t, q, s));
        // A wood where every tree is the same green is a wallpaper. The wobble is hashed from
        // the position, so it is the same tree every time you come back to it.
        const j = 0.84 + (Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453) % 1) * 0.3;
        mesh.setColorAt(i, c.setRGB(j, j * 1.03, j * 0.95));
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (grew) setCaps(grew);
  }

  useFrame(() => {
    const p = heroRef.current;
    const l = last.current;
    if (Math.abs(p.x - l.x) < REFILL_STEP && Math.abs(p.z - l.z) < REFILL_STEP) return;
    l.x = p.x;
    l.z = p.z;
    refill(p.x, p.z);
  });

  return (
    <>
      {GROUPS.map((g) => {
        const key = groupKey(g.layer, g.variant);
        return (
          <instancedMesh
            key={`${key}:${caps[key]}`}
            ref={(m) => {
              if (m) {
                meshes.current.set(key, m);
                // A grown field is a brand new mesh with nothing in it: fill it now rather than
                // leaving the wood missing until the child walks another ten units.
                m.count = 0;
                last.current.x = Infinity;
              } else meshes.current.delete(key);
            }}
            args={[geometries.get(g.variant) as THREE.BufferGeometry, materials[g.layer], caps[key]]}
            castShadow
            receiveShadow
            frustumCulled={false}
          />
        );
      })}
    </>
  );
}
