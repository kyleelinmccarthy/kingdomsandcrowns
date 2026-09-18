"use client";

/**
 * SPIKE — throwaway. Not the Realm. The Realm is `realm-scene.tsx` and is untouched.
 *
 * It began as one question — does this village look like a game a child wants to play if it is
 * built out of real geometry under a real light? — and the answer was yes, so it is now a realm
 * rather than a patch. The 160-unit hand-authored village from `@/lib/realm/layout` still stands
 * exactly where it always stood, with every prop, plot, villager and track untouched, and
 * `@/lib/realm3d/worldgen.ts` generates the other 640 units of island AROUND it, including the
 * ground underneath it.
 *
 * ## What is where
 *
 *   - `world-ground.tsx`  the island's ground and its one water surface
 *   - `world-props.tsx`   the generated scatter: twenty thousand props as nine instanced fields
 *   - `landmarks.tsx`     what is actually standing at the nineteen named places
 *   - `geo-kit.ts`        the geometry shed everything above shares
 *   - `collision.ts` / `jump.ts` / `shore.ts`  the arithmetic, testable with no WebGL
 *   - `hud.tsx`           the map, the spell bar, the mana bar, the child's name, the plates
 *   - `hud-driver.tsx`    the one per-frame thing that joins the camera to that DOM
 *   - `spell-fx.tsx`      what a cast looks like, over `lib/realm3d/spell-fx.ts`
 *
 * ## The join
 *
 * There are not two worlds here with a blend between them. There is ONE surface — the
 * generator's — and the middle of it happens to be furnished by hand. The village keeps its
 * floor because the generator moved its own noise lattice until the noise agreed with the
 * village, and the authored scatter meets the generated scatter because the generator plants
 * nothing inside the authored square and feathers its density in over the twenty-two units
 * outside it. The one thing this file must not do is draw a second ground, a second tree over
 * the first, or a colour that changes on the authored square's boundary.
 *
 * ## The HUD
 *
 * There is one now, and it is a SIBLING of the `<Canvas>` rather than a layer inside it, which
 * is the one structural thing to know before editing either half. The HUD holds React state;
 * `World` below is memoised and every prop it takes is built once in `SpikeScene`; and the
 * numbers that move sixty times a second cross between them through `HudBus`, as writes onto
 * DOM nodes the HUD already put on screen. Nothing in the HUD re-renders the island.
 *
 * Still missing: calm mode, hud scale, reduced motion, and any of the accessibility the flat
 * Realm's HUD has. Nothing here writes back, and nothing in the shipped Realm imports this file.
 */

import { memo, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildWorldLayout, WORLD_SIZE, type Prop, type VillagerPlacement, type WorldLayout } from "@/lib/realm/layout";
import { heightAt } from "@/lib/realm3d/heightfield";
import { realmWorld, SEA_LEVEL, WALK_HALF, type RealmWorld } from "@/lib/realm3d/worldgen";
import { shoreMove, wadeSpeed } from "@/lib/realm3d/shore";
import { gableGeo, litMaterial, sceneryGeometryFor, vivid } from "./geo-kit";
import { RealmGround, RealmWater, WadeRing } from "./world-ground";
import { RealmProps } from "./world-props";
import { landmarkColliders, RealmLandmarks } from "./landmarks";
import {
  buildColliders,
  clearFraction,
  gatherNear,
  HERO_RADIUS,
  pickBoom,
  pushOut,
  slideMove,
  supportHeight,
  type Boom,
  type Collider,
  type Pt,
} from "@/lib/realm3d/collision";
import { makeVertical, stepVertical, tryJump, type Vertical } from "@/lib/realm3d/jump";
import { heroLook } from "@/lib/realm3d/hero-look";
import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/utils/avatar-catalog";
import { Companion, HeroFigure, type Gait } from "./hero-figure";
import { resolvePages, withEmptyPages, type SpellPageView } from "@/lib/realm/spells/pages";
import type { SpellPage } from "@/lib/services/spells";
import { digitSlot, makeCaster, makeCastQueue, pushCast, type Caster, type CastQueue } from "@/lib/realm3d/casting";
import { makeHudBus, type HudBus } from "@/lib/realm3d/hud-bus";
import { buildAnchors, type PlateAnchor } from "@/lib/realm3d/plate-anchors";
import { makeFxPool, type FxSlot } from "@/lib/realm3d/spell-fx";
import { RealmHud } from "./hud";
import { HudDriver } from "./hud-driver";
import { FX_POOL, SpellFx } from "./spell-fx";

/* ------------------------------------------------------------------ palette */

const SKY_TOP = "#2c6fb8";
const SKY_LOW = "#d8e9ec";
const FOG = "#bcdcec";
const SUN_COLOR = "#fff3d2";
const HERO_SPEED = 11;

/**
 * The village data was authored for a pixel sprite seen from above, where a house was a
 * PICTURE of a house: `BUILDING_SIZE` is 3 x 3 x 2.5, and at 2.5 the eaves land below the
 * hero's chin and the front door is a cat flap. Built as real geometry that reads as a model
 * village, not somewhere anyone lives — which is exactly what the owner said.
 *
 * So every village site is re-plotted 1.5x wider on the ground, and the parts above the
 * footing (walls, roof, door, tower) are given absolute heights measured against the hero:
 * a door he walks through, eaves over his head, a roof that carries. 1.5 and no more is the
 * ceiling the layout allows: library (6, -8) and garden (9, -13) are 5 units apart in z, so a
 * 3-unit footprint with a 1.06 plinth around it touches its neighbour at 1.57.
 */
const SITE_PLAN = 1.5;
/** Eaves at 3.1 and a 2.4 door: the hero is 2.3 tall to the top of the head. */
const WALL_H = 3.1;
const ROOF_H = 2.25;
const DOOR_H = 2.4;
/**
 * Trees moved with the houses. An oak whose crown stops at the hero's hat was already reading
 * as a shrub; beside a 5.3-unit roofline it would have read as a weed. 1.25 and not more: the
 * wilderness already varies its own footprints, and at 1.5 the big ones in the outer wood grew
 * canopies wide enough to bury the camera when the hero walked south into the trees.
 */
const TREE_SCALE = 1.25;

/**
 * The authored square's half-extent. Not `PATCH_HALF` any more, and that change IS the join:
 * the old spike drew the hand-made wilderness out to 63 units and stopped, which was invisible
 * while the world ended at 66. The generated scatter starts fading in at 78 and is at full
 * density by 102, so anything the authored world is not drawn out to its own edge leaves a ring
 * of bare grass between the two — the exact seam this was supposed not to have.
 */
const CORE_HALF = WORLD_SIZE / 2;

/* ------------------------------------------------------------------ scenery */

/**
 * The HAND-AUTHORED wilderness, one instanced draw per kind. About 1,200 of these, and every one
 * of them is drawn: clipping them short is what would put a seam in the world.
 */
