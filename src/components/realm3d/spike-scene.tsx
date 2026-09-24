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
 *   - `interaction.tsx`   what E will act on, and its ring on the ground (`lib/realm3d/interact.ts`)
 *   - `construction-site.tsx` a site going up, stage by stage (`lib/realm3d/site-stages.ts`)
 *   - `castle.tsx`        the castle, or its pegged-out grounds (`lib/realm3d/castle-plan.ts`)
 *   - `wizard-figure.tsx` who a visiting parent walks as
 *   - `lib/realm3d/controls.ts` the mouse camera and the walk's facing rule
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
import { WORLD_SIZE, type Prop, type VillagerPlacement, type WorldLayout } from "@/lib/realm/layout";
import { heightAt } from "@/lib/realm3d/heightfield";
import { WALK_HALF, type RealmWorld } from "@/lib/realm3d/worldgen";
import { shoreMove, wadeSpeed } from "@/lib/realm3d/shore";
import { CAMERA_CUT, gableGeo, litMaterial, nearCutout, sceneryGeometryFor, vivid } from "./geo-kit";
import { RealmGround, RealmWater, WadeRing } from "./world-ground";
import { RealmProps } from "./world-props";
import { landmarkColliders, landmarkRadii, RealmLandmarks } from "./landmarks";
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
import { distancePhase, makeDistance, makeStride, resetDistance, strideTick } from "@/lib/realm3d/sound/stride";
import { heroLook } from "@/lib/realm3d/hero-look";
import {
  angleDelta,
  BACKPEDAL,
  boomOffset,
  cameraFacing,
  DEFAULT_DIST,
  DEFAULT_PITCH,
  makeMoveIntent,
  moveIntent,
  orbitDrag,
  orbitZoom,
  swingAllowed,
  terrainClearance,
  turnToward,
  wrapAngle,
  type MoveIntent,
  type Orbit,
} from "@/lib/realm3d/controls";
import { buildSpots } from "@/lib/realm3d/interact";
import { ENTER_VERB } from "@/lib/realm3d/doorways";
import { Interaction } from "./interaction";
import { ConstructionSite } from "./construction-site";
import { Castle, CastleGrounds } from "./castle";
import { castlePlan } from "@/lib/realm3d/castle-plan";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { Companion, HeroFigure, type Gait } from "./hero-figure";
import type { LeadBus } from "@/lib/realm3d/lead";
import { WizardFigure } from "./wizard-figure";
import type { SpellPageView } from "@/lib/realm/spells/pages";
import { digitSlot, pushCast, type Caster, type CastQueue } from "@/lib/realm3d/casting";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import type { PlateAnchor } from "@/lib/realm3d/plate-anchors";
import type { FxSlot } from "@/lib/realm3d/spell-fx";
import { HudDriver } from "./hud-driver";
import { Doorstep } from "./doorstep";
import { SpellFx } from "./spell-fx";
import { Troubles } from "./troubles-scene";
import type { TroubleBus } from "@/lib/realm3d/trouble-bus";
import { boostJump, camOffsets, castBlocked, CAST_FROM_SADDLE, jumpSpeed, pace, rideFace, rideRadius, wadeLimit, type RideBus } from "@/lib/realm3d/riding";
import { RiddenMount, Riding, Saddle, travelGraphFor, useSeatRef } from "./riding-scene";

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
function Scenery({ scenery, world }: { scenery: readonly Prop[]; world: RealmWorld }) {
  const mat = useMemo(() => nearCutout(litMaterial(), CAMERA_CUT), []);
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
        <SceneryKind key={kind} kind={kind} props={props} material={mat} world={world} />
      ))}
    </>
  );
}

/** A fence that spins at random is not a fence, it is a scatter of gate frames. */
const ALIGNED = new Set(["fence"]);
const UPRIGHT = new Set(["fence", "signpost", "lantern", "scarecrow", "cart", "menhir"]);

function SceneryKind({ kind, props, material, world }: { kind: string; props: Prop[]; material: THREE.Material; world: RealmWorld }) {
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
      // A boat pulled up at the waterline floats if the bank under it dips below the surface.
      const ground = heightAt(x, z) - 0.05;
      t.set(x, kind === "boat" ? Math.max(ground, world.waterLevelAt(x, z) - 0.3) : ground, z);
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
  }, [props, kind, world]);

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

