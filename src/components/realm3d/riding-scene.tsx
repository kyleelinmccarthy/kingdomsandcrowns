"use client";

/**
 * RIDING, the canvas half. Three pieces, each mounted with one line in `spike-scene.tsx`:
 *
 *   - `RiddenMount` lives INSIDE the hero's group, so it goes where the hero goes and faces where
 *     they face without a second mover. It draws the mount under a riding child, walking and
 *     galloping by the ground actually covered, and plays the mount-up moment: a puff of dust,
 *     the mount stepping in under the child (from where it was waiting, if it was near), and the
 *     child swinging up into the saddle.
 *   - `Saddle` wraps the child's figure and lifts it into that saddle.
 *   - `Riding` is the world-side frame loop: the state machine (`lib/realm3d/riding.ts`), the
 *     camera value the rig reads, the mount waiting where the child got off, the hitching posts,
 *     the places a child has been, and fast travel (`lib/realm3d/travel.ts`) — the ride itself.
 *
 * None of this moves the hero directly except a fast-travel ride and the step to the side on
 * getting down; everything else is `ride.speed` and `ride.hold`, read by the ordinary mover.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { slideMove, HERO_RADIUS, type Collider, type Pt } from "@/lib/realm3d/collision";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import { holdKeys, seedMoves } from "@/lib/realm3d/held-keys";
import { camGoal, clearPark, isRiding, offTheGround, parkNow, rideRadius, settleRider, stepRide, TOO_DEEP_TO_GET_DOWN, type RideBus } from "@/lib/realm3d/riding";
import { postAt, requestStop, startTravel, stepTravel, travelGraphFor, travelRoute, VILLAGE_ID, type TravelGraph, type TravelRun } from "@/lib/realm3d/travel";
import type { RealmWorld } from "@/lib/realm3d/worldgen";
import { at, litMaterial, merge, paint } from "./geo-kit";
import { MountFigure, drawnBuild, type MountGait } from "./mount-figure";
import { hoofTick, makeHoofClock, mountVoice, wingsOpen, wingTick } from "@/lib/realm3d/sound/ride-cues";

/** The hero figure's hip height (`hero-figure.tsx` HIP): what is lifted onto the saddle. */
const RIDER_HIP = 0.95;
/** Where a child steps to on getting down: this far to their right of the mount. */
const STEP_OFF = 1.15;
/** Beyond this, pressing M brings the mount to you; within it, it walks in from where it waits. */
const CALL_NEAR = 5;

/* ------------------------------------------------------------------ shared per ride */

type Scratch = {
  gait: MountGait;
  /** Where the mount starts the mount-up moment, in the hero's own frame. */
  from: { x: number; z: number; summoned: boolean };
  prev: THREE.Vector3;
  vy: number;
  lastY: number;
};

const scratch = new WeakMap<RideBus, Scratch>();

/** The per-ride scratch the three pieces share. One per `RideBus`, made on first ask. */
function scratchFor(ride: RideBus): Scratch {
  let s = scratch.get(ride);
  if (!s) {
    s = {
      gait: { phase: 0, amp: 0, run: 0, air: 0, t: 0 },
      from: { x: -1.1, z: 0, summoned: true },
      prev: new THREE.Vector3(),
      vy: 0,
      lastY: 0,
    };
    scratch.set(ride, s);
  }
  return s;
}

