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
 *   - `chase-camera.tsx` / `mouse-look.tsx`  the camera where the child put it, and the mouse that puts it there
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

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_SIZE, type Prop, type VillagerPlacement, type WorldLayout } from "@/lib/realm/layout";
import { heightAt } from "@/lib/realm3d/heightfield";
import { WALK_HALF, type RealmWorld } from "@/lib/realm3d/worldgen";
import { shoreMove, wadeSpeed } from "@/lib/realm3d/shore";
import { gableGeo, litMaterial, sceneryGeometryFor, seeThrough, vivid } from "./geo-kit";
import { RealmGround, RealmWater, WadeRing } from "./world-ground";
import { RealmProps } from "./world-props";
import { SeeThroughGroup } from "./see-through-group";
import { landmarkColliders, landmarkRadii, RealmLandmarks } from "./landmarks";
import {
  buildColliders,
  HERO_RADIUS,
  pushOut,
  supportHeight,
  type Collider,
  type Pt,
} from "@/lib/realm3d/collision";
import { makeVertical, stepVertical, tryJump, type Vertical } from "@/lib/realm3d/jump";
import { distancePhase, makeDistance, makeStride, resetDistance, strideTick } from "@/lib/realm3d/sound/stride";
import { heroLook } from "@/lib/realm3d/hero-look";
import {
  BACKPEDAL,
  bodyFacing,
  cameraFacing,
  DEFAULT_DIST,
  DEFAULT_PITCH,
  looking,
  makeAim,
  makeMoveIntent,
  moveIntent,
  takeAim,
  turnToward,
  type Aim,
  type LookState,
  type MoveIntent,
} from "@/lib/realm3d/controls";
import { hipTurn, keepMotion, makeMotion, makeStride as makeLegs, readStride, stepMotion, strideRate, type Motion } from "@/lib/realm3d/locomotion";
import { ChaseCamera } from "./chase-camera";
import { MouseLook } from "./mouse-look";
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
import { Villagers } from "./villagers";
import type { SpellPageView } from "@/lib/realm/spells/pages";
import { digitSlot, pushCast, type Caster, type CastQueue } from "@/lib/realm3d/casting";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import type { PlateAnchor } from "@/lib/realm3d/plate-anchors";
import type { FxSlot } from "@/lib/realm3d/spell-fx";
import { DevDraws } from "./dev-draws";
import { HudDriver } from "./hud-driver";
import { Doorstep } from "./doorstep";
import { SpellFx } from "./spell-fx";
import { Troubles } from "./troubles-scene";
import type { TroubleBus } from "@/lib/realm3d/trouble-bus";
import { boostJump, castBlocked, CAST_FROM_SADDLE, holdDrop, jumpSpeed, keepFooting, pace, rideFace, rideRadius, wadeLimit, writeAir, type RideBus } from "@/lib/realm3d/riding";
import { RiddenMount, Riding, Saddle, travelGraphFor, useSeatRef } from "./riding-scene";
import { bodyFor, slideBody, turnBody } from "@/lib/realm3d/mount-body";
import { RecessScene } from "./recess-scene";
import { LIT_WINDOW, paintColor, useDayLight } from "./day-light";
import type { DayLight } from "@/lib/realm3d/day-cycle";
import type { RecessBus } from "@/lib/realm3d/recess/bus";
import { ARCH_HALF_SPAN } from "@/lib/realm3d/recess/course";
import { typingInto } from "@/lib/realm3d/typing";

/* ------------------------------------------------------------------ palette */

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
  const mat = useMemo(() => seeThrough(litMaterial()), []);
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
      <primitive object={LIT_WINDOW} attach="material" />
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
        // Villagers are people now, drawn by `Villagers` (`villagers.tsx`) beside the village.
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
 * Which way the body faces is `bodyFacing`'s rule in `lib/realm3d/controls.ts`, and every turn
 * goes the short way round through `turnToward`. See that file for why strafing used to flip.
 */