function Village({
  props: raw,
  villagers,
  castleType,
  castleUnlocked,
}: {
  props: Prop[];
  villagers: VillagerPlacement[];
  castleType: string;
  castleUnlocked: boolean;
}) {
  const props = useMemo(() => raw.map(replot), [raw]);
  const road = useMemo(() => props.filter((p) => p.kind === "path"), [props]);
  const status = useMemo(() => new Map(villagers.map((v) => [`villager-${v.id}`, v.status as string])), [villagers]);
  // How far each site has got, by building id: the villager placements carry it.
  const progress = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>(villagers.map((v) => [v.buildingId, { done: v.done, total: v.total }]));
    // `?sitedone=chapel:3,library:1` — a screenshot override, like `?at`: it restyles the
    // picture of a site and touches no saved row.
    const q = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("sitedone");
    for (const pair of q ? q.split(",") : []) {
      const [id, n] = pair.split(":");
      const was = m.get(id);
      if (was && Number.isFinite(Number(n))) m.set(id, { done: Number(n), total: was.total });
    }
    return m;
  }, [villagers]);
  // With a castle standing, the seasons' banners hang from its curtain; without one, they fly
  // on their own poles round the grounds, where the layout puts them.
  const bannerColors = useMemo(() => props.filter((p) => p.kind === "banner").map((p) => p.color), [props]);
  return (
    <>
      <Road tiles={road} />
      {props.map((p) => {
        if (p.kind === "castle") {
          const at = { x: p.position.x, y: groundY(p), z: p.position.z };
          return castleUnlocked ? (
            <Castle key={p.id} tier={castleType} {...at} banners={bannerColors} />
          ) : (
            <CastleGrounds key={p.id} tier={castleType} {...at} />
          );
        }
        if (p.kind === "banner") return castleUnlocked ? null : <Banner key={p.id} prop={p} />;
        if (p.kind === "villager") return <Villager key={p.id} prop={p} status={status.get(p.id) ?? "work"} />;
        if (p.kind === "foundation") {
          const v = progress.get(p.id);
          const tower = p.id === "watchtower";
          return (
            <ConstructionSite
              key={p.id}
              x={p.position.x}
              y={groundY(p)}
              z={p.position.z}
              w={p.size.w}
              d={p.size.d}
              wallH={tower ? WALL_H * 1.45 : WALL_H}
              roofH={tower ? 0.9 : ROOF_H}
              done={v?.done ?? 0}
              total={v?.total ?? 5}
              side={p.position.x >= 0 ? 1 : -1}
            />
          );
        }
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

type Keys = { f: boolean; b: boolean; l: boolean; r: boolean; jump: boolean; interact: boolean };

/** Consume a queued jump. A free function, so the key state is never written to as a prop. */
function takeJump(k: Keys): boolean {
  if (!k.jump) return false;
  k.jump = false;
  return true;
}

/** Let go of everything: on pause, and when the window loses focus mid-stride. */
function releaseKeys(k: Keys): void {
  k.f = k.b = k.l = k.r = k.jump = k.interact = false;
}

/**
 * What the mouse is doing to the camera, shared between the pointer handlers and the frame loop.
 * `drag` is 0 for none, 1 for a left-drag (orbit only) and 2 for a right-drag (orbit and turn).
 * `lastDragAt` is on the `performance.now()` clock, in seconds.
 */
type Pointer = { drag: 0 | 1 | 2; lastDragAt: number; pitch: number; dist: number };

/** True when a key press belongs to a text field the HUD put on screen, not to the game. */
function typingInto(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}

function nowS(): number {
  return performance.now() / 1000;
}

/**
 * The hero is the CHILD. Every child in this app built an avatar and that avatar is theirs; a
 * generic wizard walking their village is the one thing that would tell an eight-year-old this
 * screen is not about them. (A PARENT dropping in is the exception, and walks as the realm's
 * quest-giver wizard — `wizard-figure.tsx`.) The figure is a child of this group; this is only
 * the mover.
 *
 * Which way the body faces is `moveIntent`'s rule in `lib/realm3d/controls.ts`, and every turn
 * goes the short way round through `turnToward`. See that file for why strafing used to flip.
 */
function Hero({
  heroRef,
  keys,
  yawRef,
  pointer,
  bus,
  facingRef,
  gaitRef,
  aimRef,
  solids,
  world,
  ride = null,
  children,
}: {
  heroRef: React.RefObject<THREE.Vector3>;
  keys: React.RefObject<Keys>;
  yawRef: React.RefObject<number>;
  pointer: React.RefObject<Pointer>;
  bus: HudBus;
  facingRef: React.RefObject<number>;
  gaitRef: React.RefObject<Gait>;
  /**
   * A facing the HUD's driver has asked for, or NaN for none. A cast sets it, because a child
   * who presses 1 while standing still and watches the spell leave over their own shoulder has
   * been told the game does not know which way they are pointing. The hero turns to face what
   * they are casting at, exactly as they turn to face what they are walking at.
   */
  aimRef: React.RefObject<number>;
  solids: Collider[];
  world: RealmWorld;
  /** Riding (`lib/realm3d/riding.ts`): the mount's pace, body, water and jump; held still while getting on. */
  ride?: RideBus | null;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  /**
   * Facing NORTH at spawn — away from the camera, which sits due south on its boom. In this
   * basis (`atan2(dx, dz)`, so 0 is +z) that is π; 0 would be staring back into the lens.
   */
  const facing = useRef(Math.PI);
  const bob = useRef(0);
  const step = useMemo<Pt>(() => ({ x: 0, z: 0 }), []);
  const wet = useMemo<Pt>(() => ({ x: 0, z: 0 }), []);
  const vert = useMemo<Vertical>(() => makeVertical(0), []);
  const intent = useMemo<MoveIntent>(() => makeMoveIntent(), []);
  const levelAt = useMemo(() => (x: number, z: number) => world.waterLevelAt(x, z), [world]);
  /** The feet, for the sound: footfalls off the stride phase, and landings. */
  const stride = useMemo(() => makeStride(), []);
  /** A fast-travel ride's footfalls, by ground covered: the hands steer nothing, the road still goes by. */
  const road = useMemo(() => makeDistance(), []);

  useFrame((_, rawDt) => {
    // Paused: the world keeps drawing, but nothing in it moves because of the child.
    if (bus.paused) return;
    const dt = Math.min(0.05, rawDt);
    const k = keys.current;
    moveIntent(intent, yawRef.current, k);
    // Getting on or off a mount, or a fast-travel ride: the hands are not steering.
    const held = ride?.hold ?? false;
    const moving = intent.moving && !held;
    const p = heroRef.current;
    const ground = world.heightAt(p.x, p.z);
    if (moving) {
      // Wading costs pace. It is also the only warning a child gets that they are running out of
      // shore, and one they can feel under their hands beats one they cannot predict. Riding, the
      // pace is the mount's (`pace`), and a mount carries further through the air.
      const speed = pace(ride, HERO_SPEED, Math.max(0, world.waterLevelAt(p.x, p.z) - ground), !vert.grounded, wadeSpeed) * (intent.back ? BACKPEDAL : 1);
      // Steering stays live in the air, so a child can aim a jump while they are running.
      const tx = THREE.MathUtils.clamp(p.x + intent.x * speed * dt, -WALK_HALF, WALK_HALF);
      const tz = THREE.MathUtils.clamp(p.z + intent.z * speed * dt, -WALK_HALF, WALK_HALF);
      // Two refusals, both axis by axis and in the same spirit: the water will not let you off
      // the shelf, and the village will not let you through a wall. Walk at either head-on and
      // you stop; walk at either at an angle and you slide along it.
      shoreMove(wet, p.x, p.z, tx, tz, world.heightAt, levelAt, wadeLimit(ride));
      slideMove(step, p.x, p.z, wet.x, wet.z, solids, rideRadius(ride, HERO_RADIUS), vert.y);
      p.x = step.x;
      p.z = step.z;
      facing.current = rideFace(ride, intent);
      // A backpedal runs the stride cycle backwards, so the feet go the way the ground does.
      bob.current += dt * (vert.grounded ? 9 : 3) * (intent.back ? -1 : 1);
    } else {
      bob.current += dt * 2;
      // A right-drag turns the hero to look where the camera looks; a cast turns them to face
      // what they are casting at. Only while standing: walking already points them camera-ward.
      if (pointer.current.drag === 2) facing.current = cameraFacing(yawRef.current);
      if (Number.isFinite(aimRef.current)) facing.current = aimRef.current;
    }
    aimRef.current = Number.NaN;
    // Edge-triggered: the keydown handler ignores auto-repeat, and this eats the press.
    if (takeJump(k) && !held && tryJump(vert)) {
      boostJump(vert, jumpSpeed(ride, vert.vy));
      bus.feet.onJump();
    }
    stepVertical(vert, dt, p.x, p.z, world.heightAt(p.x, p.z), solids);
    p.y = vert.y;
    if (ride?.travelling) strideTick(stride, bus.feet, distancePhase(road, p.x, p.z), vert.grounded, true, dt, p.x, p.z);
    else {
      resetDistance(road);
      strideTick(stride, bus.feet, bob.current, vert.grounded, moving, dt, p.x, p.z);
    }

    // The limbs, the cape and the companion all read the same two numbers.
    const g2 = gaitRef.current;
    g2.phase = bob.current;
    g2.speed = THREE.MathUtils.damp(g2.speed, moving ? 1 : 0, 8, dt);

    const g = group.current;
    if (!g) return;
    g.position.set(p.x, p.y + (moving && vert.grounded ? Math.abs(Math.sin(bob.current)) * 0.09 : 0), p.z);
    g.rotation.y = turnToward(g.rotation.y, facing.current, 12, dt);
    g.rotation.z = moving ? Math.sin(bob.current) * 0.035 : 0;
    facingRef.current = g.rotation.y;
  });

  return <group ref={group}>{children}</group>;
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
 * Fading an occluder was the alternative to the boom tricks below. It was rejected: the trees
 * are one instanced draw per kind, so a canopy cannot be faded on its own, and half a
 * translucent house is a stranger thing for an eight-year-old to look at than a camera that
 * steps in front of the corner.
 *
 * Where the camera goes when the wood closes over the child.
 *
 * The swinging boom answers "something is between us"; it cannot answer "everything is". In the
 * deep forest there is no yaw with a clear line at full length, because the child is under a
 * ceiling — and shortening the boom along the SAME line only walks the camera down into the
 * leaves. So when nothing is clear, the camera DUCKS: in to eight and a half units, down to
 * three and a half, under the canopy with the child. The moment they step out into a glade the
 * boom eases back up, which reads as the wood opening rather than as the camera moving.
 */
const DUCK_H = 8.5;
const DUCK_Y = 3.6;
/**
 * How close a ducked boom may come. In the Old Wood a tree stands every metre or so, so there is
 * often no clear spot at this length either — the trees nearest the lens dissolve for that
 * (`nearCutout` in geo-kit), rather than the camera being dragged into the child's hood.
 */
const DUCK_MIN = 0.55;
/** The fastest the camera ever turns itself, in radians a second. */
const ASSIST_RATE = 1.3;
/** What must stay visible: the child's figure, not the patch of grass under it. */
const CAM_EYE = 1.5;
/** Never closer than this fraction of the boom, or the camera ends up inside the hero's hood. */
const CAM_MIN = 0.26;
/** The nearest a child-steered boom comes, in world units: just over the hero's shoulder. */
const CLOSEST = 2.6;
/** How much of a jump the camera follows. 0 and he leaves the frame; 1 and the jump is invisible. */
const CAM_LIFT = 0.3;

/**
 * The chase camera, on a boom the CHILD steers with the mouse (see `controls.ts`): yaw from a
 * horizontal drag, pitch from a vertical one, length from the wheel.
 *
 * Everything else here is about keeping the child's own figure in the shot without fighting
 * their hand. In a village this dense a fixed boom loses them constantly — a hero stopped at the
 * far wall of a house has five units of roof half a unit from his shoulder — so two things help:
 *
 *   - the boom SHORTENS to whatever is clear along the line it is actually on, and DUCKS under
 *     a closed canopy. This is always on: it never changes the direction the child chose.
 *   - the boom TURNS round a roof toward the nearest clear yaw (`pickBoom`) — but only as an
 *     assist while the child is walking and has left the camera alone for `ASSIST_GRACE`, and
 *     never faster than `ASSIST_RATE`. While they drag, just after, and while they stand still
 *     looking at what they chose, it never turns itself, so it cannot fight their hand.
 *
 * That turn is the CAMERA's, never the child's: it is held as `swing`, an offset over the child's
 * own yaw (`yawRef`), and W, A, S and D go on walking the way the child last pointed the camera.
 * It used to turn `yawRef` itself, so a child walking at a door past a neighbouring house was
 * swung off their line by the camera stepping round the roof — one walk at the market door ended
 * inside the castle. Now only the child's drag turns their walk; the swing eases back to nothing
 * once the roof is passed, and a drag takes over the camera from wherever the swing left it.
 */
function Rig({
  heroRef,
  yawRef,
  pointer,
  keys,
  bus,
  close,
  occluders,
  solids,
  world,
  ride = null,
}: {
  heroRef: React.RefObject<THREE.Vector3>;
  yawRef: React.RefObject<number>;
  pointer: React.RefObject<Pointer>;
  keys: React.RefObject<Keys>;
  bus: HudBus;
  close: boolean;
  occluders: Collider[];
  solids: Collider[];
  world: RealmWorld;
  /** Riding: the camera rises and pulls back (`camOffsets`). */
  ride?: RideBus | null;
}) {
  const { camera } = useThree();
  const desired = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const off = useMemo(() => new THREE.Vector3(), []);
  // Reused every frame. Nothing in this loop allocates.
  const near = useMemo<Collider[]>(() => new Array(1024), []);
  const boom = useMemo<Boom>(() => ({ yaw: 0, frac: 1 }), []);
  const arm = useRef({ h: 0, y: 0 });
  const frac = useRef(1);
  /** 0 out in the open, 1 under a closed canopy. Damped, so the wood opens rather than snaps. */
  const duck = useRef(0);
  const rideCam = useMemo(() => ({ lift: 0, pull: 0 }), []);
  /** The assist's turn, over the child's own yaw. The camera looks along `yawRef + swing`. */
  const swing = useRef(0);

  useFrame((_, rawDt) => {
    // Paused: the camera holds still. The world may keep drawing behind the menu.
    if (bus.paused) return;
    const dt = Math.min(0.05, rawDt);
    const p = heroRef.current;
    const ptr = pointer.current;
    /**
     * The camera hangs off the GROUND under the hero, not off the hero. A rig that tracks his
     * y exactly turns a jump into the world dropping a metre and back. Anchored to the floor he
     * took off from, the same jump is him rising in frame. `CAM_LIFT` is how much of the hop
     * the camera still follows, so he never climbs out of the top of the shot.
     */
    const floorY = supportHeight(p.x, p.z, world.heightAt(p.x, p.z), solids);
    const rise = p.y - floorY;
    // Riding: up over the rider's head and back, so the mount is in the shot as well as the child.
    camOffsets(ride ? ride.cam : 0, rideCam);
    const anchorY = floorY + rise * CAM_LIFT + rideCam.lift;

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

    const dragging = ptr.drag !== 0;
    // Coming out of a door, the doorstep sets the child's yaw and the camera afresh: no stale swing.
    if (bus.leaving !== null) swing.current = 0;
    // The child takes the camera: from where they SEE it, which becomes the way they walk.
    if (dragging && swing.current !== 0) {
      yawRef.current = wrapAngle(yawRef.current + swing.current);
      swing.current = 0;
    }
    const k = keys.current;
    const assist = swingAllowed(dragging, nowS(), ptr.lastDragAt, k.f || k.b || k.l || k.r);

    boomOffset(arm.current, ptr.pitch, ptr.dist * (1 + rideCam.pull));
    const eyeY = p.y + CAM_EYE + rideCam.lift;
    // Last frame's verdict picks this frame's boom. One frame of lag on a value that is already
    // damped over a third of a second is not a thing anyone can see.
    const camH = arm.current.h + (DUCK_H - arm.current.h) * duck.current;
    const camY = arm.current.y + (DUCK_Y - arm.current.y) * duck.current;
    /**
     * How short the boom may get. While the camera may turn itself it keeps a real distance and
     * steps round what is in the way; while the child is steering it, it may not turn, so it
     * comes all the way in to an over-the-shoulder `CLOSEST` instead — in FRONT of the wall or
     * the beacon they pointed it at, rather than parked behind it.
     */
    const assistMin = CAM_MIN + (DUCK_MIN - CAM_MIN) * duck.current;
    const minFrac = assist ? assistMin : Math.min(assistMin, CLOSEST / Math.hypot(camH, camY));
    const n = gatherNear(near, occluders, p.x, p.z, camH + 3);
    if (assist) {
      // The nearest clear yaw to the child's OWN: once the roof is passed, that is theirs again.
      pickBoom(boom, p.x, eyeY, p.z, yawRef.current, camH, camY, near, n, 0.44, minFrac);
    } else {
      // The line the camera is on, and only that line: how clear is it?
      const y0 = wrapAngle(yawRef.current + swing.current);
      setBoom(boom, y0, Math.max(minFrac, clearFraction(p.x, eyeY, p.z, camH * Math.sin(y0), camY, camH * Math.cos(y0), near, n)));
    }
    // Nothing clear at any angle means a ceiling, not a wall. Duck in fast, come back out slowly:
    // a glade you cross in two strides should not throw the camera up and drop it again.
    const wantDuck = boom.frac < 0.52 ? 1 : 0;
    duck.current += (wantDuck - duck.current) * (1 - Math.exp(-dt * (wantDuck > duck.current ? 4.5 : 1.4)));

    if (assist) {
      /**
       * Turn toward the angle that can see him, the short way round, and at no more than
       * `ASSIST_RATE` a second — a drift, never a whip. It turns the camera's `swing`, not the
       * child's yaw: the keys keep walking where the child pointed them.
       */
      const delta = angleDelta(wrapAngle(yawRef.current + swing.current), boom.yaw);
      const turn = delta * (1 - Math.exp(-dt * 4));
      const cap = ASSIST_RATE * dt;
      swing.current = wrapAngle(swing.current + (turn > cap ? cap : turn < -cap ? -cap : turn));
    }
    const yaw = wrapAngle(yawRef.current + swing.current);

    // ...and shorten to what is clear at the angle it is actually at, not the one it is heading
    // for, so the child is never lost during the swing itself.
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const want = Math.max(minFrac, clearFraction(p.x, eyeY, p.z, camH * sin, camY, camH * cos, near, n));
    // In fast when something cuts across, out gently, so passing a tree is not a shove.
    frac.current += (want - frac.current) * (1 - Math.exp(-dt * (want < frac.current ? 16 : 3.5)));

    // Never let the camera sink into a hill — and, ducked, never make it hover over one either.
    // How far over the ground depends on the pitch the child chose: lowered to look out from a
    // summit, it is allowed to sit low rather than being shoved back up to look down again.
    const lift = terrainClearance(ptr.pitch) + (1.3 - terrainClearance(ptr.pitch)) * duck.current;
    // A boom held at its minimum can still leave the lens inside a canopy in a thick wood; the
    // trees dissolve near the lens for exactly that (`nearCutout`), so it is not pulled in here.
    const f = frac.current;
    const cx = p.x + camH * sin * f;
    const cz = p.z + camH * cos * f;
    desired.set(cx, Math.max(anchorY + camY * f, world.heightAt(cx, cz) + lift * f + 0.6), cz);
    // Snappier while the child is dragging: the camera is in their hand, not on a spring.
    camera.position.lerp(desired, 1 - Math.exp(-dt * (dragging ? 20 : 9)));
    look.set(p.x, anchorY + 1.2 + 2.2 * f * Math.min(1, ptr.pitch / DEFAULT_PITCH), p.z);
    camera.lookAt(look);
  });
  return null;
}

/** A free function, so the boom scratch is never written to as a hook result. */
function setBoom(b: Boom, yaw: number, frac: number): void {
  b.yaw = yaw;
  b.frac = frac;
}

/**
 * The mouse, on the CANVAS only. The HUD is a sibling DOM layer over the canvas, so a press on
 * a HUD button never lands here and never starts a drag.
 *
 * Pointer capture rather than pointer lock: lock hides the cursor and needs its own gesture,
 * and a child who drags the view and then reaches for a spell button should find the pointer
 * where their hand left it. Capture keeps the drag alive when the pointer leaves the canvas.
 */
function CameraInput({ yawRef, pointer, bus }: { yawRef: React.RefObject<number>; pointer: React.RefObject<Pointer>; bus: HudBus }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    const orbit: Orbit = { yaw: 0, pitch: DEFAULT_PITCH, dist: DEFAULT_DIST };
    let id = -1;
    let lastX = 0;
    let lastY = 0;
    const end = () => {
      const ptr = pointer.current;
      if (ptr.drag !== 0) ptr.lastDragAt = nowS();
      ptr.drag = 0;
      if (id >= 0 && el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
      id = -1;
    };
    const down = (e: PointerEvent) => {
      if (bus.paused || (e.button !== 0 && e.button !== 2)) return;
      id = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      pointer.current.drag = e.button === 2 ? 2 : 1;
      el.setPointerCapture?.(id);
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      const ptr = pointer.current;
      if (ptr.drag === 0 || e.pointerId !== id) return;
      if (bus.paused) {
        end();
        return;
      }
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      orbit.yaw = yawRef.current;
      orbit.pitch = ptr.pitch;
      orbitDrag(orbit, dx, dy);
      yawRef.current = orbit.yaw;
      ptr.pitch = orbit.pitch;
      ptr.lastDragAt = nowS();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === id) end();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (bus.paused) return;
      const ptr = pointer.current;
      orbit.dist = ptr.dist;
      orbitZoom(orbit, e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY);
      ptr.dist = orbit.dist;
    };
    // The right button is a camera button here, not a menu.
    const menu = (e: MouseEvent) => e.preventDefault();
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", end);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", menu);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("lostpointercapture", end);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", menu);
    };
  }, [gl, yawRef, pointer, bus]);
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

/**
 * Fireflies — in the Old Wood, and nowhere else.
 *
 * These used to be 220 gold motes scattered through a 52-unit disc centred on the village green,
 * drifting at head height, and the owner's word for them was "annoying on the screen": at the
 * chase camera's distance every one of them is a bright dot in front of a roof or a face, in
 * broad daylight, where nothing would glow. So there are forty now, small and low, and they live
 * under the trees of the Old Wood west of the village, where a glint in the shade is the wood
 * being magic rather than the screen being dirty. The village green has none.
 */
const WOOD_X = -50;
const WOOD_Z = 0;

function Motes({ tex }: { tex: THREE.Texture }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const n = 40;
    const pos = new Float32Array(n * 3);
    const rnd = (i: number, k: number) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
    for (let i = 0; i < n; i++) {
      const x = WOOD_X + (rnd(i, 1) - 0.5) * 44;
      const z = WOOD_Z + (rnd(i, 2) - 0.5) * 56;
      pos[i * 3] = x;
      pos[i * 3 + 1] = heightAt(x, z) + 0.5 + rnd(i, 3) * 1.6;
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
    p.position.y = Math.sin(t * 0.6) * 0.3;
  });
  return (
    <points ref={ref} geometry={geo} frustumCulled={false}>
      <pointsMaterial map={tex} color="#e8f5a0" size={0.42} sizeAttenuation transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}

/**
 * A small warm glow at the head of every lantern in the patch.
 *
 * It was a 3.4-unit additive disc, which in daylight read as one more floating gold orb — the
 * thing the owner asked to be rid of — and a lantern at noon does not throw a halo wider than a
 * door. Now it is a lamp-sized glint that sits on the lamp.
 */
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
        <sprite key={i} position={[s.x, heightAt(s.x, s.z) + 1.82 * s.s, s.z]} scale={[1.1 * s.s, 1.1 * s.s, 1]}>
          <spriteMaterial map={tex} color="#ffd38a" transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
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
  viewer,
  castleUnlocked,
  calm,
  troubles,
  ride,
  lead,
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
  viewer: "child" | "parent";
  castleUnlocked: boolean;
  calm: boolean;
  troubles: TroubleBus | null;
  ride: RideBus | null;
  lead: LeadBus | null;
}) {
  const look = useMemo(() => heroLook(avatar), [avatar]);
  const seat = useSeatRef(ride);

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
  /**
   * The authored wilderness, less anything the lakes' basins have put under water. The layout
   * was placed on a flat world where Longwater was a painted rectangle; now that the water sits
   * in a real hollow, the rows of bushes and stones that ran along its old edge would stand up
   * through the surface. Boats stay: they float.
   */
  const castle = useMemo(() => {
    const prop = layout.props.find((p) => p.kind === "castle");
    return prop ? { prop, plan: castlePlan(layout.castleType), ground: heightAt(prop.position.x, prop.position.z) } : null;
  }, [layout]);
  const scenery = useMemo(() => {
    // The castle's whole footprint is kept clear, standing or not: its grounds are pegged out.
    const b = castle?.plan.bounds;
    const cx = castle?.prop.position.x ?? 0;
    const cz = castle?.prop.position.z ?? 0;
    return layout.scenery.filter((p) => {
      const x = p.position.x;
      const z = p.position.z;
      if (b && x > cx + b.x0 - 0.5 && x < cx + b.x1 + 0.5 && z > cz + b.z0 - 0.5 && z < cz + b.z1 + 0.5) return false;
      if (p.variant === "boat") return true;
      return world.waterLevelAt(x, z) - world.heightAt(x, z) < 0.12;
    });
  }, [layout, world, castle]);

  const { solids, occluders, fixedSolids, fixedOccluders } = useMemo(() => {
    // The castle's colliders come from its own plan, and only when it is standing: an unlocked
    // castle is walls to walk round and a roofline to steer the camera round; locked, its
    // grounds are open ground.
    const built = buildColliders(layout.props.filter((p) => p.kind !== "castle"), scenery, { sitePlan: SITE_PLAN, wallH: WALL_H, roofH: ROOF_H, treeScale: TREE_SCALE, patchHalf: CORE_HALF });
    if (castle && castleUnlocked) {
      const { prop, plan, ground } = castle;
      const put = (list: Collider[], b: (typeof plan.solids)[number]) =>
        list.push({ x: prop.position.x + b.x, z: prop.position.z + b.z, hw: b.hw, hd: b.hd, round: b.round, base: ground + b.base, top: ground + b.top });
      for (const b of plan.solids) put(built.solids, b);
      for (const b of plan.occluders) put(built.occluders, b);
    }
    const marks = landmarkColliders(world);
    built.solids.push(...marks.solids);
    built.occluders.push(...marks.occluders);
    return { ...built, fixedSolids: built.solids.length, fixedOccluders: built.occluders.length };
  }, [layout, scenery, world, castle, castleUnlocked]);

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
  /** Everything E can act on. Built once; each spot carries its own prebuilt target. */
  const spots = useMemo(() => {
    const gate = castle
      ? {
          x: castle.prop.position.x + castle.plan.gate.x,
          z: castle.prop.position.z + castle.plan.gate.z,
          hw: castle.plan.gate.hw,
          hd: castle.plan.gate.hd,
          // Locked, E at the end of the road still means something: the grounds it will stand on.
          label: castleUnlocked ? "your castle" : "the castle grounds",
          ...(castleUnlocked ? { verb: ENTER_VERB } : {}),
        }
      : null;
    // The hitching posts (`riding-scene.tsx`) are E spots too: E at one opens the fast-travel sheet.
    const posts = ride ? travelGraphFor(world).posts : undefined;
    return buildSpots({ props: layout.props, sitePlan: SITE_PLAN, landmarks: world.landmarks, landmarkRadius: landmarkRadii(world), castle: gate, posts });
  }, [layout, world, castle, castleUnlocked, ride]);
  const heroRef = useRef(spawn);
  const yawRef = useRef(0);
  const facingRef = useRef(0);
  const gaitRef = useRef<Gait>({ speed: 0, phase: 0 });
  const aimRef = useRef(Number.NaN);
  const keys = useRef<Keys>({ f: false, b: false, l: false, r: false, jump: false, interact: false });
  const pointer = useRef<Pointer>({ drag: 0, lastDragAt: -1e9, pitch: DEFAULT_PITCH, dist: DEFAULT_DIST });
  const tex = useMemo(() => glowTexture(), []);

  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = keys.current;
      // A key going UP is always honoured, so nothing sticks held across a pause. A key going
      // down is the child's only while the game has their attention: not under a menu, and not
      // while they are typing into something the HUD put on screen.
      if (down && (bus.paused || typingInto(e.target))) return;
      switch (e.code) {
        case "KeyW": case "ArrowUp": k.f = down; break;
        case "KeyS": case "ArrowDown": k.b = down; break;
        case "KeyA": case "ArrowLeft": k.l = down; break;
        case "KeyD": case "ArrowRight": k.r = down; break;
        // Edge-triggered, and auto-repeat is dropped: holding space is one jump, not flight.
        case "Space": if (down && !e.repeat) k.jump = true; break;
        // Interact. What it does is the HUD's business; `Interaction` decides what it is AT.
        case "KeyE": if (down && !e.repeat) k.interact = true; break;
        default: {
          // 1 through 9 cast. Queued rather than acted on here, because a cast has to be
          // decided against a mana total the frame loop owns, and auto-repeat is dropped for
          // the same reason as the jump: holding 1 is one spell, and the cooldown is what says
          // when the next one may go.
          const n = digitSlot(e.code);
          if (n === 0 || !down || e.repeat) return;
          // No spells from the saddle: the flat Realm's rule, said out loud.
          if (castBlocked(ride)) ride?.onSay(CAST_FROM_SADDLE);
          else pushCast(casts, n);
          break;
        }
      }
      // Space scrolls the page and re-presses whatever button the child last touched. Neither
      // belongs in a game, and the canvas is not focusable, so the window handler says no here.
      if (!bus.paused) e.preventDefault();
    };
    const dn = (e: KeyboardEvent) => set(e, true);
    const up = (e: KeyboardEvent) => set(e, false);
    // Alt-tab mid-stride would otherwise leave W held down for ever.
    const blur = () => releaseKeys(keys.current);
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [casts, bus, ride]);

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
      <Scenery scenery={scenery} world={world} />
      <Village props={layout.props} villagers={layout.villagers} castleType={layout.castleType} castleUnlocked={castleUnlocked} />
      <Hero heroRef={heroRef} keys={keys} yawRef={yawRef} pointer={pointer} bus={bus} facingRef={facingRef} gaitRef={gaitRef} aimRef={aimRef} solids={solids} world={world} ride={ride}>
        {/* A parent dropping in walks as the realm's quest-giver, not as the child. */}
        {viewer === "parent" ? (
          <WizardFigure gait={gaitRef} />
        ) : ride ? (
          <Saddle ride={ride}>
            <HeroFigure look={look} gait={gaitRef} seat={seat} />
          </Saddle>
        ) : (
          <HeroFigure look={look} gait={gaitRef} />
        )}
        {/* The mount, under a riding child: it goes where the hero goes. */}
        {viewer !== "parent" && ride?.mount && <RiddenMount ride={ride} heroRef={heroRef} />}
      </Hero>
      {/* The pet is the child's, and stays with the child: no companion follows the wizard. */}
      {viewer !== "parent" && look.companion && <Companion look={look.companion} heroRef={heroRef} facingRef={facingRef} hideRef={ride?.away} lead={lead} world={world} solids={solids} layout={layout} />}
      <WadeRing world={world} heroRef={heroRef} />
      <LanternGlow scenery={scenery} tex={tex} />
      <Motes tex={tex} />
      <SpellFx pool={fxPool} />
      <Interaction spots={spots} heroRef={heroRef} keys={keys} bus={bus} world={world} />
      <Rig heroRef={heroRef} yawRef={yawRef} pointer={pointer} keys={keys} bus={bus} close={close} occluders={occluders} solids={solids} world={world} ride={ride} />
      <CameraInput yawRef={yawRef} pointer={pointer} bus={bus} />
      {/* Riding: the mount's moments, where it waits, the hitching posts and fast travel. Before the doorstep (see its note). */}
      {ride && <Riding ride={ride} bus={bus} heroRef={heroRef} facingRef={facingRef} aimRef={aimRef} keys={keys} solids={solids} world={world} />}
      {/* Going in and coming out of doors, and never being left inside a wall. After the rig: it may set the camera. */}
      <Doorstep bus={bus} heroRef={heroRef} yawRef={yawRef} aimRef={aimRef} keys={keys} pointer={pointer} solids={solids} occluders={occluders} props={layout.props} sitePlan={SITE_PLAN} castle={castle} castleTier={layout.castleType} castleUnlocked={castleUnlocked} world={world} ride={ride} />
      {/* After the rig (markers project from this frame's camera), before the driver (a new charge locks on before it releases). */}
      {troubles && <Troubles tbus={troubles} bus={bus} pool={fxPool} caster={caster} heroRef={heroRef} aimRef={aimRef} solids={solids} world={world} layout={layout} calm={calm} ride={ride} />}
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
 * THE CANVAS, and nothing else. Everything it draws from is built by `realm-game.tsx` — the
 * composition root, which never imports `three` — and handed in referentially stable, so the
 * memoised `World` never re-renders because the HUD or a menu around it did.
 *
 * `viewer` and `castleUnlocked` are the frame's word on who is walking and what they have
 * earned: a parent dropping in walks as the quest-giver wizard, not as the child, and a castle
 * the child has not unlocked is not in the world at all.
 */