export { travelGraphFor };

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeBack(t: number): number {
  const c = 1.7;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

/* ------------------------------------------------------------------ inside the hero's group */

/** The mount under a riding child. A child of the hero's group: local space, `+z` forward. */
export function RiddenMount({ ride, heroRef }: { ride: RideBus; heroRef: React.RefObject<THREE.Vector3> }) {
  const g = useRef<THREE.Group>(null);
  const puff = useRef<THREE.Group>(null);
  const s = scratchFor(ride);
  const gait = useMemo(() => ({ current: s.gait }), [s]);
  const m = ride.mount;
  /** The feet and the wings, for the sound (`lib/realm3d/sound/ride-cues.ts`). */
  const feet = useMemo(() => makeHoofClock(), []);
  const winged = mountVoice(m?.id).wings;

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const grp = g.current;
    if (!grp || !m) return;
    const on = ride.phase !== "off";
    grp.visible = on;
    const p = heroRef.current;
    const moved = Math.hypot(p.x - s.prev.x, p.z - s.prev.z);
    track(s, p);
    // In the air by the feet, not by how fast the rider rises or falls: a steep road does that too,
    // and a fast-travel ride up one used to fold the legs up for the whole climb.
    driveGait(s.gait, moved > 5 ? 0 : moved, dt, drawnBuild(m.id).stride, ride.speed || 14, offTheGround(ride.air.s));
    // The sound of it: a foot down off the gait, and a wingbeat on each downstroke of open wings.
    // (A jump's air is the sound's to know: it hears the push-off and the landing, and drops
    // footfalls between them.)
    if (ride.phase === "on") {
      // The rest between footfalls is REAL time (the frame's dt is clamped for the physics): on a
      // slow machine a gallop still sounds three times a second, not once every two.
      const fall = hoofTick(feet, s.gait.phase, s.gait.run, moved > 0.002 && moved <= 5, Math.min(0.25, rawDt));
      if (fall) ride.sound.onFootfall(p.x, p.z, fall === "gallop");
      if (winged && wingTick(feet, s.gait.t, wingsOpen(s.gait.air, s.gait.run))) ride.sound.onWingbeat(s.gait.air >= 0.5);
    }
    if (!on) return;
    // The mount-up moment: it steps in under the child from where it stood, or is called in with
    // a puff of dust if it was far away (or had never been out).
    let x = 0;
    let z = 0;
    let scale = 1;
    if (ride.phase === "up") {
      const e = easeOut(ride.seat);
      x = s.from.x * (1 - e);
      z = s.from.z * (1 - e);
      if (s.from.summoned) scale = 0.25 + 0.75 * easeBack(Math.min(1, ride.seat * 1.4));
    }
    grp.position.set(x, 0, z);
    grp.scale.setScalar(scale);
    const pf = puff.current;
    if (pf) {
      const t = ride.phase === "up" && s.from.summoned ? ride.seat : 1;
      pf.visible = t < 1 && !ride.calm;
      pf.position.set(s.from.x * (1 - easeOut(t)), 0.3, s.from.z * (1 - easeOut(t)));
      pf.scale.setScalar(0.6 + t * 2.2);
      const mat = (pf.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined;
      if (mat) mat.opacity = 0.55 * (1 - t);
    }
  });

  if (!m) return null;
  return (
    <>
      <group ref={g} visible={false}>
        <MountFigure id={m.id} color={m.color} tack={m.tack} gait={gait} />
      </group>
      <Puff puffRef={puff} />
    </>
  );
}