function Hero({
  heroRef,
  keys,
  yawRef,
  view,
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
  view: React.RefObject<LookState>;
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
  const motion = useMemo<Motion>(() => makeMotion(), []);
  const move = useMemo<Pt>(() => ({ x: 0, z: 0 }), []);
  const legs = useMemo(() => makeLegs(), []);
  /** The last facing a cast, a lock-on, a doorway or a ride asked for, and when (`AIM_HOLD`). */
  const aim = useMemo<Aim>(() => makeAim(), []);
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
    const p = heroRef.current;
    const ground = world.heightAt(p.x, p.z);
    // The body has weight (`locomotion.ts`): the keys say what speed it wants — its full speed on
    // flat dry ground sets the grip — and the wade, the air and a backpedal take their share.
    const top = pace(ride, HERO_SPEED, 0, false, wadeSpeed);
    const wanted = intent.moving && !held ? pace(ride, HERO_SPEED, Math.max(0, world.waterLevelAt(p.x, p.z) - ground), !vert.grounded, wadeSpeed) * (intent.back ? BACKPEDAL : 1) : 0;
    stepMotion(motion, move, intent.x * wanted, intent.z * wanted, top, vert.grounded, dt);
    if (move.x !== 0 || move.z !== 0) {
      const tx = THREE.MathUtils.clamp(p.x + move.x, -WALK_HALF, WALK_HALF);
      const tz = THREE.MathUtils.clamp(p.z + move.z, -WALK_HALF, WALK_HALF);
      // Two refusals, axis by axis: the water will not let you off the shelf, and the village will
      // not let you through a wall. Head-on you stop; at an angle you slide along it.
      shoreMove(wet, p.x, p.z, tx, tz, world.heightAt, levelAt, wadeLimit(ride));
      slideBody(step, p.x, p.z, wet.x, wet.z, facingRef.current, solids, rideRadius(ride, HERO_RADIUS), bodyFor(ride), vert.y);
      // What the world refused takes the speed that ran into it: a wall is slid along, not leant on.
      keepMotion(motion, move.x, move.z, step.x - p.x, step.z - p.z);
      p.x = step.x;
      p.z = step.z;
    }
    readStride(legs, motion, facingRef.current, top);
    const moving = legs.speed > 0.05;
    // Which way the body turns (`bodyFacing`): where it travels, where a cast or a ride asked a
    // moment ago, or where the mouse looks. NaN holds it.
    const now = nowS();
    takeAim(aim, aimRef.current, now);
    aimRef.current = Number.NaN;
    const travel = intent.moving && !held ? rideFace(ride, intent) : Number.NaN;
    const face = bodyFacing(travel, cameraFacing(yawRef.current), looking(view.current, now), held, aim, now);
    if (face === face) facing.current = face;
    // The stride runs the way the body goes: backwards for a backpedal, slower in the air.
    bob.current += dt * strideRate(legs, vert.grounded);
    // Edge-triggered: the keydown handler ignores auto-repeat, and this eats the press.
    if (takeJump(k) && !held && tryJump(vert)) {
      boostJump(vert, jumpSpeed(ride, vert.vy));
      bus.feet.onJump();
    }
    const footed = vert.grounded;
    stepVertical(vert, dt, p.x, p.z, world.heightAt(p.x, p.z), solids);
    // Riding, the mount keeps its feet going downhill rather than sailing off every slope.
    if (ride && footed && !vert.grounded) keepFooting(vert, footed, supportHeight(p.x, p.z, world.heightAt(p.x, p.z), solids, HERO_RADIUS, vert.y), holdDrop(ride, dt));
    if (ride) writeAir(ride, vert.grounded, vert.airborne);
    p.y = vert.y;
    if (ride?.travelling) strideTick(stride, bus.feet, distancePhase(road, p.x, p.z), vert.grounded, true, dt, p.x, p.z);
    else {
      resetDistance(road);
      strideTick(stride, bus.feet, bob.current, vert.grounded, moving, dt, p.x, p.z);
    }

    // The limbs, the cape and the companion all read the same two numbers.
    const g2 = gaitRef.current;
    g2.phase = bob.current;
    g2.speed = legs.speed;
    // Riding, the legs straddle the saddle: no sidestep there.
    g2.hip = ride && ride.phase !== "off" ? 0 : hipTurn(legs);

    const g = group.current;
    if (!g) return;
    let yaw = turnToward(g.rotation.y, facing.current, 12, dt);
    // A mount turning beside a wall shuffles clear of it, or holds a turn it has no room for.
    const body = bodyFor(ride);
    if (body) {
      yaw = turnBody(step, p.x, p.z, g.rotation.y, yaw, solids, rideRadius(ride, HERO_RADIUS), body, vert.y);
      p.x = step.x;
      p.z = step.z;
    }
    g.position.set(p.x, p.y + (moving && vert.grounded ? Math.abs(Math.sin(bob.current)) * 0.09 : 0), p.z);
    g.rotation.y = yaw;
    g.rotation.z = moving ? Math.sin(bob.current) * 0.035 : 0;
    facingRef.current = g.rotation.y;
  });

  return <group ref={group}>{children}</group>;
}