function Scenery({ scenery }: { scenery: readonly Prop[] }) {
  const mat = useMemo(() => litMaterial(), []);
  const groups = useMemo(() => {
    const by = new Map<string, Prop[]>();
    for (const p of scenery) {
      if (Math.abs(p.position.x) > CORE_HALF || Math.abs(p.position.z) > CORE_HALF) continue;
      const k = p.variant ?? "rock";
      const list = by.get(k);
      if (list) list.push(p);
      else by.set(k, [p]);
    }
    return [...by.entries()];
  }, [scenery]);

  return (
    <>
      {groups.map(([kind, props]) => (
        <SceneryKind key={kind} kind={kind} props={props} material={mat} />
      ))}
    </>
  );
}

/** A fence that spins at random is not a fence, it is a scatter of gate frames. */
const ALIGNED = new Set(["fence"]);
const UPRIGHT = new Set(["fence", "signpost", "lantern", "scarecrow", "cart", "menhir"]);

function SceneryKind({ kind, props, material }: { kind: string; props: Prop[]; material: THREE.Material }) {
  const geo = useMemo(() => sceneryGeometryFor(kind), [kind]);
  const ref = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const t = new THREE.Vector3();
    const c = new THREE.Color();
    props.forEach((p, i) => {
      // DECOR_SIZE.h — the layout's nominal decoration. Canopy trees take the village's new scale.
      const scale = (p.size.h / 1.4) * (kind === "oak" || kind === "pine" ? TREE_SCALE : 1);
      const x = p.position.x;
      const z = p.position.z;
      t.set(x, heightAt(x, z) - 0.05, z);
      let yaw = UPRIGHT.has(kind) ? 0 : (Math.sin(i * 91.7) + 1) * Math.PI;
      if (ALIGNED.has(kind)) {
        // `row()` lays fence posts down consecutively along a straight line, so the run
        // direction is simply the neighbour in the array — when it is close enough to be one.
        const a = props[i - 1] ?? props[i + 1];
        const b = props[i + 1] ?? props[i - 1];
        if (a && b && a !== b) {
          const dx = b.position.x - a.position.x;
          const dz = b.position.z - a.position.z;
          if (Math.hypot(dx, dz) < 5) yaw = Math.atan2(dx, dz) + Math.PI / 2;
        }
      }
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      s.setScalar(scale);
      mesh.setMatrixAt(i, m.compose(t, q, s));
      const j = 0.86 + ((Math.sin(i * 12.9898 + 7.3) * 43758.5453) % 1) * 0.28;
      mesh.setColorAt(i, c.setRGB(j, j * 1.02, j * 0.97));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [props, kind]);

  return <instancedMesh ref={ref} args={[geo, material, props.length]} castShadow receiveShadow frustumCulled={false} />;
}

/* ---------------------------------------------------------------- buildings */

/** The village sits on rolling ground now, so every site needs a footing or it floats. */
function groundY(p: Prop): number {
  return heightAt(p.position.x, p.position.z);
}

function Plinth({ w, d, h = 1.6 }: { w: number; d: number; h?: number }) {
  return (
    <mesh receiveShadow castShadow position={[0, -h / 2 + 0.1, 0]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color="#8d8576" flatShading />
    </mesh>
  );
}

function Plaster() {
  return <meshStandardMaterial color="#e8ddc2" flatShading roughness={0.95} />;
}

/** A lit pane. Upstairs now, because downstairs is taken up by a door a hero can walk through. */
function Window({ w = 0.85, h = 0.9 }: { w?: number; h?: number }) {
  return (
    <>
      <boxGeometry args={[w, h, 0.08]} />
      <meshStandardMaterial color="#ffe9a8" emissive="#e8bd4a" emissiveIntensity={0.55} flatShading />
    </>
  );
}

function House({ prop }: { prop: Prop }) {
  const { w, d } = prop.size;
  const roof = useMemo(() => gableGeo(w * 1.2, d * 1.2, ROOF_H), [w, d]);
  const roofColor = useMemo(() => vivid(prop.color, 0.55, 0.3, 0.5), [prop.color]);
  return (
    <group position={[prop.position.x, groundY(prop), prop.position.z]}>
      <Plinth w={w * 1.06} d={d * 1.06} />
      <mesh castShadow receiveShadow position={[0, WALL_H / 2, 0]}>
        <boxGeometry args={[w, WALL_H, d]} />
        <Plaster />
      </mesh>
      {/* Timbers. At two storeys a plain plaster box is a lot of blank wall. */}
      <mesh position={[0, WALL_H * 0.56, 0]}>
        <boxGeometry args={[w + 0.06, 0.16, d + 0.06]} />
        <meshStandardMaterial color="#6b4a30" flatShading />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * w) / 2, WALL_H / 2, 0]}>
          <boxGeometry args={[0.14, WALL_H, 0.2]} />
          <meshStandardMaterial color="#6b4a30" flatShading />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, WALL_H, 0]} geometry={roof}>
        <meshStandardMaterial color={roofColor} flatShading roughness={0.85} />
      </mesh>
      {/* The door is the whole of the point: 2.4 tall against a 2.3 hero. */}
      <mesh position={[0, DOOR_H / 2, d / 2 + 0.03]}>
        <boxGeometry args={[1.3, DOOR_H, 0.1]} />
        <meshStandardMaterial color="#5b3a22" flatShading />
      </mesh>
      <mesh position={[0, DOOR_H + 0.12, d / 2 + 0.05]}>
        <boxGeometry args={[1.6, 0.18, 0.34]} />
        <meshStandardMaterial color="#6b4a30" flatShading />
      </mesh>
      <mesh position={[0.4, DOOR_H * 0.5, d / 2 + 0.11]}>
        <sphereGeometry args={[0.07, 6, 5]} />
        <meshStandardMaterial color="#d9b877" flatShading metalness={0.6} roughness={0.35} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * w) / 3.2, WALL_H * 0.78, d / 2 + 0.03]}>
          <Window />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`side${s}`} position={[(s * w) / 2 + s * 0.03, WALL_H * 0.72, 0]} rotation={[0, Math.PI / 2, 0]}>
          <Window w={1.0} h={0.9} />
        </mesh>
      ))}
      <mesh castShadow position={[w * 0.3, WALL_H + ROOF_H * 0.5, -d * 0.22]}>
        <boxGeometry args={[0.6, 1.5, 0.6]} />
        <meshStandardMaterial color="#9c8a76" flatShading />
      </mesh>
    </group>
  );
}