/** A ring of dust: the mount arriving from nowhere. */
function Puff({ puffRef }: { puffRef: React.RefObject<THREE.Group | null> }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e9dcc0", transparent: true, opacity: 0, flatShading: true, depthWrite: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  const bits = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ a: (i / 7) * Math.PI * 2, r: 0.55 + (i % 3) * 0.12, y: (i % 2) * 0.25 })), []);
  return (
    <group ref={puffRef} visible={false}>
      {bits.map((b, i) => (
        <mesh key={i} material={mat} position={[Math.cos(b.a) * b.r, b.y, Math.sin(b.a) * b.r]}>
          <icosahedronGeometry args={[0.26, 0]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Wraps the child's figure: lifts it into the saddle as `ride.seat` goes to 1 (with a hop on the
 * way up), and steps it down to the right on the way off, leaning into a gallop.
 */
export function Saddle({ ride, children }: { ride: RideBus; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const s = scratchFor(ride);
  useFrame(() => {
    const grp = g.current;
    if (!grp) return;
    const m = ride.mount;
    if (!m || ride.phase === "off") {
      grp.position.set(0, 0, 0);
      grp.rotation.x = 0;
      return;
    }
    const b = drawnBuild(m.id);
    const lift = b.seat - RIDER_HIP + 0.04;
    const e = easeOut(ride.seat);
    if (ride.phase === "down") {
      // Hopping off to the right, down beside it.
      const k = 1 - ride.seat;
      grp.position.set(STEP_OFF * easeOut(k), lift * ride.seat + Math.sin(Math.PI * k) * 0.35, b.seatZ * ride.seat);
    } else {
      grp.position.set(0, lift * e + Math.sin(Math.PI * ride.seat) * 0.55 * (ride.calm ? 0 : 1), b.seatZ * e);
    }
    // A forward lean into a gallop; sat back over a jump.
    grp.rotation.x = (s.gait.run * 0.16 - s.gait.air * 0.1) * ride.seat;
  });
  return <group ref={g}>{children}</group>;
}

/** `ride.seat` as a ref, for the figure's legs and arms. */
export function useSeatRef(ride: RideBus | null | undefined): { readonly current: number } | undefined {
  return useMemo(() => (ride ? { get current() { return ride.seat; } } : undefined), [ride]);
}

/** Distance-driven: the legs turn over because the ground went past. */
function driveGait(g: MountGait, moved: number, dt: number, stride: number, top: number, aloft: boolean): void {
  g.t += dt;
  g.phase += (moved / stride) * Math.PI * 2;
  const speed = moved / Math.max(dt, 1e-3);
  const run = Math.min(1, Math.max(0, (speed - 6) / Math.max(4, top - 6)));
  g.run = THREE.MathUtils.damp(g.run, run, 5, dt);
  g.amp = THREE.MathUtils.damp(g.amp, moved > 0.002 ? 0.38 + 0.42 * g.run : 0, 8, dt);
  g.air = THREE.MathUtils.damp(g.air, aloft ? 1 : 0, 10, dt);
}

/* ------------------------------------------------------------------ the world side */

/**
 * The world half: runs the state machine, eases the camera value, remembers places, parks and
 * draws the waiting mount, draws the hitching posts, and rides fast travel.
 *
 * Mounted BEFORE the doorstep in the tree, so the frame it runs on after a room is still the one
 * where the hero is at the door they went in by.
 */
export function Riding({
  ride,
  bus,
  heroRef,
  facingRef,
  aimRef,
  keys,
  solids,
  world,
}: {
  ride: RideBus;
  bus: HudBus;
  heroRef: React.RefObject<THREE.Vector3>;
  /** The way the hero's body faces (the mover writes it every frame). */
  facingRef: React.RefObject<number>;
  aimRef: React.RefObject<number>;
  keys: React.RefObject<{ f: boolean; b: boolean; l: boolean; r: boolean }>;
  solids: Collider[];
  world: RealmWorld;
}) {
  const graph = useMemo(() => travelGraphFor(world), [world]);
  const s = scratchFor(ride);
  const run = useRef<TravelRun | null>(null);
  const pos = useMemo<Pt>(() => ({ x: 0, z: 0 }), []);
  const out = useMemo(() => ({ heading: 0 }), []);
  const side = useMemo<Pt>(() => ({ x: 0, z: 0 }), []);
  const settled = useMemo<Pt>(() => ({ x: 0, z: 0 }), []);
  const lookClock = useRef(0);
  // The keys a child is physically holding, whoever was listening when they went down.
  useEffect(() => holdKeys(), []);

  useFrame((_, rawDt) => {
    if (bus.paused) return;
    const dt = Math.min(0.05, rawDt);
    // A key held through a doorway (or out of a menu) walks at once, rather than after the
    // browser's half-second auto-repeat: the island ignored its key-down while it was paused.
    seedMoves(keys.current);
    const p = heroRef.current;
    const depth = Math.max(0, world.waterLevelAt(p.x, p.z) - world.heightAt(p.x, p.z));
    const yaw = facingRef.current;
    writeAt(ride, p.x, p.z, yaw, depth);

    /* ---- the places a child has stood in ---------------------------------- */
    lookClock.current += dt;
    if (lookClock.current > 0.25) {
      lookClock.current = 0;
      const here = world.landmarkAt(p.x, p.z);
      if (here && !ride.visited.has(here.id)) markVisited(ride, here.id);
    }

    /* ---- getting on: where does the mount come from? ------------------------ */
    if (ride.want === true && ride.phase === "off") {
      const pk = ride.parked;
      const dx = pk.x - p.x;
      const dz = pk.z - p.z;
      if (pk.on && Math.hypot(dx, dz) < CALL_NEAR) {
        // Into the hero's own frame: the mover's facing is `yaw`.
        const c = Math.cos(-yaw);
        const sn = Math.sin(-yaw);
        setFrom(s, dx * c + dz * sn, -dx * sn + dz * c, false);
      } else setFrom(s, -1.1, 0, true);
      if (s.from.summoned) ride.sound.onMoment("summon");
      hidePark(ride);
    }

    /* ---- the state machine --------------------------------------------------- */
    const ev = stepRide(ride, dt, depth);
    if (ev === "refused-deep") ride.onSay(TOO_DEEP_TO_GET_DOWN);
    // A mount's body is wider than a child's, and it grows where the child stands: eased out of
    // any wall or trunk it grew into, over the mount-up moment, so nobody is left embedded.
    if (ride.phase !== "off") {
      settleRider(settled, p.x, p.z, p.y, solids, rideRadius(ride, HERO_RADIUS), dt);
      moveHero(p, settled.x, settled.z);
    }
    if (ev === "dismounted") {
      // The mount stays where it stood; the child is set down a step to its right.
      parkHere(ride, p.x, p.z, yaw);
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      // Local +x (the child's right, looking along +z) in world terms.
      slideMove(side, p.x, p.z, p.x + c * STEP_OFF, p.z - sn * STEP_OFF, solids, 0.5, p.y);
      moveHero(p, side.x, side.z);
    }

    /* ---- fast travel ---------------------------------------------------------- */
    if (ride.travelTo !== null) {
      const to = ride.travelTo;
      clearTravelAsk(ride);
      const post = postAt(graph, p.x, p.z);
      if (post && ride.phase === "on" && ride.mount && to !== post.id && (to === VILLAGE_ID || ride.visited.has(to))) {
        const route = travelRoute(graph, post.id, { x: p.x, z: p.z }, to);
        const r = startTravel(to, route, ride.speed);
        if (r) {
          if (ride.calm) {
            // Reduced motion: no ride and no camera move — an arrival, and the frame says where.
            const end = route[route.length - 1];
            moveHero(p, end.x, end.z);
            const dest = graph.posts.find((q) => q.id === to);
            aimRef.current = dest ? dest.face : aimRef.current;
            ride.onTravel("arrive", to);
            ride.sound.onTravel("arrive");
            wantDown(ride);
          } else {
            run.current = r;
            setTravelling(ride, true, to);
            ride.onTravel("start", to);
            ride.sound.onTravel("start");
          }
        }
      }
    }
    // A ride ended from outside — the child went through a door on the way (`parkNow`) — is
    // dropped here, before it can move them another step.
    if (run.current && !ride.travelling) run.current = null;
    const r = run.current;
    if (r) {
      const k = keys.current;
      if (ride.stop || k.f || k.b || k.l || k.r) {
        requestStop(r);
        setTravelling(ride, true, r.to);
      }
      copyXZ(pos, p);
      const done = stepTravel(r, pos, dt, out);
      moveHero(p, pos.x, pos.z);
      aimRef.current = out.heading;
      if (done) {
        run.current = null;
        setTravelling(ride, false, null);
        const arrived = r.index >= r.route.length;
        if (arrived) {
          const dest = graph.posts.find((q) => q.id === r.to);
          if (dest) aimRef.current = dest.face;
          ride.onTravel("arrive", r.to);
          ride.sound.onTravel("arrive");
          wantDown(ride);
        } else {
          ride.onTravel("stop", r.to);
          ride.sound.onTravel("stop");
        }
      }
    }
    carry(ride);

    // The camera value the rig reads: up and back when riding, further on a ride.
    easeCam(ride, camGoal(ride), dt);
    // The child's nameplate goes up with them into the saddle.
    writeLift(bus.heroLift, ride.mount && ride.phase !== "off" ? (drawnBuild(ride.mount.id).seat - RIDER_HIP) * easeOut(ride.seat) : 0);
  });

  return (
    <>
      <ParkedMount ride={ride} world={world} solids={solids} />
      <HitchingPosts graph={graph} world={world} />
    </>
  );
}

/* Free functions, so nothing here assigns through a prop (the React compiler's rule). */
function writeLift(lift: { y: number }, y: number): void {
  lift.y = y;
}
function track(s: Scratch, p: THREE.Vector3): void {
  s.prev.copy(p);
  s.lastY = p.y;
}
function copyXZ(out: Pt, p: THREE.Vector3): void {
  out.x = p.x;
  out.z = p.z;
}
function writeAt(ride: RideBus, x: number, z: number, yaw: number, depth: number): void {
  ride.at.x = x;
  ride.at.z = z;
  ride.at.yaw = yaw;
  ride.at.depth = depth;
}
function setFrom(s: Scratch, x: number, z: number, summoned: boolean): void {
  s.from.x = x;
  s.from.z = z;
  s.from.summoned = summoned;
}
function hidePark(ride: RideBus): void {
  ride.parked.on = false;
}
function parkHere(ride: RideBus, x: number, z: number, yaw: number): void {
  ride.parked.on = true;
  ride.parked.x = x;
  ride.parked.z = z;
  ride.parked.yaw = yaw;
}
function moveHero(p: THREE.Vector3, x: number, z: number): void {
  p.x = x;
  p.z = z;
}
function clearTravelAsk(ride: RideBus): void {
  ride.travelTo = null;
}
function setTravelling(ride: RideBus, on: boolean, to: string | null): void {
  ride.travelling = on;
  ride.travelDest = on ? to : null;
  ride.stop = false;
}
function markVisited(ride: RideBus, id: string): void {
  ride.visited.add(id);
  ride.onVisit(id);
}
function carry(ride: RideBus): void {
  ride.away.current = ride.travelling;
}
function wantDown(ride: RideBus): void {
  ride.want = false;
}
function easeCam(ride: RideBus, goal: number, dt: number): void {
  ride.cam = ride.calm ? goal : THREE.MathUtils.damp(ride.cam, goal, goal > ride.cam ? 3 : 2.2, dt);
}

/** Park the mount at once — the frame's call when a riding child goes through a door. */
export { parkNow };

/* ------------------------------------------------------------------ the waiting mount */

/** The mount where the child left it: standing, breathing, flicking its tail. */
function ParkedMount({ ride, world, solids }: { ride: RideBus; world: RealmWorld; solids: Collider[] }) {
  const g = useRef<THREE.Group>(null);
  /** Where it was last checked clear: a spot is checked once, when it changes. */
  const checked = useRef({ x: Number.NaN, z: Number.NaN });
  const gait = useMemo(() => ({ current: { phase: 0, amp: 0, run: 0, air: 0, t: 0 } as MountGait }), []);
  const m = ride.mount;
  useFrame((_, rawDt) => {
    const grp = g.current;
    if (!grp) return;
    const pk = ride.parked;
    grp.visible = pk.on && ride.phase === "off";
    if (!grp.visible) return;
    tick(gait.current, Math.min(0.05, rawDt));
    const seen = checked.current;
    if (seen.x !== pk.x || seen.z !== pk.z) {
      // Parked by a door or where the child got off: never standing inside a building.
      clearPark(ride, solids);
      noteChecked(seen, pk.x, pk.z);
    }
    grp.position.set(pk.x, world.heightAt(pk.x, pk.z), pk.z);
    grp.rotation.y = pk.yaw;
  });
  if (!m) return null;
  return (
    <group ref={g} visible={false}>
      <MountFigure id={m.id} color={m.color} tack={m.tack} gait={gait} />
    </group>
  );
}

function noteChecked(seen: { x: number; z: number }, x: number, z: number): void {
  seen.x = x;
  seen.z = z;
}

function tick(g: MountGait, dt: number): void {
  g.t += dt;
}

/* ------------------------------------------------------------------ hitching posts */

/**
 * One at the village and one at every place, beside the road: dark timber, an iron rail and
 * ring, a gold horseshoe on the board. Never solid (§3.4 of the fast-travel spec). One merged
 * model, one instanced draw.
 */
function HitchingPosts({ graph, world }: { graph: TravelGraph; world: RealmWorld }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    const wood = "#5b3d27";
    const iron = "#2f2e33";
    const parts = [
      paint(at(new THREE.BoxGeometry(0.16, 1.3, 0.16), -0.7, 0.65, 0), wood),
      paint(at(new THREE.BoxGeometry(0.16, 1.3, 0.16), 0.7, 0.65, 0), wood),
      paint(at(new THREE.BoxGeometry(1.7, 0.12, 0.14), 0, 1.18, 0), wood),
      paint(at(new THREE.BoxGeometry(1.5, 0.06, 0.06), 0, 0.82, 0.02), iron),
      paint(at(new THREE.TorusGeometry(0.13, 0.03, 4, 8), 0.25, 0.68, 0.06), iron),
      paint(at(new THREE.TorusGeometry(0.13, 0.03, 4, 8), -0.3, 0.68, 0.06), iron),
      // A tall sign pole with a gold horseshoe on a board facing four ways, so a child can pick a
      // hitching post out from any side, and a gold pennant over it.
      paint(at(new THREE.BoxGeometry(0.12, 1.5, 0.12), 0, 1.9, 0), wood),
      paint(at(new THREE.BoxGeometry(0.66, 0.5, 0.66), 0, 2.2, 0), "#8a6a44"),
      paint(at(new THREE.TorusGeometry(0.15, 0.045, 4, 7, Math.PI * 1.3).rotateZ(-Math.PI * 0.15), 0, 2.18, 0.34), "#e8b93a"),
      paint(at(new THREE.TorusGeometry(0.15, 0.045, 4, 7, Math.PI * 1.3).rotateZ(-Math.PI * 0.15), 0, 2.18, -0.34), "#e8b93a"),
      paint(at(new THREE.TorusGeometry(0.15, 0.045, 4, 7, Math.PI * 1.3).rotateZ(-Math.PI * 0.15).rotateY(Math.PI / 2), 0.34, 2.18, 0), "#e8b93a"),
      paint(at(new THREE.TorusGeometry(0.15, 0.045, 4, 7, Math.PI * 1.3).rotateZ(-Math.PI * 0.15).rotateY(Math.PI / 2), -0.34, 2.18, 0), "#e8b93a"),
      paint(at(new THREE.BoxGeometry(0.04, 0.34, 0.5), 0, 2.48, 0.28), "#f0c24a"),
      // A trough, so it reads as somewhere a mount waits.
      paint(at(new THREE.BoxGeometry(1.1, 0.34, 0.42), 0, 0.17, 0.55), wood),
      paint(at(new THREE.BoxGeometry(0.96, 0.04, 0.3), 0, 0.3, 0.55), "#4a86b5"),
    ];
    return merge(parts);
  }, []);
  const mat = useMemo(() => litMaterial(), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const t = new THREE.Vector3();
    graph.posts.forEach((p, i) => {
      // Square to the road: the rail runs along it, the trough faces it.
      const toRoad = Math.atan2(p.road.x - p.x, p.road.z - p.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), toRoad);
      t.set(p.x, world.heightAt(p.x, p.z) - 0.02, p.z);
      mesh.setMatrixAt(i, m.compose(t, q, one));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [graph, world]);
  return <instancedMesh ref={ref} args={[geo, mat, graph.posts.length]} castShadow receiveShadow frustumCulled={false} />;
}

/** Whether the hero is riding — for the spike scene's one-line checks. */
export { isRiding };
