"use client";

/**
 * RECESS, in the world: the Ring's arch and its eight posts, the gleams, the pace ghost, and the
 * frame loop that runs `lib/realm3d/recess/sim.ts`.
 *
 * Mounted by one line in `spike-scene.tsx`. The arch and the posts are part of the island for
 * everyone — a grown-up visiting sees the course their child runs — but only the child's own
 * visit ever runs: gleams, the lit post, the ghost and the clock are theirs.
 *
 * Nothing here is solid (spec D12.13): the arch straddles the lane, the posts stand beside the
 * line, and a gleam is a pickup radius. Nothing a child can be wedged on.
 *
 * Every frame, unless the game is paused:
 *   1. eat the frame's request (start a run, or stop the one going);
 *   2. fill empty gleam slots on open ground, and step the run: gleams, posts, the arch;
 *   3. hand the frame's events to the frame and the sound;
 *   4. light the next mark, pose the gleams and the ghost, write the lap time and the map mark.
 *
 * The meshes are a fixed pool built once from shared geometry; the loop only moves and toggles
 * them, and allocates nothing.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { overlaps, type Collider } from "@/lib/realm3d/collision";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import type { RideBus } from "@/lib/realm3d/riding";
import { ARCH_HALF_SPAN, ARCH_RADIUS, POST_RADIUS } from "@/lib/realm3d/recess/course";
import { ghostAt, ghostStep, type GhostSample } from "@/lib/realm3d/recess/ghost";
import { paintLapTime, paintMapMark, takeWant, type RecessBus } from "@/lib/realm3d/recess/bus";
import { drainEvents, endRun, GLEAM_COUNT, lapElapsed, spawnGleams, startRun, stepRun, type OpenGround, type StepInput } from "@/lib/realm3d/recess/sim";
import { WALK_HALF, type RealmWorld } from "@/lib/realm3d/worldgen";
import { at, litMaterial, merge, paint } from "./geo-kit";

const GOLD = "#ffd66b";
const CALM_GOLD = "#8a7d5a";
const TIMBER = "#8a5a32";
const TIMBER_DARK = "#5e3b1f";
const STONE = "#9c958a";
const GHOST = "#9fc7ff";
const BEAM_H = 46;

/* ------------------------------------------------------------------ models */

function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: string): THREE.BufferGeometry {
  return at(paint(new THREE.BoxGeometry(w, h, d), hex), x, y, z);
}

/**
 * The start and finish: two timber pillars on stone feet either side of the lane, a beam across
 * with a gold ring on it — the Ring's own mark — and red-and-gold pennants hanging from the beam.
 * Built facing down +x (the lane runs east–west); the pillars stand at z = ±ARCH_HALF_SPAN.
 */
function archGeo(): THREE.BufferGeometry {
  const s = ARCH_HALF_SPAN;
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-s, s]) {
    parts.push(box(0.9, 0.5, 0.9, 0, 0.25, z, STONE));
    parts.push(box(0.5, 4.4, 0.5, 0, 2.6, z, TIMBER));
    parts.push(box(0.62, 0.3, 0.62, 0, 4.85, z, TIMBER_DARK));
  }
  parts.push(box(0.55, 0.5, 2 * s + 1.1, 0, 4.55, 0, TIMBER_DARK));
  parts.push(box(0.42, 0.22, 2 * s + 0.5, 0, 4.12, 0, TIMBER));
  // The Ring: a gold hoop standing on the beam, and a red boss in it.
  parts.push(at(paint(new THREE.TorusGeometry(0.72, 0.14, 6, 18).rotateY(Math.PI / 2), "#f5c04a"), 0, 5.6, 0));
  parts.push(at(paint(new THREE.CylinderGeometry(0.32, 0.32, 0.16, 10).rotateZ(Math.PI / 2), "#c0392b"), 0, 5.6, 0));
  // Pennants: alternating red and gold triangles hung under the beam.
  const n = 6;
  for (let i = 0; i < n; i++) {
    const z = -s + 0.55 + (i * (2 * s - 1.1)) / (n - 1);
    const tri = new THREE.ConeGeometry(0.28, 0.75, 3).rotateX(Math.PI).rotateY(Math.PI / 6);
    parts.push(at(paint(tri, i % 2 ? "#f5c04a" : "#c0392b"), 0, 3.62, z));
  }
  // A chequered start line across the lane, just proud of the ground.
  const cells = 8;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < 2; j++) {
      const z = -s + (i + 0.5) * ((2 * s) / cells);
      parts.push(box(0.3, 0.04, (2 * s) / cells, -0.15 + j * 0.3, 0.03, z, (i + j) % 2 ? "#f4efe2" : "#2d2a26"));
    }
  }
  return merge(parts);
}