function Well({ prop }: { prop: Prop }) {
  return (
    <group position={[prop.position.x, groundY(prop), prop.position.z]}>
      <Plinth w={3.4} d={3.4} />
      {/* A well is not walked into, but it still stands in a village built at the new scale:
          the parapet is waist height on the hero and the gable clears his head. */}
      <mesh castShadow receiveShadow position={[0, 0.55, 0]}>
        <cylinderGeometry args={[1.5, 1.65, 1.1, 12]} />
        <meshStandardMaterial color="#9c968a" flatShading />
      </mesh>
      <mesh position={[0, 1.06, 0]}>
        <cylinderGeometry args={[1.22, 1.22, 0.1, 12]} />
        <meshStandardMaterial color="#2f6f9e" flatShading roughness={0.25} metalness={0.2} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * 1.25, 1.95, 0]}>
          <boxGeometry args={[0.22, 2.7, 0.22]} />
          <meshStandardMaterial color="#7c5c38" flatShading />
        </mesh>
      ))}
      <mesh castShadow position={[0, 3.2, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 2.6, 6]} />
        <meshStandardMaterial color="#8b6a42" flatShading />
      </mesh>
      {/* A pyramid, not a gable. Grown to the village's new scale a gable this size reads as a
          painted blue crate dropped in the middle of the green — the roof of a well is a cap. */}
      <mesh castShadow position={[0, 3.75, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[2.5, 1.5, 4]} />
        <meshStandardMaterial color={vivid(prop.color, 0.5, 0.3, 0.45)} flatShading />
      </mesh>
      <mesh castShadow position={[0, 2.35, 0]}>
        <cylinderGeometry args={[0.45, 0.42, 0.55, 10]} />
        <meshStandardMaterial color="#6b4a30" flatShading />
      </mesh>
    </group>
  );
}

function Watchtower({ prop }: { prop: Prop }) {
  const { w, d } = prop.size;
  const h = prop.size.h * 1.5; // it has to still tower over a two-storey cottage
  const merlons = useMemo(() => {
    const out: [number, number][] = [];
    for (const s of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        out.push([(i * w) / 2.6, (s * d) / 2]);
        out.push([(s * w) / 2, (i * d) / 2.6]);
      }
    }
    return out;
  }, [w, d]);
  return (
    <group position={[prop.position.x, groundY(prop), prop.position.z]}>
      <Plinth w={w * 1.2} d={d * 1.2} />
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#cfc6b1" flatShading />
      </mesh>
      <mesh castShadow receiveShadow position={[0, h + 0.15, 0]}>
        <boxGeometry args={[w * 1.25, 0.3, d * 1.25]} />
        <meshStandardMaterial color="#c0b7a2" flatShading />
      </mesh>
      {merlons.map(([x, z], i) => (
        <mesh key={i} castShadow position={[x * 1.25, h + 0.6, z * 1.25]}>
          <boxGeometry args={[0.4, 0.6, 0.4]} />
          <meshStandardMaterial color="#cfc6b1" flatShading />
        </mesh>
      ))}
      <mesh position={[0, h * 0.62, d / 2 + 0.03]}>
        <boxGeometry args={[0.8, 1.1, 0.08]} />
        <meshStandardMaterial color="#ffe9a8" emissive="#e8bd4a" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, DOOR_H / 2, d / 2 + 0.03]}>
        <boxGeometry args={[1.2, DOOR_H, 0.1]} />
        <meshStandardMaterial color="#4a2f1c" flatShading />
      </mesh>
    </group>
  );
}

function Chapel({ prop }: { prop: Prop }) {
  return (
    <group>
      <House prop={prop} />
      <group position={[prop.position.x, groundY(prop), prop.position.z - prop.size.d / 2 - 0.5]}>
        <Plinth w={2.1} d={2.1} />
        <mesh castShadow receiveShadow position={[0, 2.8, 0]}>
          <boxGeometry args={[1.9, 5.6, 1.9]} />
          <Plaster />
        </mesh>
        <mesh position={[0, 4.5, 0.97]}>
          <boxGeometry args={[0.8, 1.3, 0.1]} />
          <meshStandardMaterial color="#ffe9a8" emissive="#e8bd4a" emissiveIntensity={0.55} flatShading />
        </mesh>
        <mesh castShadow position={[0, 6.9, 0]}>
          <coneGeometry args={[1.6, 2.9, 4]} />
          <meshStandardMaterial color={vivid(prop.color, 0.5, 0.3, 0.46)} flatShading />
        </mesh>
      </group>
    </group>
  );
}

