"use client";

/**
 * INDOORS — the room a child walks into, drawn as its own little scene on its own canvas.
 *
 * The rooms themselves are plans (`lib/realm3d/interiors.ts`); the rules of walking, reaching,
 * leaving and the cutaway are `lib/realm3d/room-rules.ts`. This file only turns them into
 * geometry and runs them once a frame.
 *
 * ## Why a separate canvas
 *
 * The island is twenty thousand props; a room is a few hundred parts. While the child is indoors
 * the island's canvas is FROZEN (`frameloop="never"`, see `frozen` on `RealmCanvasProps`): it
 * keeps every buffer it built, draws nothing and runs no frame loop, so going back outside costs
 * nothing to rebuild. This canvas is mounted on the way in and unmounted on the way out, and it
 * is the only thing drawing while it exists.
 *
 * ## Where the room is
 *
 * Every room is built round a point far out in the sea (`ROOM_ORIGIN`), where the island's ground
 * is a flat -34. That is for the child's pet: `Companion` stands on `heightAt` under its own feet,
 * and out there `heightAt` is the room's floor, so the pet walks in with the child and stands on
 * the boards rather than in them.
 *
 * ## The camera
 *
 * No boom tricks. A room is cut away instead: every wall between the lens and the room is hidden
 * (with whatever stands against it), so the camera sits outside like a dolls' house and looks in
 * over the knee-high course that is always drawn. The mouse is the camera exactly as outdoors,
 * through the same door (`MouseLook`) with the room's own limits (`ROOM_LOOK`): click to look
 * (Esc lets go), or right-drag while it is free; the wheel zooms. A mouse captured outside comes
 * through the door still captured. The walk is the island's too: the same weight, the same
 * sidestep (`locomotion.ts`).
 *
 * Nothing in a frame allocates.
 */

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { heightAt } from "@/lib/realm3d/heightfield";
import { supportHeight, HERO_RADIUS, type Pt } from "@/lib/realm3d/collision";
import { makeVertical, stepVertical, tryJump, type Vertical } from "@/lib/realm3d/jump";
import { makeStride, strideTick } from "@/lib/realm3d/sound/stride";
import { heroLook } from "@/lib/realm3d/hero-look";
import {
  bodyFacing,
  cameraFacing,
  looking,
  chaseLens,
  makeAim,
  makeMoveIntent,
  moveIntent,
  turnToward,
  BACKPEDAL,
  type Aim,
  type LookState,
  type MoveIntent,
} from "@/lib/realm3d/controls";
import { hipTurn, keepMotion, makeMotion, makeStride as makeLegs, readStride, stepMotion, strideRate, type Motion } from "@/lib/realm3d/locomotion";
import { typingInto } from "@/lib/realm3d/typing";
import { roomPlan, type RoomColors, type RoomPart, type RoomPlan, type WallSide } from "@/lib/realm3d/interiors";
import { hiddenWalls, leavingRoom, makeHidden, pickRoomSpot, roomSlide, roomSpots, ROOM_LOOK, type RoomSpots } from "@/lib/realm3d/room-rules";
import type { RoomVisit } from "@/lib/realm3d/doorways";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import { villagerById } from "@/lib/realm/villagers";
import { villagerLook } from "@/lib/realm3d/villager-look";
import { noticeFacing } from "@/lib/realm3d/attention";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { Companion, HeroFigure, makePetTrail, type Gait } from "./hero-figure";
import { holdKeys, seedMoves } from "@/lib/realm3d/held-keys";
import { WizardFigure } from "./wizard-figure";
import { MouseLook } from "./mouse-look";
import { merge, paint } from "./geo-kit";

/** Out at sea, where the ground is flat for a long way in every direction. See the header. */
const ROOM_ORIGIN = { x: 2000, z: 2000 };
const HERO_SPEED = 8.5;
/** The longest single step the room's solver takes: shorter than any stair's tread. */
const SUBSTEP = 0.12;
/** How long walking into the doorway takes to count as leaving, in seconds. */
const LEAVE_DWELL = 0.14;
/** Nothing aims the body indoors (no casting): an aim that is never taken, for `bodyFacing`. */
const NO_AIM: Aim = makeAim();