/** A course post: a pale timber pole on a stone, a lantern on top, and a little pennant. */
function postGeo(): THREE.BufferGeometry {
  return merge([
    box(0.7, 0.35, 0.7, 0, 0.17, 0, STONE),
    at(paint(new THREE.CylinderGeometry(0.16, 0.2, 3.1, 7), "#c8a878"), 0, 1.85, 0),
    box(0.62, 0.12, 0.62, 0, 3.45, 0, TIMBER_DARK),
    box(0.62, 0.12, 0.62, 0, 4.25, 0, TIMBER_DARK),
    at(paint(new THREE.ConeGeometry(0.46, 0.4, 4).rotateY(Math.PI / 4), TIMBER_DARK), 0, 4.5, 0),
    box(0.9, 0.5, 0.05, 0.6, 2.9, 0, "#c0392b"),
  ]);
}

/** The lantern's glass: its own mesh, so the lit post can glow while the rest stay dim. */
function lanternGeo(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(0.46, 0.68, 0.46).translate(0, 3.85, 0);
}

/** A gleam: a little cut gem, gold, that catches the light. */
function gleamGeo(): THREE.BufferGeometry {
  return new THREE.OctahedronGeometry(0.42, 0).scale(1, 1.35, 1);
}

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * "Your best", on a small dark pill, for over the pace ghost: the spec's rule that the ghost is
 * presented as the child's best time, never as a replay of the child (D12.8).
 */
function ghostLabelTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(20, 30, 52, 0.72)";
  ctx.beginPath();
  ctx.roundRect(8, 8, 240, 48, 24);
  ctx.fill();
  ctx.strokeStyle = "rgba(159, 199, 255, 0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#e8f1ff";
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Your best", 128, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A column of light that fades upward: seen from across the island, it says "here, next". */
function beamTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ frame helpers */

// Written as functions over the objects, not assignments in the component: the memoised
// materials and the bus are the frame loop's to change, and the React compiler (rightly)
// refuses a component body that assigns into a value it memoised or was handed.

function attachMap(mat: THREE.MeshBasicMaterial, map: THREE.Texture): void {
  mat.map = map;
  mat.needsUpdate = true;
}

/** The lit mark breathes at 1 Hz; calm, it is simply brighter and still. */
function breathe(ring: THREE.MeshBasicMaterial, beam: THREE.MeshBasicMaterial, calm: boolean, pulse: number): void {
  ring.opacity = calm ? 1 : 0.7 + pulse * 0.3;
  beam.opacity = calm ? 0.45 : 0.3 + pulse * 0.2;
}

/* ------------------------------------------------------------------ the layer */