function Garden({ prop }: { prop: Prop }) {
  const beds = useMemo(() => [-1, 0, 1].map((i) => (i * prop.size.d) / 3.4), [prop.size.d]);
  return (
    <group position={[prop.position.x, groundY(prop), prop.position.z]}>
      <Plinth w={prop.size.w * 1.05} d={prop.size.d * 1.05} />
      {beds.map((z, i) => (
        <group key={i}>
          <mesh receiveShadow castShadow position={[0, 0.25, z]}>
            <boxGeometry args={[prop.size.w * 0.92, 0.5, prop.size.d * 0.22]} />
            <meshStandardMaterial color="#6b4a30" flatShading />
          </mesh>
          {[-1, 0, 1].map((k) => (
            <mesh key={k} castShadow position={[(k * prop.size.w) / 3.6, 0.88, z]}>
              <icosahedronGeometry args={[0.46, 0]} />
              <meshStandardMaterial color={k === 0 ? "#d24a4a" : "#57ab3a"} flatShading />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Castle({ prop }: { prop: Prop }) {
  const { w, d, h } = prop.size;
  const towers = useMemo(() => [
    [-w / 2 - 0.5, -d / 2 - 0.4],
    [w / 2 + 0.5, -d / 2 - 0.4],
    [-w / 2 - 0.5, d / 2 + 0.4],
    [w / 2 + 0.5, d / 2 + 0.4],
  ] as [number, number][], [w, d]);
  const merlons = useMemo(() => {
    const out: [number, number][] = [];
    const n = Math.max(2, Math.round(w / 1.1));
    for (let i = 0; i <= n; i++) {
      const x = -w / 2 + (i * w) / n;
      out.push([x, -d / 2], [x, d / 2]);
    }
    return out;
  }, [w, d]);
  return (
    <group position={[prop.position.x, groundY(prop), prop.position.z]}>
      <Plinth w={w * 1.1} d={d * 1.1} h={2.4} />
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#c6bb9f" flatShading />
      </mesh>
      {merlons.map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, h + 0.35, z]}>
          <boxGeometry args={[0.55, 0.7, 0.5]} />
          <meshStandardMaterial color="#ece2c8" flatShading />
        </mesh>
      ))}
      {towers.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh castShadow receiveShadow position={[0, h * 0.72, 0]}>
            <cylinderGeometry args={[w * 0.15, w * 0.17, h * 1.44, 8]} />
            <meshStandardMaterial color="#ece2c8" flatShading />
          </mesh>
          <mesh castShadow position={[0, h * 1.44 + h * 0.3, 0]}>
            <coneGeometry args={[w * 0.23, h * 0.6, 8]} />
            <meshStandardMaterial color="#a3344f" flatShading />
          </mesh>
        </group>
      ))}
      {/* gatehouse, facing the road in */}
      <group position={[0, 0, d / 2 + 0.6]}>
        <mesh castShadow receiveShadow position={[0, h * 0.42, 0]}>
          <boxGeometry args={[w * 0.4, h * 0.84, 1.4]} />
          <meshStandardMaterial color="#ece2c8" flatShading />
        </mesh>
        <mesh position={[0, h * 0.3, 0.72]}>
          <boxGeometry args={[w * 0.2, h * 0.55, 0.1]} />
          <meshStandardMaterial color="#4a2f1c" flatShading />
        </mesh>
      </group>
    </group>
  );
}

/** A site nobody has raised yet: a footing, scaffold uprights and a stack of timber. */
function Foundation({ prop }: { prop: Prop }) {
  const { w, d } = prop.size;
  const posts = useMemo(() => [
    [-w / 2 + 0.3, -d / 2 + 0.3],
    [w / 2 - 0.3, -d / 2 + 0.3],
    [-w / 2 + 0.3, d / 2 - 0.3],
    [w / 2 - 0.3, d / 2 - 0.3],
  ] as [number, number][], [w, d]);
  return (
    <group position={[prop.position.x, groundY(prop), prop.position.z]}>
      <Plinth w={w * 1.02} d={d * 1.02} />
      <mesh receiveShadow castShadow position={[0, 0.14, 0]}>
        <boxGeometry args={[w, 0.28, d]} />
        <meshStandardMaterial color="#9b9384" flatShading />
      </mesh>
      {/* The scaffold outlines the house that IS coming, so it grew with the houses. */}
      {posts.map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, WALL_H / 2 + 0.2, z]}>
          <boxGeometry args={[0.26, WALL_H, 0.26]} />
          <meshStandardMaterial color="#8a6a42" flatShading />
        </mesh>
      ))}
      <mesh castShadow position={[0, WALL_H + 0.3, 0]}>
        <boxGeometry args={[0.22, 0.22, d * 0.95]} />
        <meshStandardMaterial color="#a07d4c" flatShading />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[(s * w) / 2.6, WALL_H * 0.78, 0]} rotation={[0, 0, s * 0.5]}>
          <boxGeometry args={[0.2, w * 0.9, 0.2]} />
          <meshStandardMaterial color="#a07d4c" flatShading />
        </mesh>
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={i} castShadow position={[0, 0.48 + i * 0.3, d / 2 - 1.0]} rotation={[0, 0.07 * i, 0]}>
          <boxGeometry args={[w * 0.7, 0.28, 0.28]} />
          <meshStandardMaterial color="#b08a53" flatShading />
        </mesh>
      ))}
    </group>
  );
}

const VILLAGER_TUNIC: Record<string, string> = { objective: "#e8b33a", work: "#4f86c6", built: "#57ab3a" };

function Villager({ prop, status }: { prop: Prop; status: string }) {
  const tunic = VILLAGER_TUNIC[status] ?? "#4f86c6";
  return (
    <group position={[prop.position.x, groundY(prop), prop.position.z]} rotation={[0, Math.PI, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * 0.15, 0.28, 0]}>
          <boxGeometry args={[0.22, 0.56, 0.22]} />
          <meshStandardMaterial color="#4a3c2c" flatShading />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.98, 0]}>
        <cylinderGeometry args={[0.3, 0.4, 0.9, 8]} />
        <meshStandardMaterial color={tunic} flatShading />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * 0.42, 1.0, 0]} rotation={[0, 0, s * 0.22]}>
          <boxGeometry args={[0.17, 0.72, 0.19]} />
          <meshStandardMaterial color={tunic} flatShading />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.6, 0]}>
        <icosahedronGeometry args={[0.27, 0]} />
        <meshStandardMaterial color="#edc196" flatShading />
      </mesh>
      <mesh castShadow position={[0, 1.88, 0]}>
        <coneGeometry args={[0.36, 0.36, 8]} />
        <meshStandardMaterial color="#8a5330" flatShading />
      </mesh>
    </group>
  );
}

function Banner({ prop }: { prop: Prop }) {
  return (
    <group position={[prop.position.x, groundY(prop), prop.position.z]}>
      <mesh castShadow position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.07, 0.08, 2.8, 5]} />
        <meshStandardMaterial color="#6b5335" flatShading />
      </mesh>
      <mesh castShadow position={[0.38, 2.3, 0]}>
        <boxGeometry args={[0.76, 0.95, 0.05]} />
        <meshStandardMaterial color={vivid(prop.color, 0.7, 0.4, 0.6)} flatShading side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** The road in, as one instanced ribbon of cobble slabs. */