export type RoomViewProps = {
  visit: RoomVisit;
  avatar: AvatarConfig;
  viewer: "child" | "parent";
  bus: HudBus;
  /** A panel is open over the room (a conversation, the pause menu): nothing moves. */
  paused: boolean;
  colors: RoomColors;
  /** How many times the room's one thing has been used: each new count plays its animation. */
  used: number;
  /** Walking out of the door, or E at it. */
  onLeave: () => void;
};

type Keys = { f: boolean; b: boolean; l: boolean; r: boolean; jump: boolean; interact: boolean };

export default function RoomView({ visit, avatar, viewer, bus, paused, colors, used, onLeave }: RoomViewProps) {
  const plan = useMemo(() => roomPlan(visit.room, colors), [visit.room, colors]);
  const keeper = plan.keeper ? villagerById(plan.keeper.villager) : null;
  const plateRef = useRef<HTMLDivElement>(null);
  const live = useRef({ paused, onLeave, used, usedAt: -1e9 });
  useEffect(() => {
    live.current.paused = paused;
    live.current.onLeave = onLeave;
  }, [paused, onLeave]);
  useEffect(() => {
    if (used !== live.current.used) {
      live.current.used = used;
      live.current.usedAt = performance.now() / 1000;
    }
  }, [used]);

  return (
    <div className="r3-room" data-room={visit.room}>
      <Canvas
        dpr={1}
        shadows={{ type: THREE.PCFShadowMap }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 50, near: 0.1, far: 400, position: [ROOM_ORIGIN.x, 60, ROOM_ORIGIN.z + 12] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <RoomWorld plan={plan} avatar={avatar} viewer={viewer} bus={bus} live={live} plateRef={plateRef} keeperName={keeper?.name ?? null} />
      </Canvas>
      {keeper && (
        <div className="r3-plates r3-room-plates" aria-hidden="true">
          <div ref={plateRef} className="r3-plate r3-plate--villager" style={{ ["--r3-ink" as string]: "#8fd07a", display: "none" }}>
            <span className="r3-plate-mark r3-plate-mark--done">✓</span>
            <span className="r3-plate-text">
              <span className="r3-plate-name">{keeper.name}</span>
              <span className="r3-plate-sub">{plan.name.replace(/^the /, "The ")}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

type Live = React.RefObject<{ paused: boolean; onLeave: () => void; used: number; usedAt: number }>;

const RoomWorld = memo(function RoomWorld({
  plan,
  avatar,
  viewer,
  bus,
  live,
  plateRef,
  keeperName,
}: {
  plan: RoomPlan;
  avatar: AvatarConfig;
  viewer: "child" | "parent";
  bus: HudBus;
  live: Live;
  plateRef: React.RefObject<HTMLDivElement | null>;
  keeperName: string | null;
}) {
  const oy = useMemo(() => heightAt(ROOM_ORIGIN.x, ROOM_ORIGIN.z), []);
  const look = useMemo(() => heroLook(avatar), [avatar]);
  const heroRef = useRef(new THREE.Vector3(ROOM_ORIGIN.x + plan.spawn.x, oy, ROOM_ORIGIN.z + plan.spawn.z));
  const local = useRef({ x: plan.spawn.x, y: 0, z: plan.spawn.z });
  const facingRef = useRef(plan.spawn.face);
  const gaitRef = useRef<Gait>({ speed: 0, phase: 0 });
  const keys = useRef<Keys>({ f: false, b: false, l: false, r: false, jump: false, interact: false });
  const yawRef = useRef(0);
  const view = useRef<LookState>({ pitch: plan.view.pitch, dist: plan.view.dist, held: false, lastLookAt: -1e9 });
  const lookPaused = useCallback(() => roomPaused(live), [live]);
  const walls = useRef<Record<WallSide, THREE.Group | null>>({ n: null, s: null, e: null, w: null });
  const spots = useMemo(() => roomSpots(plan, keeperName), [plan, keeperName]);
  // The pet follows the child's own footsteps here, so it goes up the stair after them rather than
  // standing on the floor under the lookout or the gallery; and it stands on the step it is on.
  const petTrail = useMemo(() => makePetTrail(), []);
  const petGround = useMemo(
    () => (x: number, z: number, feetY: number) => oy + supportHeight(x - ROOM_ORIGIN.x, z - ROOM_ORIGIN.z, 0, plan.solids, 0.3, feetY - oy),
    [plan, oy],
  );

  // Keys. The island ignores them while the child is indoors (the frame holds its `paused`), so
  // this is the only listener that acts on them.
  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = keys.current;
      if (down && (live.current.paused || typingInto(e.target))) return;
      switch (e.code) {
        case "KeyW": case "ArrowUp": k.f = down; break;
        case "KeyS": case "ArrowDown": k.b = down; break;
        case "KeyA": case "ArrowLeft": k.l = down; break;
        case "KeyD": case "ArrowRight": k.r = down; break;
        case "Space": if (down && !e.repeat) k.jump = true; break;
        case "KeyE": if (down && !e.repeat) k.interact = true; break;
        default: return;
      }
      if (!live.current.paused) e.preventDefault();
    };
    const dn = (e: KeyboardEvent) => set(e, true);
    const up = (e: KeyboardEvent) => set(e, false);
    const blur = () => releaseKeys(keys.current);
    // A key held through the door is walking already: no wait for the browser's auto-repeat.
    const unhold = holdKeys();
    seedMoves(keys.current);
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      unhold();
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [live]);

  return (
    <>
      <color attach="background" args={[plan.mood.background]} />
      <RoomLights plan={plan} oy={oy} />
      <group position={[ROOM_ORIGIN.x, oy, ROOM_ORIGIN.z]}>
        <RoomMeshes plan={plan} walls={walls} live={live} />
        {plan.keeper && keeperName && <Keeper plan={plan} heroLocal={local} />}
        <RoomRing spots={spots} />
      </group>
      <RoomHero plan={plan} oy={oy} heroRef={heroRef} local={local} facingRef={facingRef} gaitRef={gaitRef} keys={keys} yawRef={yawRef} view={view} live={live} bus={bus}>
        {viewer === "parent" ? <WizardFigure gait={gaitRef} /> : <HeroFigure look={look} gait={gaitRef} />}
      </RoomHero>
      {viewer !== "parent" && look.companion && <Companion look={look.companion} heroRef={heroRef} facingRef={facingRef} trail={petTrail} groundAt={petGround} />}
      <RoomInteract spots={spots} local={local} keys={keys} bus={bus} live={live} />
      <RoomCamera plan={plan} oy={oy} local={local} yawRef={yawRef} view={view} walls={walls} live={live} plateRef={plateRef} />
      <MouseLook bus={bus} yawRef={yawRef} view={view} limits={ROOM_LOOK} paused={lookPaused} />
    </>
  );
});

function releaseKeys(k: Keys): void {
  k.f = k.b = k.l = k.r = k.jump = k.interact = false;
}

/** Whether a panel is open over the room, read through the ref when asked. A free function, so the
 *  compiler keeps `MouseLook`'s `paused` stable on `live` rather than on a value read at render. */
function roomPaused(live: Live): boolean {
  return live.current.paused;
}

/** Where the child is in the room. Free functions, so a ref's object is never written as a hook value. */
function putLocal(L: { x: number; y: number; z: number }, x: number, z: number, y: number): void {
  L.x = x;
  L.y = y;
  L.z = z;
}

/** A wall, and whatever hangs on it, cut away (or put back) for the camera. */
function cutWall(g: THREE.Group, cut: boolean): void {
  g.visible = !cut;
  g.userData.cut = cut;
}

/** Up onto the step just walked onto. A free function, so the vertical state is not written as a hook value. */
function liftTo(v: Vertical, y: number): void {
  v.y = y;
  v.vy = 0;
}

function eat(k: Keys, which: "jump" | "interact"): boolean {
  if (!k[which]) return false;
  k[which] = false;
  return true;
}

/* ------------------------------------------------------------------ light */

function RoomLights({ plan, oy }: { plan: RoomPlan; oy: number }) {
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(ROOM_ORIGIN.x, oy, ROOM_ORIGIN.z);
    o.updateMatrixWorld();
    return o;
  }, [oy]);
  const [dx, dy, dz] = plan.mood.sunDir;
  const len = Math.hypot(dx, dy, dz);
  const reach = Math.max(plan.W, plan.D) / 2 + 3;
  return (
    <>
      <primitive object={target} />
      <directionalLight
        target={target}
        position={[ROOM_ORIGIN.x + (dx / len) * 40, oy + (dy / len) * 40, ROOM_ORIGIN.z + (dz / len) * 40]}
        color={plan.mood.sun}
        intensity={plan.mood.sunIntensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
        shadow-camera-near={5}
        shadow-camera-far={90}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
      />
      <hemisphereLight args={[plan.mood.sky, plan.mood.ground, plan.mood.hemi]} />
      <ambientLight intensity={0.25} />
      {plan.lights.map((l, i) => (
        <pointLight key={i} position={[ROOM_ORIGIN.x + l.x, oy + l.y, ROOM_ORIGIN.z + l.z]} color={l.color} intensity={l.intensity} distance={l.distance} decay={1.4} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ the room itself */

function partGeometry(p: RoomPart, pivot: { x: number; y: number; z: number }, m: THREE.Matrix4, e: THREE.Euler): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  switch (p.shape) {
    case "box":
      g = new THREE.BoxGeometry(p.sx, p.sy, p.sz);
      break;
    case "cyl":
      g = new THREE.CylinderGeometry(p.sx, p.sz, p.sy, p.seg ?? 10);
      break;
    case "cone":
      g = new THREE.ConeGeometry(p.sx, p.sy, p.seg ?? 8);
      break;
    case "ball":
      g = new THREE.SphereGeometry(1, 9, 6).scale(p.sx, p.sy, p.sz);
      break;
    case "gem":
      g = new THREE.IcosahedronGeometry(1, 0).scale(p.sx, p.sy, p.sz);
      break;
  }
  if (p.rx || p.ry || p.rz) g.applyMatrix4(m.makeRotationFromEuler(e.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0)));
  g.translate(p.x - pivot.x, p.y - pivot.y, p.z - pivot.z);
  return paint(g, p.color);
}

type Batch = { lit: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null; glass: THREE.BufferGeometry | null };
type Group = { key: string; side: WallSide | null; anim: string | null; pivot: { x: number; y: number; z: number }; batch: Batch };

function RoomMeshes({ plan, walls, live }: { plan: RoomPlan; walls: React.RefObject<Record<WallSide, THREE.Group | null>>; live: Live }) {
  const mats = useMemo(
    () => ({
      lit: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      glass: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.32, roughness: 0.1, depthWrite: false }),
    }),
    [],
  );
  // One merged mesh per (wall, animation, material): the whole room is a couple of dozen draws.
  const groups = useMemo<Group[]>(() => {
    const m = new THREE.Matrix4();
    const e = new THREE.Euler();
    const by = new Map<string, { side: WallSide | null; anim: string | null; parts: RoomPart[] }>();
    for (const p of plan.parts) {
      const key = p.anim ? `anim:${p.anim}` : `side:${p.side ?? "-"}`;
      const g = by.get(key);
      if (g) g.parts.push(p);
      else by.set(key, { side: p.side ?? null, anim: p.anim ?? null, parts: [p] });
    }
    const out: Group[] = [];
    for (const [key, g] of by) {
      const a = g.anim ? plan.anims.find((x) => x.id === g.anim) : null;
      const pivot = a ? { x: a.x, y: a.y, z: a.z } : { x: 0, y: 0, z: 0 };
      const lit: THREE.BufferGeometry[] = [];
      const glow: THREE.BufferGeometry[] = [];
      const glass: THREE.BufferGeometry[] = [];
      for (const p of g.parts) (p.glow ? glow : p.glass ? glass : lit).push(partGeometry(p, pivot, m, e));
      out.push({ key, side: g.side, anim: g.anim, pivot, batch: { lit: lit.length ? merge(lit) : null, glow: glow.length ? merge(glow) : null, glass: glass.length ? merge(glass) : null } });
    }
    return out;
  }, [plan]);
  useEffect(
    () => () => {
      for (const g of groups) for (const b of [g.batch.lit, g.batch.glow, g.batch.glass]) b?.dispose();
    },
    [groups],
  );
  useEffect(() => () => Object.values(mats).forEach((x) => x.dispose()), [mats]);

  const animRefs = useRef<(THREE.Group | null)[]>([]);
  const kinds = useMemo(() => groups.map((g) => (g.anim ? (plan.anims.find((a) => a.id === g.anim)?.kind ?? null) : null)), [groups, plan]);
  const fixtureAnim = plan.fixture.anim;

  useFrame((state, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const t = state.clock.elapsedTime;
    const since = performance.now() / 1000 - live.current.usedAt;
    for (let i = 0; i < groups.length; i++) {
      const grp = animRefs.current[i];
      const kind = kinds[i];
      if (!grp || !kind) continue;
      const g = groups[i];
      // How much the fixture's own animation is playing: 1 just after a press, fading over ~4 s.
      const boost = g.anim === fixtureAnim && since >= 0 && since < 6 ? Math.exp(-since * 0.7) : 0;
      animate(grp, kind, g.pivot, t, dt, since, boost, g.anim === fixtureAnim);
      // Walls hide their animated parts too (a lamp on a cut-away wall).
      if (g.side) grp.visible = !(walls.current[g.side]?.userData.cut ?? false);
    }
  });

  return (
    <>
      {groups.map((g, i) => {
        const meshes = (
          <>
            {g.batch.lit && <mesh geometry={g.batch.lit} material={mats.lit} castShadow receiveShadow />}
            {g.batch.glow && <mesh geometry={g.batch.glow} material={mats.glow} />}
            {g.batch.glass && <mesh geometry={g.batch.glass} material={mats.glass} renderOrder={2} />}
          </>
        );
        if (g.anim) {
          return (
            <group key={g.key} ref={(el) => setAt(animRefs.current, i, el)} position={[g.pivot.x, g.pivot.y, g.pivot.z]}>
              {meshes}
            </group>
          );
        }
        if (g.side) {
          const side = g.side;
          return (
            <group key={g.key} ref={(el) => setWall(walls.current, side, el)}>
              {meshes}
            </group>
          );
        }
        return <group key={g.key}>{meshes}</group>;
      })}
    </>
  );
}

function setAt<T>(list: (T | null)[], i: number, v: T | null): void {
  list[i] = v;
}

function setWall(w: Record<WallSide, THREE.Group | null>, side: WallSide, g: THREE.Group | null): void {
  w[side] = g;
}

/** One animated group, one frame. `boost` is the fixture's press, fading; `since` the seconds since it. */
function animate(grp: THREE.Group, kind: string, pivot: { x: number; y: number; z: number }, t: number, dt: number, since: number, boost: number, isFixture: boolean): void {
  switch (kind) {
    case "spin":
      grp.rotation.y += dt * (0.5 + boost * 5);
      break;
    case "wheel":
      grp.rotation.x += dt * (0.5 + boost * 5);
      break;
    case "orbit":
      grp.rotation.y += dt * (1.1 + boost * 5);
      grp.position.y = pivot.y + Math.sin(t * 2.3) * 0.08;
      break;
    case "swing":
      grp.rotation.x = Math.sin(since * 5.5) * 0.55 * boost;
      break;
    case "pull":
      grp.position.y = pivot.y - Math.max(0, Math.sin(since * 5.5)) * 0.45 * boost;
      break;
    case "tilt":
      grp.rotation.z = (isFixture ? Math.sin(since * 4) * 0.35 * boost : 0) + Math.sin(t * 0.9) * 0.03;
      break;
    case "flicker":
      grp.scale.set(1 + Math.sin(t * 11 + pivot.x * 3) * 0.06, 1 + Math.sin(t * 13 + pivot.z * 5) * 0.14 + Math.sin(t * 7.3) * 0.05, 1);
      break;
    case "slide":
      grp.position.x = pivot.x + Math.sin(t * (0.5 + boost * 2.5)) * 0.95;
      break;
    case "flip": {
      // A page turns over when the book is read, then lies back for the next.
      const k = since >= 0 && since < 1.6 ? Math.min(1, since / 0.7) : 0;
      grp.rotation.z = -Math.PI * 0.96 * (k * k * (3 - 2 * k));
      break;
    }
    case "rise": {
      // The crown of light over the throne: rises, turns, glows, and is gone again.
      const on = since >= 0 && since < 5.5 ? Math.min(1, since / 0.8) * Math.min(1, (5.5 - since) / 1.2) : 0;
      grp.visible = on > 0.01;
      grp.scale.setScalar(Math.max(0.001, on));
      grp.position.y = pivot.y + on * 0.6 + Math.sin(t * 2) * 0.08;
      grp.rotation.y += dt * 1.2;
      break;
    }
  }
}

/* ------------------------------------------------------------------ the keeper */

function Keeper({ plan, heroLocal }: { plan: RoomPlan; heroLocal: React.RefObject<{ x: number; y: number; z: number }> }) {
  const k = plan.keeper!;
  // The same look, and the same turn to the child, as the villager out on the green (`villagers.tsx`).
  const look = villagerLook(k.villager);
  const gait = useRef<Gait>({ speed: 0, phase: 0 });
  const g = useRef<THREE.Group>(null);
  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const grp = g.current;
    if (!grp) return;
    // They turn to face the child when the child comes near, and back to the door when not.
    const h = heroLocal.current;
    grp.rotation.y = turnToward(grp.rotation.y, noticeFacing(k.x, k.z, k.face, h.x, h.z), 4, dt);
    gait.current.phase += dt * 1.6; // breathing, not walking
  });
  if (!look) return null;
  return (
    <group ref={g} position={[k.x, 0, k.z]} rotation={[0, k.face, 0]}>
      <HeroFigure look={look} gait={gait} />
    </group>
  );
}

/* ------------------------------------------------------------------ the child */

function RoomHero({
  plan,
  oy,
  heroRef,
  local,
  facingRef,
  gaitRef,
  keys,
  yawRef,
  view,
  live,
  bus,
  children,
}: {
  plan: RoomPlan;
  oy: number;
  heroRef: React.RefObject<THREE.Vector3>;
  local: React.RefObject<{ x: number; y: number; z: number }>;
  facingRef: React.RefObject<number>;
  gaitRef: React.RefObject<Gait>;
  keys: React.RefObject<Keys>;
  yawRef: React.RefObject<number>;
  view: React.RefObject<LookState>;
  live: Live;
  /** For the feet's sound. */
  bus?: HudBus;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const facing = useRef(plan.spawn.face);
  const stride = useMemo(() => makeStride(), []);
  const bob = useRef(0);
  const out = useMemo<Pt>(() => ({ x: 0, z: 0 }), []);
  const vert = useMemo<Vertical>(() => makeVertical(0), []);
  const intent = useMemo<MoveIntent>(() => makeMoveIntent(), []);
  // The body's weight and the legs' reading of it: the island's walk (`locomotion.ts`), indoors.
  const motion = useMemo<Motion>(() => makeMotion(), []);
  const move = useMemo<Pt>(() => ({ x: 0, z: 0 }), []);
  const legs = useMemo(() => makeLegs(), []);
  const leave = useRef(0);
  // Development only: where the child is in the room, for a screenshot script to steer by.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __roomHero?: unknown };
    const here = local.current;
    w.__roomHero = here;
    return () => {
      if (w.__roomHero === here) delete w.__roomHero;
    };
  }, [local]);

  useFrame((_, rawDt) => {
    const g = group.current;
    const L = local.current;
    if (live.current.paused) {
      if (g) g.position.set(ROOM_ORIGIN.x + L.x, oy + L.y, ROOM_ORIGIN.z + L.z);
      return;
    }
    const dt = Math.min(0.05, rawDt);
    const k = keys.current;
    moveIntent(intent, yawRef.current, k);
    const wanted = intent.moving ? HERO_SPEED * (intent.back ? BACKPEDAL : 1) : 0;
    stepMotion(motion, move, intent.x * wanted, intent.z * wanted, HERO_SPEED, vert.grounded, dt);
    if (move.x !== 0 || move.z !== 0) {
      const x0 = L.x;
      const z0 = L.z;
      // In steps no longer than a stair's tread: the solver drops a blocked step whole, and a slow
      // frame's half-unit stride would reach two treads at once and stop dead at the foot of the
      // stair. Each small step climbs whatever it has just stepped onto.
      const n = Math.max(1, Math.ceil(Math.hypot(move.x, move.z) / SUBSTEP));
      const sx = move.x / n;
      const sz = move.z / n;
      for (let i = 0; i < n; i++) {
        roomSlide(out, L.x, L.z, L.x + sx, L.z + sz, plan.solids, HERO_RADIUS, vert.y);
        putLocal(L, out.x, out.z, L.y);
        const under = supportHeight(L.x, L.z, 0, plan.solids, HERO_RADIUS, vert.y);
        if (vert.grounded && under > vert.y) liftTo(vert, under);
      }
      // What a wall refused takes the speed that ran into it: slid along, not leant on.
      keepMotion(motion, move.x, move.z, L.x - x0, L.z - z0);
    }
    readStride(legs, motion, facingRef.current, HERO_SPEED);
    const moving = legs.speed > 0.05;
    // Which way the body turns (`bodyFacing`): where it travels, or where the mouse looks. NaN holds it.
    const now = performance.now() / 1000;
    const travel = intent.moving ? intent.face : Number.NaN;
    const face = bodyFacing(travel, cameraFacing(yawRef.current), looking(view.current, now), false, NO_AIM, now);
    if (face === face) facing.current = face;
    // The stride runs the way the body goes: backwards for a backpedal, slower in the air.
    bob.current += dt * strideRate(legs, vert.grounded);
    if (eat(k, "jump") && tryJump(vert)) bus?.feet.onJump();
    stepVertical(vert, dt, L.x, L.z, 0, plan.solids);
    putLocal(L, L.x, L.z, vert.y);
    if (bus) strideTick(stride, bus.feet, bob.current, vert.grounded, moving, dt, L.x, L.z);

    // Out of the door: walking into it for a moment, as walking into a door outside brings you in.
    if (intent.moving && leavingRoom(plan, L.x, L.z, intent.z, L.y)) {
      leave.current += dt;
      if (leave.current >= LEAVE_DWELL) {
        leave.current = -1e9;
        live.current.onLeave();
      }
    } else if (leave.current > 0) leave.current = 0;

    const gg = gaitRef.current;
    gg.phase = bob.current;
    gg.speed = legs.speed;
    gg.hip = hipTurn(legs);
    heroRef.current.set(ROOM_ORIGIN.x + L.x, oy + L.y, ROOM_ORIGIN.z + L.z);
    if (!g) return;
    g.position.set(ROOM_ORIGIN.x + L.x, oy + L.y + (moving && vert.grounded ? Math.abs(Math.sin(bob.current)) * 0.07 : 0), ROOM_ORIGIN.z + L.z);
    g.rotation.y = turnToward(g.rotation.y, facing.current, 12, dt);
    facingRef.current = g.rotation.y;
  });

  return (
    <group ref={group} position={[ROOM_ORIGIN.x + plan.spawn.x, oy, ROOM_ORIGIN.z + plan.spawn.z]} rotation={[0, plan.spawn.face, 0]}>
      {children}
    </group>
  );
}