/* --------------------------------------------------------- light and camera */

function Sun({ heroRef, day }: { heroRef: React.RefObject<THREE.Vector3>; day: DayLight }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const fill = useRef<THREE.AmbientLight>(null);
  const scene = useThree((s) => s.scene);
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
    const d = day.sunDir;
    l.position.set(p.x + d.x * 90, p.y + d.y * 90, p.z + d.z * 90);
    l.updateMatrixWorld();
    paintColor(l.color, day.sun);
    l.intensity = day.sunI;
    const h = hemi.current;
    if (h) {
      paintColor(h.color, day.hemiSky);
      paintColor(h.groundColor, day.hemiGround);
      h.intensity = day.hemiI;
    }
    if (fill.current) fill.current.intensity = day.ambientI;
    if (scene.fog) paintColor(scene.fog.color, day.fog);
  });

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
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
      <hemisphereLight ref={hemi} />
      <ambientLight ref={fill} />
    </>
  );
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
 * The lantern glow for a `lamp` strength: brighter and wider after dark. A free function because
 * the compiler lint forbids writing a memoised material or a child in a hook. `spots` and the
 * group's children are in the same order.
 */
function glow(m: THREE.SpriteMaterial, group: THREE.Group | null, spots: readonly { s: number }[], lamp: number): void {
  m.opacity = Math.min(1, 0.45 + 0.25 * lamp);
  if (!group) return;
  for (let i = 0; i < spots.length; i++) {
    const c = group.children[i];
    if (c) c.scale.set(1.1 * spots[i].s * lamp, 1.1 * spots[i].s * lamp, 1);
  }
}

/**
 * A small warm glow at the head of every lantern in the patch.
 *
 * It was a 3.4-unit additive disc, which in daylight read as one more floating gold orb — the
 * thing the owner asked to be rid of — and a lantern at noon does not throw a halo wider than a
 * door. Now it is a lamp-sized glint that sits on the lamp.
 */