function Road({ tiles }: { tiles: Prop[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c2a469", flatShading: true, roughness: 1 }), []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    tiles.forEach((t, i) => {
      m.makeScale(t.size.w * 2.0, 0.18, t.size.d * 1.02);
      m.setPosition(t.position.x, heightAt(t.position.x, t.position.z) + 0.06, t.position.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [tiles]);
  return <instancedMesh ref={ref} args={[geo, mat, tiles.length]} receiveShadow frustumCulled={false} />;
}

/** Every village site re-plotted at SITE_PLAN on the ground. The castle keeps its own scale. */
function replot(p: Prop): Prop {
  if (p.kind !== "building" && p.kind !== "foundation") return p;
  return { ...p, size: { ...p.size, w: p.size.w * SITE_PLAN, d: p.size.d * SITE_PLAN } };
}

function Village({ props: raw, villagers }: { props: Prop[]; villagers: VillagerPlacement[] }) {
  const props = useMemo(() => raw.map(replot), [raw]);
  const road = useMemo(() => props.filter((p) => p.kind === "path"), [props]);
  const status = useMemo(() => new Map(villagers.map((v) => [`villager-${v.id}`, v.status as string])), [villagers]);
  return (
    <>
      <Road tiles={road} />
      {props.map((p) => {
        if (p.kind === "castle") return <Castle key={p.id} prop={p} />;
        if (p.kind === "banner") return <Banner key={p.id} prop={p} />;
        if (p.kind === "villager") return <Villager key={p.id} prop={p} status={status.get(p.id) ?? "work"} />;
        if (p.kind === "foundation") return <Foundation key={p.id} prop={p} />;
        if (p.kind === "building") {
          if (p.id === "well") return <Well key={p.id} prop={p} />;
          if (p.id === "watchtower") return <Watchtower key={p.id} prop={p} />;
          if (p.id === "chapel") return <Chapel key={p.id} prop={p} />;
          if (p.id === "garden") return <Garden key={p.id} prop={p} />;
          return <House key={p.id} prop={p} />;
        }
        return null;
      })}
    </>
  );
}

/* --------------------------------------------------------------------- hero */

type Keys = { f: boolean; b: boolean; l: boolean; r: boolean; yawL: boolean; yawR: boolean; jump: boolean };

/** Consume a queued jump. A free function, so the key state is never written to as a prop. */
function takeJump(k: Keys): boolean {
  if (!k.jump) return false;
  k.jump = false;
  return true;
}

/**
 * The hero is the CHILD. Every child in this app built an avatar and that avatar is theirs; a
 * generic wizard walking their village is the one thing that would tell an eight-year-old this
 * screen is not about them. The figure is `hero-figure.tsx`; this is only the mover.
 */
function Hero({
  heroRef,
  keys,
  yawRef,
  look,
  facingRef,
  gaitRef,
  aimRef,
  solids,
  world,
}: {
  heroRef: React.RefObject<THREE.Vector3>;
  keys: React.RefObject<Keys>;
  yawRef: React.RefObject<number>;
  look: ReturnType<typeof heroLook>;
  facingRef: React.RefObject<number>;
  gaitRef: React.RefObject<Gait>;
  /**
   * A facing the HUD's driver has asked for, or NaN for none. A cast sets it, because a child
   * who presses 1 while standing still and watches the spell leave over their own shoulder has
   * been told the game does not know which way they are pointing. The hero turns to face what
   * they are casting at, exactly as they turn to face what they are walking at; the rotation
   * is damped by the same line below, so it reads as turning rather than snapping.
   */
  aimRef: React.RefObject<number>;
  solids: Collider[];
  world: RealmWorld;
}) {
  const group = useRef<THREE.Group>(null);
  /**
   * Facing NORTH at spawn — away from the camera, which sits due south on its boom.
   *
   * It used to be 0, which in this basis (`atan2(dx, dz)`, so 0 is +z) is facing straight back
   * INTO the camera. Nothing showed that until the HUD arrived, and then two things did at
   * once: the map's hero arrow pointed down the map while the map's view cone pointed up it,
   * and the first Ember Bolt a child cast standing still left over their own shoulder and
   * straight past the lens. Both are the same fact — the child was standing backwards — and
   * this is the fact, not a workaround for either.
   */
  const facing = useRef(Math.PI);
  const bob = useRef(0);
  const step = useMemo<Pt>(() => ({ x: 0, z: 0 }), []);
  const wet = useMemo<Pt>(() => ({ x: 0, z: 0 }), []);
  const vert = useMemo<Vertical>(() => makeVertical(0), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const k = keys.current;
    if (k.yawL) yawRef.current -= dt * 1.5;
    if (k.yawR) yawRef.current += dt * 1.5;

    const yaw = yawRef.current;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    let dx = fx * ((k.f ? 1 : 0) - (k.b ? 1 : 0)) + rx * ((k.r ? 1 : 0) - (k.l ? 1 : 0));
    let dz = fz * ((k.f ? 1 : 0) - (k.b ? 1 : 0)) + rz * ((k.r ? 1 : 0) - (k.l ? 1 : 0));
    const len = Math.hypot(dx, dz);
    const moving = len > 0.001;
    const p = heroRef.current;
    const ground = world.heightAt(p.x, p.z);
    if (moving) {
      dx /= len;
      dz /= len;
      // Wading costs pace. It is also the only warning a child gets that they are running out of
      // shore, and one they can feel under their hands beats one they cannot predict.
      const speed = HERO_SPEED * wadeSpeed(Math.max(0, SEA_LEVEL - ground));
      // Steering stays live in the air, so a child can aim a jump while they are running.
      const tx = THREE.MathUtils.clamp(p.x + dx * speed * dt, -WALK_HALF, WALK_HALF);
      const tz = THREE.MathUtils.clamp(p.z + dz * speed * dt, -WALK_HALF, WALK_HALF);
      // Two refusals, both axis by axis and in the same spirit: the sea will not let you off the
      // shelf, and the village will not let you through a wall. Walk at either head-on and you
      // stop; walk at either at an angle and you slide along it.
      shoreMove(wet, p.x, p.z, tx, tz, world.heightAt);
      slideMove(step, p.x, p.z, wet.x, wet.z, solids, HERO_RADIUS, vert.y);
      p.x = step.x;
      p.z = step.z;
      facing.current = Math.atan2(dx, dz);
      bob.current += dt * (vert.grounded ? 9 : 3);
    } else {
      bob.current += dt * 2;
      // Only while standing. Walking already points the hero the way they are going, and that
      // way is the camera's forward too, so a cast mid-stride needs no help.
      if (Number.isFinite(aimRef.current)) facing.current = aimRef.current;
    }
    aimRef.current = Number.NaN;
    // Edge-triggered: the keydown handler ignores auto-repeat, and this eats the press.
    if (takeJump(k)) tryJump(vert);
    stepVertical(vert, dt, p.x, p.z, world.heightAt(p.x, p.z), solids);
    p.y = vert.y;

    // The limbs, the cape and the companion all read the same two numbers.
    const g2 = gaitRef.current;
    g2.phase = bob.current;
    g2.speed = THREE.MathUtils.damp(g2.speed, moving ? 1 : 0, 8, dt);

    const g = group.current;
    if (!g) return;
    g.position.set(p.x, p.y + (moving && vert.grounded ? Math.abs(Math.sin(bob.current)) * 0.09 : 0), p.z);
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, facing.current, 9, dt);
    g.rotation.z = moving ? Math.sin(bob.current) * 0.035 : 0;
    facingRef.current = g.rotation.y;
  });

  return (
    <group ref={group}>
      <HeroFigure look={look} gait={gaitRef} />
    </group>
  );
}

/* --------------------------------------------------------- light and camera */

/**
 * Low on purpose. This vector is the single most important number in the spike: raise it and
 * the shadows shrink to puddles and the whole thing goes back to looking like a flat board.
 */
const SUN_DIR = new THREE.Vector3(0.58, 0.44, -0.52).normalize();

function Sun({ heroRef }: { heroRef: React.RefObject<THREE.Vector3> }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const p = heroRef.current;
    // The shadow camera is only 100 units across, so it rides with the hero. Without this the
    // whole point of the spike — the shadow under the tree you are standing next to — is a
    // blurry mess or missing entirely.
    target.position.set(p.x, p.y, p.z);
    target.updateMatrixWorld();
    l.position.set(p.x + SUN_DIR.x * 90, p.y + SUN_DIR.y * 90, p.z + SUN_DIR.z * 90);
    l.updateMatrixWorld();
  });

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        color={SUN_COLOR}
        intensity={3.1}
        castShadow
        shadow-mapSize={[3072, 3072]}
        shadow-bias={-0.0012}
        shadow-normalBias={0.02}
        shadow-camera-near={38}
        shadow-camera-far={152}
        shadow-camera-left={-52}
        shadow-camera-right={52}
        shadow-camera-top={52}
        shadow-camera-bottom={-52}
      />
      {/* Sky and bounce, low: the shadows have to stay dark or none of this reads. */}
      <hemisphereLight args={["#cfe4ff", "#3f5c1c", 0.62]} />
      <ambientLight intensity={0.1} />
    </>
  );
}