/* ------------------------------------------------------------------ E */

function RoomInteract({ spots, local, keys, bus, live }: { spots: RoomSpots; local: React.RefObject<{ x: number; y: number; z: number }>; keys: React.RefObject<Keys>; bus: HudBus; live: Live }) {
  const current = useRef(-1);
  // No "nothing in reach" on the way out: the frame hands back what was in reach at the door
  // (`leave` in realm-game.tsx), and a late null from here would wipe it.
  useFrame(() => {
    const k = keys.current;
    if (live.current.paused) {
      eat(k, "interact");
      return;
    }
    const L = local.current;
    const i = pickRoomSpot(spots, L.x, L.z, L.y, current.current);
    if (i !== current.current) {
      current.current = i;
      bus.onNear(i < 0 ? null : spots.spots[i].target);
      ringAt(spots, i);
    }
    if (eat(k, "interact") && i >= 0) {
      const t = spots.spots[i].target;
      if (t.kind === "door") live.current.onLeave();
      else bus.onInteract(t);
    }
  });
  return null;
}

/** Which spot the ring should hug, for `RoomRing`. Module scope: one room is open at a time. */
const RING = { i: -1, changed: false };
function ringAt(_spots: RoomSpots, i: number): void {
  RING.i = i;
  RING.changed = true;
}