export function RecessScene({
  recess,
  bus,
  heroRef,
  world,
  solids,
  ride = null,
  calm,
}: {
  recess: RecessBus;
  bus: HudBus;
  heroRef: React.RefObject<THREE.Vector3>;
  world: RealmWorld;
  solids: Collider[];
  ride?: RideBus | null;
  calm: boolean;
}) {
  const course = recess.course;
  const nPosts = course.posts.length;

  const geos = useMemo(() => ({ arch: archGeo(), post: postGeo(), lantern: lanternGeo(), gleam: gleamGeo(), ghost: new THREE.SphereGeometry(0.55, 14, 10) }), []);
  const ringGeo = useMemo(() => new THREE.TorusGeometry(1, 0.07, 5, 40).rotateX(-Math.PI / 2), []);
  const beamGeo = useMemo(() => new THREE.CylinderGeometry(0.75, 0.75, BEAM_H, 12, 1, true).translate(0, BEAM_H / 2, 0), []);
  const mats = useMemo(() => {
    const wood = litMaterial();
    const dim = new THREE.MeshStandardMaterial({ color: "#6b5a3a", roughness: 0.6, flatShading: true });
    const lit = new THREE.MeshStandardMaterial({ color: "#fff2c0", emissive: "#ffcc4d", emissiveIntensity: 1.6, roughness: 0.4 });
    const gleam = new THREE.MeshStandardMaterial({ color: "#ffe9a0", emissive: "#ffc94a", emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.2, flatShading: true });
    const ghost = new THREE.MeshBasicMaterial({ color: GHOST, transparent: true, opacity: calm ? 0.3 : 0.45, depthWrite: false });
    const ring = new THREE.MeshBasicMaterial({ color: calm ? CALM_GOLD : GOLD, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });
    const ringLit = new THREE.MeshBasicMaterial({ color: calm ? "#c9b27a" : GOLD, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
    const beam = new THREE.MeshBasicMaterial({ color: calm ? "#e8d9a8" : GOLD, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false });
    return { wood, dim, lit, gleam, ghost, ring, ringLit, beam };
  }, [calm]);
  const tex = useMemo(() => ({ glow: glowTexture(), beam: beamTexture(), label: ghostLabelTexture() }), []);
  useEffect(() => attachMap(mats.beam, tex.beam), [mats, tex]);
  useEffect(
    () => () => {
      for (const g of Object.values(geos)) g.dispose();
      ringGeo.dispose();
      beamGeo.dispose();
      tex.glow.dispose();
      tex.beam.dispose();
      tex.label.dispose();
    },
    [geos, ringGeo, beamGeo, tex],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // Where everything stands on the ground. Fixed for the visit.
  const spots = useMemo(() => {
    const y = (x: number, z: number) => world.heightAt(x, z);
    return {
      arch: { x: course.arch.x, y: y(course.arch.x, course.arch.z), z: course.arch.z },
      posts: course.posts.map((p) => ({ x: p.position.x, y: y(p.position.x, p.position.z), z: p.position.z })),
    };
  }, [world, course]);

  /** Dry, open ground for a gleam: on the island, out of the water, and clear of anything solid. */
  const open = useMemo<OpenGround>(
    () => (x, z) => {
      if (Math.abs(x) > WALK_HALF || Math.abs(z) > WALK_HALF) return false;
      if (world.waterLevelAt(x, z) - world.heightAt(x, z) > 0.15) return false;
      for (let i = 0; i < solids.length; i++) if (overlaps(solids[i], x, z, 0.9)) return false;
      return true;
    },
    [world, solids],
  );

  // Development only: the run and the walker, for a screenshot script to read a lap and to set the
  // child down beside a post. Nothing is written anywhere by either.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __realmRecess?: unknown; __realmHero?: unknown };
    w.__realmRecess = recess;
    w.__realmHero = heroRef.current;
    return () => {
      if (w.__realmRecess === recess) delete w.__realmRecess;
      delete w.__realmHero;
    };
  }, [recess, heroRef]);

  const lanterns = useRef<(THREE.Mesh | null)[]>(new Array(nPosts).fill(null));
  const postRings = useRef<(THREE.Mesh | null)[]>(new Array(nPosts).fill(null));
  const archRing = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const beamGlow = useRef<THREE.Sprite>(null);
  const gleams = useRef<(THREE.Group | null)[]>(new Array(GLEAM_COUNT).fill(null));
  const ghost = useRef<THREE.Group>(null);
  const input = useRef<StepInput>({ dt: 0, x: 0, z: 0, mounted: false, travelling: false });
  const sample = useRef<GhostSample>({ x: 0, z: 0, progress: 0 });
  /** Which mark is lit (-1 the arch, 0.. a post, -2 nothing), and its map transform, as last written. */
  const drawn = useRef({ lit: -3, mark: "" });

  useFrame((state, rawDt) => {
    const run = recess.run;
    const p = heroRef.current;
    const time = state.clock.elapsedTime;

    /* ---- the frame's request, and the run ---------------------------------------------- */
    if (!bus.paused && recess.runs) {
      const want = takeWant(recess);
      if (want === "stop") endRun(run);
      else if (want !== null) startRun(run, want, recess.lowStimulus);
      if (run.active) {
        const inp = input.current;
        inp.dt = Math.min(0.05, rawDt) * 1000;
        inp.x = p.x;
        inp.z = p.z;
        inp.mounted = !!ride && ride.phase !== "off";
        inp.travelling = !!ride && ride.travelling;
        spawnGleams(run, course, open);
        stepRun(run, course, inp);
        drainEvents(run, recess.onEvent);
      }
    }

    /* ---- the lit mark: the arch before a lap, the next post during one ------------------- */
    const lit = !run.active ? -2 : run.lapStartedAt === null || run.nextPost >= nPosts ? -1 : run.nextPost;
    const d = drawn.current;
    if (lit !== d.lit) {
      d.lit = lit;
      for (let i = 0; i < nPosts; i++) {
        const lantern = lanterns.current[i];
        if (lantern) lantern.material = i === lit ? mats.lit : mats.dim;
        const ring = postRings.current[i];
        if (ring) ring.material = i === lit ? mats.ringLit : mats.ring;
      }
      if (archRing.current) archRing.current.material = lit === -1 ? mats.ringLit : mats.ring;
      const spot = lit === -1 ? spots.arch : lit >= 0 ? spots.posts[lit] : null;
      if (beam.current) beam.current.visible = spot !== null;
      if (beamGlow.current) beamGlow.current.visible = spot !== null;
      if (spot) {
        beam.current?.position.set(spot.x, spot.y, spot.z);
        beamGlow.current?.position.set(spot.x, spot.y + (lit === -1 ? 5.6 : 3.85), spot.z);
        d.mark = `translate(${spot.x.toFixed(1)} ${spot.z.toFixed(1)})`;
      } else d.mark = "";
    }
    paintMapMark(recess, d.mark);
    // The lit mark breathes at 1 Hz; calm, it is simply brighter and still (the substitution rule).
    if (lit !== -2) {
      const pulse = calm ? 0 : Math.sin(time * Math.PI * 2) * 0.5 + 0.5;
      breathe(mats.ringLit, mats.beam, calm, pulse);
      const r = lit === -1 ? ARCH_RADIUS : POST_RADIUS;
      const ring = lit === -1 ? archRing.current : postRings.current[lit];
      if (ring) ring.scale.setScalar(r * (calm ? 1 : 0.92 + pulse * 0.08));
      if (beamGlow.current) beamGlow.current.scale.setScalar(calm ? 3.2 : 2.8 + pulse * 0.9);
    }

    /* ---- gleams ------------------------------------------------------------------------ */
    for (let i = 0; i < GLEAM_COUNT; i++) {
      const g = gleams.current[i];
      if (!g) continue;
      const gl = run.gleams[i];
      const show = run.active && i < run.slots && gl.live;
      if (g.visible !== show) g.visible = show;
      if (!show) continue;
      const bob = calm ? 0 : Math.sin(time * 2.2 + i * 1.7) * 0.18;
      g.position.set(gl.x, world.heightAt(gl.x, gl.z) + 1.05 + bob, gl.z);
      g.rotation.y = calm ? 0 : time * 1.6 + i;
    }

    /* ---- the pace ghost: your best, where it was at this moment of the lap --------------- */
    const gh = ghost.current;
    if (gh) {
      const elapsed = lapElapsed(run);
      const best = run.mountedThisLap ? recess.bestRide : recess.bestFoot;
      const s = sample.current;
      const on = elapsed !== null && !(ride?.travelling ?? false) && (calm ? ghostStep(course, best, elapsed, s) : ghostAt(course, best, elapsed, s));
      if (gh.visible !== on) gh.visible = on;
      if (on) gh.position.set(s.x, world.heightAt(s.x, s.z) + 1.3 + (calm ? 0 : Math.sin(time * 3) * 0.12), s.z);
    }

    /* ---- the running time ------------------------------------------------------------------ */
    paintLapTime(recess, recess.showTime ? lapElapsed(run) : null);
  });

  return (
    <group>
      {/* Modelled with its pillars on z; turned a quarter so they stand east and west of the cobbles, facing the spawn. */}
      <mesh geometry={geos.arch} material={mats.wood} position={[spots.arch.x, spots.arch.y, spots.arch.z]} rotation={[0, Math.PI / 2, 0]} castShadow />
      <mesh ref={archRing} geometry={ringGeo} material={mats.ring} position={[spots.arch.x, spots.arch.y + 0.08, spots.arch.z]} scale={ARCH_RADIUS} />
      {spots.posts.map((s, i) => (
        <group key={i} position={[s.x, s.y, s.z]}>
          <mesh geometry={geos.post} material={mats.wood} castShadow />
          <mesh
            ref={(el) => {
              lanterns.current[i] = el;
            }}
            geometry={geos.lantern}
            material={mats.dim}
          />
          <mesh
            ref={(el) => {
              postRings.current[i] = el;
            }}
            geometry={ringGeo}
            material={mats.ring}
            position={[0, 0.08, 0]}
            scale={POST_RADIUS}
          />
        </group>
      ))}
      <mesh ref={beam} geometry={beamGeo} material={mats.beam} visible={false} renderOrder={2} />
      <sprite ref={beamGlow} visible={false} renderOrder={3}>
        <spriteMaterial map={tex.glow} color={calm ? "#e8d9a8" : GOLD} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      {Array.from({ length: GLEAM_COUNT }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            gleams.current[i] = el;
          }}
          visible={false}
        >
          <mesh geometry={geos.gleam} material={mats.gleam} />
          <sprite scale={calm ? 1.6 : 2.3}>
            <spriteMaterial map={tex.glow} color="#ffd66b" transparent opacity={calm ? 0.45 : 0.75} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </sprite>
        </group>
      ))}
      <group ref={ghost} visible={false}>
        <mesh geometry={geos.ghost} material={mats.ghost} />
        <sprite scale={2.6}>
          <spriteMaterial map={tex.glow} color={GHOST} transparent opacity={calm ? 0.35 : 0.6} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
        <sprite position={[0, 1.45, 0]} scale={[3.4, 0.85, 1]} renderOrder={5}>
          <spriteMaterial map={tex.label} transparent depthWrite={false} depthTest={false} toneMapped={false} />
        </sprite>
      </group>
    </group>
  );
}