/**
 * The chase camera.
 *
 * CAM_H / CAM_Y are the shot the owner approved; everything below is about keeping the child's
 * own figure inside it. In a village this dense a fixed boom loses them constantly: the eaves of
 * a house overhang its walls, so a hero stopped at the far wall of one has five units of roof
 * half a unit from his shoulder, and NO camera position behind that house at any sane pitch can
 * see him. Pulling the boom in — the usual first answer — just walks the camera into the wall.
 *
 * So the boom SWINGS. The solids guarantee the hero is always standing outside whatever is
 * hiding him, so some angle around him is always open; `pickBoom` keeps the yaw the child chose
 * whenever it is clear and otherwise takes the nearest yaw that is. The boom also shortens to
 * whatever is actually clear at the angle it is currently swinging through, which both ducks the
 * camera under an oak's canopy and stops it clipping a roof mid-swing.
 *
 * Fading the occluder was the alternative. It was rejected: the trees are one instanced draw per
 * kind, so a canopy cannot be faded on its own, and half a translucent house is a stranger thing
 * for an eight-year-old to look at than a camera that steps around the corner.
 */
const CAM_H = 21;
const CAM_Y = 19.5;
/**
 * ...and where it goes when the wood closes over the child.
 *
 * The swinging boom answers "something is between us"; it cannot answer "everything is". In the
 * deep forest there is no yaw with a clear line at twenty-one units, because the child is under
 * a ceiling — and shortening the boom along the SAME line only walks the camera down into the
 * leaves, which is what the first drawn version of the wood looked like: a screen of green with
 * a hero somewhere inside it.
 *
 * So when nothing is clear, the camera DUCKS: in to eight and a half units, down to three and a
 * half, under the canopy with the child. It is a different shot and it should be — you have gone
 * into the trees, and the picture says so. Trunks are thin, so from under the canopy there is
 * almost always a line to the hero; and the moment they step out into a glade the boom eases
 * back up, which reads as the wood opening rather than as the camera moving.
 */
const DUCK_H = 8.5;
const DUCK_Y = 3.6;
const DUCK_MIN = 0.55;
/** What must stay visible: the child's figure, not the patch of grass under it. */
const CAM_EYE = 1.5;
/** Never closer than this fraction of the boom, or the camera ends up inside the hero's hood. */
const CAM_MIN = 0.26;
/** How much of a jump the camera follows. 0 and he leaves the frame; 1 and the jump is invisible. */
const CAM_LIFT = 0.3;

function Rig({ heroRef, yawRef, close, occluders, solids, world }: { heroRef: React.RefObject<THREE.Vector3>; yawRef: React.RefObject<number>; close: boolean; occluders: Collider[]; solids: Collider[]; world: RealmWorld }) {
  const { camera } = useThree();
  const desired = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const off = useMemo(() => new THREE.Vector3(), []);
  // Reused every frame. Nothing in this loop allocates.
  const near = useMemo<Collider[]>(() => new Array(512), []);
  const boom = useMemo<Boom>(() => ({ yaw: 0, frac: 1 }), []);
  const swing = useRef(0);
  const frac = useRef(1);
  /** 0 out in the open, 1 under a closed canopy. Damped, so the wood opens rather than snaps. */
  const duck = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const p = heroRef.current;
    /**
     * The camera hangs off the GROUND under the hero, not off the hero. A rig that tracks his
     * y exactly turns a jump into the world dropping a metre and back — the one thing you can
     * see happen and cannot feel. Anchored to the floor he took off from, the same jump is him
     * rising in frame, which is the whole read. `CAM_LIFT` is how much of the hop the camera
     * still follows, so he never climbs out of the top of the shot.
     */
    const floorY = supportHeight(p.x, p.z, world.heightAt(p.x, p.z), solids);
    const rise = p.y - floorY;
    const anchorY = floorY + rise * CAM_LIFT;

    // `?close` drops the camera to the hero's shoulder. Not a game mode — a way to look at
    // the figure, because Job 1 is only finished if the face is a face.
    if (close) {
      off.set(0, 2.4, 4.2).applyAxisAngle(up, yawRef.current);
      const cx = p.x + off.x;
      const cz = p.z + off.z;
      desired.set(cx, Math.max(anchorY + off.y, world.heightAt(cx, cz) + 0.6), cz);
      camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
      look.set(p.x, anchorY + 1.7, p.z);
      camera.lookAt(look);
      return;
    }

    const eyeY = p.y + CAM_EYE;
    // Last frame's verdict picks this frame's boom. One frame of lag on a value that is already
    // damped over a third of a second is not a thing anyone can see.
    const camH = CAM_H + (DUCK_H - CAM_H) * duck.current;
    const camY = CAM_Y + (DUCK_Y - CAM_Y) * duck.current;
    const minFrac = CAM_MIN + (DUCK_MIN - CAM_MIN) * duck.current;
    const n = gatherNear(near, occluders, p.x, p.z, camH + 3);
    pickBoom(boom, p.x, eyeY, p.z, yawRef.current, camH, camY, near, n, 0.44, minFrac);
    // Nothing clear at any angle means a ceiling, not a wall. Duck in fast, come back out slowly:
    // a glade you cross in two strides should not throw the camera up and drop it again.
    const wantDuck = boom.frac < 0.52 ? 1 : 0;
    duck.current += (wantDuck - duck.current) * (1 - Math.exp(-dt * (wantDuck > duck.current ? 4.5 : 1.4)));

    // Swing toward the angle that can see him, by the short way round.
    let delta = boom.yaw - yawRef.current - swing.current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    swing.current += delta * (1 - Math.exp(-dt * 7));
    /**
     * A child pressed against the castle can hold E for ten seconds and the camera will refuse
     * to go round, because from the north there is nothing to see but wall — which is right, but
     * `yawRef` keeps counting all the same, and the moment they step clear the camera would whip
     * round to wherever ten seconds of E had wound it. So anything past a good half-turn of
     * swing is bled back into the child's own yaw: the picture does not move (the two are added),
     * but a big forced swing quietly becomes the angle they are now steering from.
     */
    const over = Math.abs(swing.current) - 1.2;
    if (over > 0) {
      const bleed = Math.sign(swing.current) * Math.min(over, dt * 2.5);
      yawRef.current += bleed;
      swing.current -= bleed;
    }
    const yaw = yawRef.current + swing.current;

    // ...and shorten to what is clear at the angle it is actually at, not the one it is heading
    // for, so the child is never lost during the swing itself.
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const want = Math.max(minFrac, clearFraction(p.x, eyeY, p.z, camH * sin, camY, camH * cos, near, n));
    // In fast when something cuts across, out gently, so passing a tree is not a shove.
    frac.current += (want - frac.current) * (1 - Math.exp(-dt * (want < frac.current ? 16 : 3.5)));

    const f = frac.current;
    const cx = p.x + camH * sin * f;
    const cz = p.z + camH * cos * f;
    // Never let the camera sink into a hill — and, ducked, never make it hover over one either.
    const lift = 3.5 + (1.3 - 3.5) * duck.current;
    desired.set(cx, Math.max(anchorY + camY * f, world.heightAt(cx, cz) + lift * f + 0.6), cz);
    camera.position.lerp(desired, 1 - Math.exp(-dt * 9));
    look.set(p.x, anchorY + 1.2 + 2.2 * f, p.z);
    camera.lookAt(look);
  });
  return null;
}