function RoomRing({ spots }: { spots: RoomSpots }) {
  const mesh = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2), []);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#ffe29a", transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    [],
  );
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);
  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    if (RING.changed) {
      RING.changed = false;
      const s = RING.i >= 0 ? spots.spots[RING.i] : null;
      m.visible = !!s;
      if (s) {
        const r = s.round ? s.ring : Math.max(s.hw, s.hd) + 0.4;
        m.position.set(s.x, spots.floors[RING.i] + 0.04, s.z);
        m.scale.set(r, 1, s.round ? r : s.hd + 0.6);
      }
    }
    if (m.visible) setOpacity(mat, 0.32 + 0.2 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3.1)));
  });
  return <mesh ref={mesh} geometry={geo} material={mat} visible={false} renderOrder={4} />;
}

function setOpacity(m: THREE.Material, o: number): void {
  m.opacity = o;
}

/* ------------------------------------------------------------------ the camera */

const PLATE_Y = 2.75;

function RoomCamera({
  plan,
  oy,
  local,
  yawRef,
  view,
  walls,
  live,
  plateRef,
}: {
  plan: RoomPlan;
  oy: number;
  local: React.RefObject<{ x: number; y: number; z: number }>;
  yawRef: React.RefObject<number>;
  view: React.RefObject<LookState>;
  walls: React.RefObject<Record<WallSide, THREE.Group | null>>;
  live: Live;
  plateRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { camera, size } = useThree();
  const desired = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const probe = useMemo(() => new THREE.Vector3(), []);
  const hidden = useMemo(() => makeHidden(), []);
  const first = useRef(true);
  const lastPlate = useRef({ x: -1, y: -1, s: -1, on: false });
  const floorY = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const L = local.current;
    const v = view.current;
    const yaw = yawRef.current;
    // The camera follows the floor the child is on, not every hop: a jump is them rising in frame.
    floorY.current += (L.y - floorY.current) * (1 - Math.exp(-dt * 5));
    const anchor = Math.min(L.y, floorY.current + 0.4);
    if (!live.current.paused || first.current) {
      // A room has no ground to clear: the boom alone.
      chaseLens(desired, ROOM_ORIGIN.x + L.x, oy + anchor + 1.2, ROOM_ORIGIN.z + L.z, yaw, v.pitch, v.dist, null, 0);
      if (first.current) camera.position.copy(desired);
      else camera.position.lerp(desired, 1 - Math.exp(-dt * (v.held ? 20 : 8)));
      look.set(ROOM_ORIGIN.x + L.x, oy + anchor + 1.3, ROOM_ORIGIN.z + L.z);
      camera.lookAt(look);
      first.current = false;
    }
    // Cut away every wall between the lens and the room.
    const cx = camera.position.x - ROOM_ORIGIN.x;
    const cz = camera.position.z - ROOM_ORIGIN.z;
    if (hiddenWalls(hidden, plan, cx, cz)) {
      const w = walls.current;
      for (const s of ["n", "s", "e", "w"] as const) {
        const g = w[s];
        if (g) cutWall(g, hidden[s]);
      }
    }

    // The keeper's nameplate, over their head.
    const el = plateRef.current;
    const k = plan.keeper;
    if (el && k) {
      camera.updateMatrixWorld();
      probe.set(ROOM_ORIGIN.x + k.x, oy + PLATE_Y, ROOM_ORIGIN.z + k.z).project(camera);
      const on = probe.z < 1 && Math.abs(probe.x) < 1.1 && Math.abs(probe.y) < 1.1;
      const px = Math.round((probe.x * 0.5 + 0.5) * size.width);
      const py = Math.round((-probe.y * 0.5 + 0.5) * size.height);
      const dist = camera.position.distanceTo(desired.set(ROOM_ORIGIN.x + k.x, oy + PLATE_Y, ROOM_ORIGIN.z + k.z));
      const s = Math.round(Math.min(1.05, Math.max(0.7, 14 / dist)) * 20) / 20;
      const lp = lastPlate.current;
      if (on !== lp.on) {
        lp.on = on;
        el.style.display = on ? "" : "none";
      }
      if (on && (px !== lp.x || py !== lp.y || s !== lp.s)) {
        lp.x = px;
        lp.y = py;
        lp.s = s;
        el.style.transform = `translate3d(${px}px,${py}px,0) translate(-50%,-100%) scale(${s})`;
      }
    }
  });
  return null;
}