function LanternGlow({ scenery, tex, day }: { scenery: readonly Prop[]; tex: THREE.Texture; day: DayLight }) {
  const mat = useMemo(() => new THREE.SpriteMaterial({ map: tex, color: "#ffd38a", transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [tex]);
  useEffect(() => () => mat.dispose(), [mat]);
  const group = useRef<THREE.Group>(null);
  const shown = useRef(-1);

  const spots = useMemo(
    () =>
      scenery
        .filter((p) => p.variant === "lantern" && Math.abs(p.position.x) <= CORE_HALF && Math.abs(p.position.z) <= CORE_HALF)
        .map((p) => ({ x: p.position.x, z: p.position.z, s: p.size.h / 1.4 })),
    [scenery],
  );
  // By day a lamp is a glint on the lamp; after dark it glows and swells. `lamp` moves once a
  // minute, so the sprites are only touched when it has.
  useFrame(() => {
    if (shown.current === day.lamp) return;
    shown.current = day.lamp;
    glow(mat, group.current, spots, day.lamp);
  });
  return (
    <group ref={group}>
      {spots.map((s, i) => (
        <sprite key={i} position={[s.x, heightAt(s.x, s.z) + 1.82 * s.s, s.z]} scale={[1.1 * s.s, 1.1 * s.s, 1]} material={mat} />
      ))}
    </group>
  );
}

/* --------------------------------------------------------------------- sky */

function SkyDome({ day }: { day: DayLight }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { top: { value: new THREE.Color() }, low: { value: new THREE.Color() } },
        vertexShader: `varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 low; varying float vY; void main(){ gl_FragColor = vec4(mix(low, top, smoothstep(-0.05, 0.55, vY)), 1.0); }`,
      }),
    [],
  );
  useFrame(() => {
    paintColor(mat.uniforms.top.value, day.skyTop);
    paintColor(mat.uniforms.low.value, day.skyLow);
  });
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
  recess = null,
  timeZone,
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
  /** Recess and the Ring (`recess-scene.tsx`): the arch and posts always, a run on the child's own visit. */
  recess?: RecessBus | null;
  timeZone: string | null;
}) {
  const day = useDayLight(timeZone);
  const look = useMemo(() => heroLook(avatar), [avatar]);
  const seat = useSeatRef(ride);

  /**
   * What stops the hero: one list. The camera steers round nothing (it never moves itself, and
   * the see-through shader thins what stands in the way), so nothing else is kept.
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

  const { solids, fixedSolids } = useMemo(() => {
    // The castle's colliders come from its own plan, and only when it is standing: an unlocked
    // castle is walls to walk round; locked, its
    // grounds are open ground.
    const built = buildColliders(layout.props.filter((p) => p.kind !== "castle"), scenery, { sitePlan: SITE_PLAN, wallH: WALL_H, roofH: ROOF_H, treeScale: TREE_SCALE, patchHalf: CORE_HALF });
    if (castle && castleUnlocked) {
      const { prop, plan, ground } = castle;
      const put = (list: Collider[], b: (typeof plan.solids)[number]) =>
        list.push({ x: prop.position.x + b.x, z: prop.position.z + b.z, hw: b.hw, hd: b.hd, round: b.round, base: ground + b.base, top: ground + b.top });
      for (const b of plan.solids) put(built.solids, b);
    }
    const marks = landmarkColliders(world);
    built.solids.push(...marks.solids);
    return { ...built, fixedSolids: built.solids.length };
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
    // The Ring's arch is an E spot too: E there opens the Ring's board.
    const arch = recess ? { x: recess.course.arch.x, z: recess.course.arch.z, halfSpan: ARCH_HALF_SPAN } : null;
    return buildSpots({ props: layout.props, sitePlan: SITE_PLAN, landmarks: world.landmarks, landmarkRadius: landmarkRadii(world), castle: gate, posts, arch });
  }, [layout, world, castle, castleUnlocked, ride, recess]);
  const heroRef = useRef(spawn);
  const yawRef = useRef(0);
  const facingRef = useRef(0);
  const gaitRef = useRef<Gait>({ speed: 0, phase: 0 });
  const aimRef = useRef(Number.NaN);
  const keys = useRef<Keys>({ f: false, b: false, l: false, r: false, jump: false, interact: false });
  const view = useRef<LookState>({ pitch: DEFAULT_PITCH, dist: DEFAULT_DIST, held: false, lastLookAt: -1e9 });
  const lookPaused = useCallback(() => bus.paused, [bus]);
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
      <SkyDome day={day} />
      {/*
        The haze starts well past the village and ends past the far coast. Both numbers are the
        draw distance's doing: the whole island is drawn, so fog is not hiding a horizon — it is
        the only thing that puts three hundred units of air between a child and a mountain. `Sun`
        paints its colour from the hour before the first frame draws.
      */}
      <fog attach="fog" args={["#000000", 140, 520]} />
      <Sun heroRef={heroRef} day={day} />
      <RealmGround world={world} heroRef={heroRef} />
      <RealmWater world={world} />
      <RealmProps
        world={world}
        heroRef={heroRef}
        solids={solids}
        villageSolids={fixedSolids}
      />
      <Scenery scenery={scenery} world={world} />
      <SeeThroughGroup>
        <RealmLandmarks world={world} />
        <Village props={layout.props} villagers={layout.villagers} castleType={layout.castleType} castleUnlocked={castleUnlocked} />
      </SeeThroughGroup>
      <Villagers villagers={layout.villagers} heroRef={heroRef} />
      <Hero heroRef={heroRef} keys={keys} yawRef={yawRef} view={view} bus={bus} facingRef={facingRef} gaitRef={gaitRef} aimRef={aimRef} solids={solids} world={world} ride={ride}>
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
      {viewer !== "parent" && look.companion && <Companion look={look.companion} heroRef={heroRef} facingRef={facingRef} hideRef={ride?.away} lead={lead} world={world} solids={solids} layout={layout} recess={recess} troubles={troubles} />}
      <WadeRing world={world} heroRef={heroRef} />
      <LanternGlow scenery={scenery} tex={tex} day={day} />
      <Motes tex={tex} />
      <SpellFx pool={fxPool} />
      <Interaction spots={spots} heroRef={heroRef} keys={keys} bus={bus} world={world} />
      <ChaseCamera heroRef={heroRef} yawRef={yawRef} view={view} bus={bus} close={close} solids={solids} world={world} ride={ride} />
      <MouseLook bus={bus} yawRef={yawRef} view={view} paused={lookPaused} />
      {/* Riding: the mount's moments, where it waits, the hitching posts and fast travel. Before the doorstep (see its note). */}
      {ride && <Riding ride={ride} bus={bus} heroRef={heroRef} facingRef={facingRef} aimRef={aimRef} keys={keys} solids={solids} world={world} />}
      {/* Going in and coming out of doors, and never being left inside a wall. After the camera: it may set the camera. */}
      <Doorstep bus={bus} heroRef={heroRef} yawRef={yawRef} aimRef={aimRef} keys={keys} view={view} solids={solids} props={layout.props} sitePlan={SITE_PLAN} castle={castle} castleTier={layout.castleType} castleUnlocked={castleUnlocked} world={world} ride={ride} />
      {/* After the camera (markers project from this frame's camera), before the driver (a new charge locks on before it releases). */}
      {troubles && <Troubles tbus={troubles} bus={bus} pool={fxPool} caster={caster} heroRef={heroRef} aimRef={aimRef} solids={solids} world={world} layout={layout} calm={calm} ride={ride} />}
      {/* Recess: the Ring's arch and posts, and a run's gleams, lit post and pace ghost. */}
      {recess && <RecessScene recess={recess} bus={bus} heroRef={heroRef} world={world} solids={solids} ride={ride} calm={calm} troubles={troubles} />}
      {/*
        LAST in the tree on purpose. R3F runs same-priority frame subscribers in the order they
        subscribed, so the driver's projection runs after `ChaseCamera` has already moved the camera
        this frame — a nameplate computed from last frame's camera slides visibly whenever the
        camera moves.
      */}
      {process.env.NODE_ENV !== "production" && <DevDraws />}
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
  /** Recess's wire to the frame (`lib/realm3d/recess/bus.ts`). Without one, there is no Ring. */
  recess?: RecessBus;
  /** The family's timezone: the island's day and night follow its clock (`day-cycle.ts`). */
  timeZone?: string | null;
};

export default function SpikeScene({ avatar, close, world, layout, anchors, pages, bus, caster, fxPool, casts, viewer, castleUnlocked, frozen = false, calm = false, troubles, ride, lead, recess, timeZone }: RealmCanvasProps) {
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
        recess={recess ?? null}
        timeZone={timeZone ?? null}
      />
    </Canvas>
  );
}