/* ------------------------------------------------------- glow and particles */

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.28, "rgba(255,240,190,0.7)");
  g.addColorStop(1, "rgba(255,220,150,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** No bloom pass is installed, so the glow is additive sprites. Close enough to judge by. */
function Motes({ tex }: { tex: THREE.Texture }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const n = 220;
    const pos = new Float32Array(n * 3);
    const rnd = (i: number, k: number) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
    for (let i = 0; i < n; i++) {
      const a = rnd(i, 1) * Math.PI * 2;
      const r = 6 + rnd(i, 2) * 46;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      pos[i * 3] = x;
      pos[i * 3 + 1] = heightAt(x, z) + 0.8 + rnd(i, 3) * 3.4;
      pos[i * 3 + 2] = z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((state) => {
    const p = ref.current;
    if (!p) return;
    const t = state.clock.elapsedTime;
    p.position.y = Math.sin(t * 0.6) * 0.5;
    p.rotation.y = t * 0.02;
  });
  return (
    <points ref={ref} geometry={geo} frustumCulled={false}>
      <pointsMaterial map={tex} color="#ffe6a8" size={0.72} sizeAttenuation transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}

/** A soft halo on every lantern in the patch. */
function LanternGlow({ scenery, tex }: { scenery: readonly Prop[]; tex: THREE.Texture }) {
  const spots = useMemo(
    () =>
      scenery
        .filter((p) => p.variant === "lantern" && Math.abs(p.position.x) <= CORE_HALF && Math.abs(p.position.z) <= CORE_HALF)
        .map((p) => ({ x: p.position.x, z: p.position.z, s: p.size.h / 1.4 })),
    [scenery],
  );
  return (
    <>
      {spots.map((s, i) => (
        <sprite key={i} position={[s.x, heightAt(s.x, s.z) + 1.82 * s.s, s.z]} scale={[3.4 * s.s, 3.4 * s.s, 1]}>
          <spriteMaterial map={tex} color="#ffd38a" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      ))}
    </>
  );
}

/* --------------------------------------------------------------------- sky */

function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { top: { value: new THREE.Color(SKY_TOP) }, low: { value: new THREE.Color(SKY_LOW) } },
        vertexShader: `varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 low; varying float vY; void main(){ gl_FragColor = vec4(mix(low, top, smoothstep(-0.05, 0.55, vY)), 1.0); }`,
      }),
    [],
  );
  return (
    <mesh material={mat} frustumCulled={false}>
      <sphereGeometry args={[900, 24, 16]} />
    </mesh>
  );
}

/* --------------------------------------------------------------------- app */

/**
 * The scene. MEMOISED, and that is load-bearing rather than tidy: the HUD holds React state
 * (which places the child has found, which slot just refused), and if that state re-rendered
 * this component it would re-render the whole island — twenty thousand props, nineteen
 * landmarks, the child's own figure — for one number on one bar. So the HUD is a SIBLING of
 * the `<Canvas>` and keeps its own state, the per-frame numbers go through `HudBus` and never
 * through React at all, and every prop below is built once in `SpikeScene` and is
 * referentially stable for the life of the page.
 */