export type RealmCanvasProps = {
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
  viewer: "child" | "parent";
  castleUnlocked: boolean;
  /** The child is indoors (`interior-scene.tsx` is drawing): the island stops drawing until they come out. */
  frozen?: boolean;
  /** Reduced motion or low stimulus: fewer troubles, and gentler ones (`troubles3d.ts`). */
  calm?: boolean;
  /** The troubles' wire to the HUD. Without one, the world has no troubles in it. */
  troubles?: TroubleBus;
  /** Riding and fast travel's wire to the frame (`lib/realm3d/riding.ts`). Without one, nobody rides. */
  ride?: RideBus;
  /** The companion leading the child (`lib/realm3d/lead.ts`). Without one, the pet only follows. */
  lead?: LeadBus;
};

export default function SpikeScene({ avatar, close, world, layout, anchors, pages, bus, caster, fxPool, casts, viewer, castleUnlocked, frozen = false, calm = false, troubles, ride, lead }: RealmCanvasProps) {
  return (
    <Canvas
      frameloop={frozen ? "never" : "always"}
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
        avatar={avatar}
        close={close}
        world={world}
        layout={layout}
        anchors={anchors}
        pages={pages}
        bus={bus}
        caster={caster}
        fxPool={fxPool}
        casts={casts}
        viewer={viewer}
        castleUnlocked={castleUnlocked}
        calm={calm}
        troubles={troubles ?? null}
        ride={ride ?? null}
        lead={lead ?? null}
      />
    </Canvas>
  );
}