const World = memo(function World({
  avatar,
  close,
  world,
  layout,
  anchors,
  pages,
  bus,
  caster,
  fxPool,
  casts,
}: {
  avatar: AvatarConfig;
  close: boolean;
  world: RealmWorld;
  layout: WorldLayout;
  anchors: readonly PlateAnchor[];
  pages: SpellPageView[];
  bus: HudBus;
  caster: Caster;
  fxPool: FxSlot[];
  casts: CastQueue;
}) {
  const look = useMemo(() => heroLook(avatar), [avatar]);

  /**
   * What stops the hero, and what can hide him from the camera. Two lists, because they are
   * genuinely different — a vegetable bed stops you and never hides you, an oak's canopy hides
   * you and you walk under it, a roof overhangs the wall it sits on.
   *
   * Three sources, in a fixed order: the village, the built landmarks, and then whatever the
   * wilderness has standing near the child right now. The first two never move, so they sit at
   * the front and `RealmProps` truncates back to their count and appends its own on each refill.
   * Nothing downstream has to know there is more than one kind of thing in here.
   */
  const { solids, occluders, fixedSolids, fixedOccluders } = useMemo(() => {
    const built = buildColliders(layout.props, layout.scenery, { sitePlan: SITE_PLAN, wallH: WALL_H, roofH: ROOF_H, treeScale: TREE_SCALE, patchHalf: CORE_HALF });
    const marks = landmarkColliders(world);
    built.solids.push(...marks.solids);
    built.occluders.push(...marks.occluders);
    return { ...built, fixedSolids: built.solids.length, fixedOccluders: built.occluders.length };
  }, [layout, world]);

  /**
   * Where the child starts.
   *
   * Computed rather than written into the hero's ref, because this runs during render and a ref
   * is not a render-time value — the position is worked out first and the ref is born holding it.
   *
   * `SPAWN` is on the road, but a village that grows a wall across it should shove the child
   * clear rather than trap them inside it, so the solids get a vote. `?at=x,z` drops them
   * somewhere else instead: not a feature — a way to look at the far side of a 640-unit island
   * without walking there first, which is the only way a screenshot of a cove ever gets taken.
   */
  const spawn = useMemo(() => {
    let sx = 0;
    let sz = 15;
    const q = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("at");
    if (q) {
      const [ax, az] = q.split(",").map(Number);
      if (Number.isFinite(ax) && Number.isFinite(az)) {
        sx = ax;
        sz = az;
      }
    }
    const out = pushOut({ x: sx, z: sz }, sx, sz, solids);
    // The chunks under the child's feet, built before the first frame rather than during it.
    world.warmAround(out.x, out.z, 120);
    return new THREE.Vector3(out.x, world.heightAt(out.x, out.z), out.z);
  }, [solids, world]);
  const heroRef = useRef(spawn);
  const yawRef = useRef(0);
  const facingRef = useRef(0);
  const gaitRef = useRef<Gait>({ speed: 0, phase: 0 });
  const aimRef = useRef(Number.NaN);
  const keys = useRef<Keys>({ f: false, b: false, l: false, r: false, yawL: false, yawR: false, jump: false });
  const tex = useMemo(() => glowTexture(), []);

  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = keys.current;
      switch (e.code) {
        case "KeyW": case "ArrowUp": k.f = down; break;
        case "KeyS": case "ArrowDown": k.b = down; break;
        case "KeyA": case "ArrowLeft": k.l = down; break;
        case "KeyD": case "ArrowRight": k.r = down; break;
        case "KeyQ": k.yawL = down; break;
        case "KeyE": k.yawR = down; break;
        // Edge-triggered, and auto-repeat is dropped: holding space is one jump, not flight.
        case "Space": if (down && !e.repeat) k.jump = true; break;
        default: {
          // 1 through 9 cast. Queued rather than acted on here, because a cast has to be
          // decided against a mana total the frame loop owns, and auto-repeat is dropped for
          // the same reason as the jump: holding 1 is one spell, and the cooldown is what says
          // when the next one may go.
          const n = digitSlot(e.code);
          if (n === 0 || !down || e.repeat) return;
          pushCast(casts, n);
          break;
        }
      }
      // Space scrolls the page and re-presses whatever button the child last touched. Neither
      // belongs in a game, and the canvas is not focusable, so the window handler says no here.
      e.preventDefault();
    };
    const dn = (e: KeyboardEvent) => set(e, true);
    const up = (e: KeyboardEvent) => set(e, false);
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
    };
  }, [casts]);

  return (
    <>
      <SkyDome />
      {/*
        The haze starts well past the village and ends past the far coast. Both numbers are the
        draw distance's doing: the whole island is drawn, so fog is not hiding a horizon — it is
        the only thing that puts three hundred units of air between a child and a mountain.
      */}
      <fog attach="fog" args={[FOG, 140, 520]} />
      <Sun heroRef={heroRef} />
      <RealmGround world={world} heroRef={heroRef} />
      <RealmWater world={world} />
      <RealmProps
        world={world}
        heroRef={heroRef}
        solids={solids}
        occluders={occluders}
        villageSolids={fixedSolids}
        villageOccluders={fixedOccluders}
      />
      <RealmLandmarks world={world} />
      <Scenery scenery={layout.scenery} />
      <Village props={layout.props} villagers={layout.villagers} />
      <Hero heroRef={heroRef} keys={keys} yawRef={yawRef} look={look} facingRef={facingRef} gaitRef={gaitRef} aimRef={aimRef} solids={solids} world={world} />
      {look.companion && <Companion look={look.companion} heroRef={heroRef} facingRef={facingRef} />}
      <WadeRing world={world} heroRef={heroRef} />
      <LanternGlow scenery={layout.scenery} tex={tex} />
      <Motes tex={tex} />
      <SpellFx pool={fxPool} />
      <Rig heroRef={heroRef} yawRef={yawRef} close={close} occluders={occluders} solids={solids} world={world} />
      {/*
        LAST in the tree on purpose. R3F runs same-priority frame subscribers in the order they
        subscribed, so the driver's projection runs after the rig has already moved the camera
        this frame — a nameplate computed from last frame's camera slides visibly whenever the
        boom swings round a roof.
      */}
      <HudDriver
        bus={bus}
        world={world}
        anchors={anchors}
        pages={pages}
        caster={caster}
        fxPool={fxPool}
        casts={casts}
        heroRef={heroRef}
        facingRef={facingRef}
        yawRef={yawRef}
        aimRef={aimRef}
      />
    </>
  );
});

/**
 * The half-built village the spike has always shown: four sites raised, four still on their
 * footings, three of them the current objectives. Hoisted out of `World` so the villagers'
 * nameplates and the scene read the same layout object, and so a memoised `World` gets the
 * same reference on every render.
 */
const VILLAGE = {
  castleType: "castle",
  buildings: [
    { id: "well", done: 5, total: 5, complete: true },
    { id: "mill", done: 5, total: 5, complete: true },
    { id: "bridge", done: 5, total: 5, complete: true },
    { id: "chapel", done: 3, total: 5, complete: false },
    { id: "market", done: 5, total: 5, complete: true },
    { id: "library", done: 1, total: 5, complete: false },
    { id: "watchtower", done: 5, total: 5, complete: true },
    { id: "garden", done: 0, total: 5, complete: false },
  ],
  banners: 5,
  objectiveIds: ["chapel", "library", "garden"],
} as const;

export default function SpikeScene({
  avatar,
  close = false,
  heroName = "The Hero",
  spellbook,
}: {
  avatar?: AvatarConfig | null;
  close?: boolean;
  heroName?: string;
  /** The child's own spellbook rows and slot count, straight off `getRealmBundle`. */
  spellbook?: { spells: SpellPage[]; slots: number } | null;
}) {
  const world = useMemo(() => realmWorld(), []);
  const layout = useMemo(() => buildWorldLayout({ ...VILLAGE, buildings: [...VILLAGE.buildings], objectiveIds: [...VILLAGE.objectiveIds] }), []);

  /**
   * The child's REAL spells. `resolvePages` turns their saved rows into castable definitions
   * and `withEmptyPages` pads the book out to the slot count their level has earned — the same
   * two calls `realm-shell.tsx` makes, so the 3D bar and the flat Realm's bar can never
   * disagree about what a child owns. A hero with no rows at all still gets the starter Ember
   * Bolt, because `getRealmBundle` seeds it before the page ever renders.
   */
  const pages = useMemo(() => {
    const slots = spellbook?.slots ?? 4;
    return withEmptyPages(resolvePages(spellbook?.spells ?? [], slots), slots);
  }, [spellbook]);

  const anchors = useMemo(
    () => buildAnchors({ heroName, villagers: layout.villagers, landmarks: world.landmarks, heightAt: world.heightAt }),
    [heroName, layout, world],
  );

  // Built once, mutated for ever, shared across the canvas boundary. None of these is React
  // state and none of them can re-render anything.
  const bus = useMemo(() => makeHudBus(pages.length, anchors.length), [pages.length, anchors.length]);
  const caster = useMemo(() => makeCaster(pages.length), [pages.length]);
  const fxPool = useMemo(() => makeFxPool(FX_POOL), []);
  const casts = useMemo(() => makeCastQueue(), []);

  return (
    <div className="fixed inset-0 bg-[#bcdcec]">
      <Canvas
        dpr={1}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 46, near: 0.5, far: 1400, position: [0, 22, 40] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
        }}
      >
        <World
          avatar={avatar ?? DEFAULT_AVATAR}
          close={close}
          world={world}
          layout={layout}
          anchors={anchors}
          pages={pages}
          bus={bus}
          caster={caster}
          fxPool={fxPool}
          casts={casts}
        />
      </Canvas>
      {!close && <RealmHud bus={bus} world={world} anchors={anchors} pages={pages} heroName={heroName} />}
    </div>
  );
}
