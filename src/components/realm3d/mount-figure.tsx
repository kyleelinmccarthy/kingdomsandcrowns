"use client";

/**
 * THE MOUNTS — every mount in the catalog (`MOUNTS` in `avatar-catalog.ts`), in the island's
 * low-poly, flat-shaded style: boxes, cones and eight-sided cylinders, the child's chosen colour
 * on the animal's whole body, and tack in the child's own banner colour so the saddle cloth says
 * whose it is.
 *
 * Eight mounts, six bodies. Where the catalog names two of one kind of animal, they share a body
 * and differ where the animals really do:
 *
 *   - **Pony and Donkey share the equine body** (`Equine`). The donkey is lower and rounder, with
 *     long ears, a pale muzzle and belly, a dark cross over its shoulders, a short upright mane and
 *     a thin tail with a tuft — where the pony has a flowing mane and a full tail.
 *   - **Goat and Stag share the light cloven-hoofed body** (`Hind`). The goat is short and stocky,
 *     with a beard, a shaggy chest and horns that sweep back; the stag is long-legged and slim,
 *     with branching antlers and a white rump.
 *   - **Boar, Direwolf, Gryphon and Wyrm are each their own animal**: a squat bristled boar with
 *     tusks; a deep-chested wolf with a ruff and lit eyes; a gryphon, eagle in front and lion
 *     behind, taloned forelegs and wings; a wyrm, long and low, horned, with a spined, swaying tail.
 *
 * Mounts walk and run the way the companions do (`Companion` in `hero-figure.tsx`): the stride is
 * driven by how far the animal actually travelled, so a planted hoof stays planted. At a walk the
 * legs go in diagonal pairs; winding up to a run they slide into a gallop, front pair and hind
 * pair together, and the body rocks over them. Legs are two segments, so a knee folds as a leg
 * comes forward. Wings (the gryphon's, the wyrm's) spread and beat in the air.
 *
 * The rig is `+z` forward and feet at `y = 0`. `MOUNT_BUILD` says where each one's saddle is, so
 * the rider is put in it (`riding-scene.tsx`).
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MOUNT_SCALE } from "@/lib/realm3d/mount-body";

/** What the gait says this frame. `phase` is distance-driven; `amp` 0 standing to ~0.8 at a gallop. */
export type MountGait = { phase: number; amp: number; run: number; air: number; t: number };

export type MountBuild = {
  /** The saddle's top: where the rider's hips go. */
  seat: number;
  /** How far forward of the body's middle the saddle sits. */
  seatZ: number;
  /** One stride per this many world units, at scale 1. */
  stride: number;
  /** Which body it shares. */
  body: "equine" | "hind" | "boar" | "wolf" | "gryphon" | "wyrm";
};

export const MOUNT_BUILD: Record<string, MountBuild> = {
  pony: { seat: 1.58, seatZ: 0, stride: 1.9, body: "equine" },
  donkey: { seat: 1.46, seatZ: 0, stride: 1.6, body: "equine" },
  goat: { seat: 1.4, seatZ: -0.02, stride: 1.5, body: "hind" },
  stag: { seat: 1.66, seatZ: -0.02, stride: 2.1, body: "hind" },
  boar: { seat: 1.46, seatZ: -0.05, stride: 1.4, body: "boar" },
  direwolf: { seat: 1.56, seatZ: -0.05, stride: 2.0, body: "wolf" },
  gryphon: { seat: 1.6, seatZ: -0.08, stride: 2.0, body: "gryphon" },
  wyrm: { seat: 1.5, seatZ: -0.12, stride: 1.9, body: "wyrm" },
};

export function mountBuild(id: string): MountBuild {
  return MOUNT_BUILD[id] ?? MOUNT_BUILD.pony;
}

const DRAWN: Record<string, MountBuild> = Object.fromEntries(
  Object.entries(MOUNT_BUILD).map(([id, b]) => [id, { ...b, seat: b.seat * MOUNT_SCALE, seatZ: b.seatZ * MOUNT_SCALE, stride: b.stride * MOUNT_SCALE }]),
);

/**
 * A mount's build at the size it is DRAWN — `MOUNT_SCALE` over the modelled numbers above, which
 * the bodies themselves are built in. Where the rider sits, and how far a stride carries it.
 */
export function drawnBuild(id: string): MountBuild {
  return DRAWN[id] ?? DRAWN.pony;
}

/* ------------------------------------------------------------------ colour */

function mix(hex: string, other: string, t: number): string {
  return `#${new THREE.Color(hex).lerp(new THREE.Color(other), t).getHexString()}`;
}
const shade = (hex: string, t = 0.3) => mix(hex, "#1b1a22", t);
const lift = (hex: string, t = 0.3) => mix(hex, "#ffffff", t);

type Mats = Record<"body" | "dark" | "pale" | "hoof" | "eye" | "glow" | "leather" | "tack" | "gold" | "bone" | "beak" | "wing", THREE.Material>;

function useMats(color: string, tack: string): Mats {
  const mats = useMemo<Mats>(() => {
    const flat = (c: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.8, ...extra });
    return {
      body: flat(color),
      dark: flat(shade(color, 0.45)),
      pale: flat(lift(color, 0.45)),
      hoof: flat("#3a2c22"),
      eye: flat("#16131c", { roughness: 0.3 }),
      glow: new THREE.MeshStandardMaterial({ color: "#ffd24a", emissive: "#ffb21a", emissiveIntensity: 1.6, toneMapped: false }),
      leather: flat("#6e3b22"),
      tack: flat(tack, { roughness: 0.9 }),
      gold: flat("#d4a843", { metalness: 0.6, roughness: 0.35 }),
      bone: flat("#efe7d6"),
      beak: flat("#e0a526", { roughness: 0.5 }),
      wing: new THREE.MeshStandardMaterial({ color: lift(color, 0.25), flatShading: true, roughness: 0.85, side: THREE.DoubleSide }),
    };
  }, [color, tack]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return mats;
}

/* ------------------------------------------------------------------ parts */

type V3 = [number, number, number];

function Box({ m, p, s, r }: { m: THREE.Material; p: V3; s: V3; r?: V3 }) {
  return (
    <mesh castShadow material={m} position={p} rotation={r}>
      <boxGeometry args={s} />
    </mesh>
  );
}

function Cone({ m, p, radius, h, r, seg = 5 }: { m: THREE.Material; p: V3; radius: number; h: number; r?: V3; seg?: number }) {
  return (
    <mesh castShadow material={m} position={p} rotation={r}>
      <coneGeometry args={[radius, h, seg]} />
    </mesh>
  );
}

/** A round-ish body section lying along z. */
function Barrel({ m, p, r0, r1, len, rx = 0, seg = 8 }: { m: THREE.Material; p: V3; r0: number; r1: number; len: number; rx?: number; seg?: number }) {
  return (
    <mesh castShadow material={m} position={p} rotation={[Math.PI / 2 + rx, 0, 0]}>
      <cylinderGeometry args={[r1, r0, len, seg]} />
    </mesh>
  );
}

type Foot = "hoof" | "cloven" | "paw" | "talon" | "claw";

/**
 * A two-segment leg hung from its hip. Walk offsets are diagonal pairs; gallop offsets bring the
 * front pair and the hind pair together. The knee folds while the leg swings forward.
 */
function Leg({
  gait,
  walk,
  gallop,
  x,
  hip,
  z,
  upper,
  lower,
  w,
  m,
  footM,
  foot,
}: {
  gait: React.RefObject<MountGait>;
  walk: number;
  gallop: number;
  x: number;
  hip: number;
  z: number;
  upper: number;
  lower: number;
  w: number;
  m: THREE.Material;
  footM: THREE.Material;
  foot: Foot;
}) {
  const top = useRef<THREE.Group>(null);
  const knee = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = gait.current;
    const off = walk + (gallop - walk) * g.run;
    const a = g.phase + off;
    // Tucked up in the air, whatever the stride was doing.
    const tuck = g.air;
    if (top.current) top.current.rotation.x = -Math.sin(a) * g.amp * (1 - tuck) - tuck * 0.5;
    if (knee.current) knee.current.rotation.x = Math.max(0, Math.cos(a)) * g.amp * 1.3 * (1 - tuck) + tuck * 1.1;
  });
  const footH = foot === "hoof" || foot === "cloven" ? 0.12 : 0.1;
  return (
    <group ref={top} position={[x, hip, z]}>
      <mesh castShadow material={m} position={[0, -upper / 2, 0]}>
        <boxGeometry args={[w * 1.15, upper + 0.04, w * 1.25]} />
      </mesh>
      <group ref={knee} position={[0, -upper, 0]}>
        <mesh castShadow material={m} position={[0, -lower / 2, 0]}>
          <boxGeometry args={[w * 0.85, lower, w * 0.9]} />
        </mesh>
        {foot === "hoof" && <Box m={footM} p={[0, -lower + footH / 2 - 0.01, 0.02]} s={[w * 1.05, footH, w * 1.15]} />}
        {foot === "cloven" && (
          <>
            <Box m={footM} p={[-w * 0.22, -lower + footH / 2 - 0.01, 0.03]} s={[w * 0.45, footH, w * 1.1]} />
            <Box m={footM} p={[w * 0.22, -lower + footH / 2 - 0.01, 0.03]} s={[w * 0.45, footH, w * 1.1]} />
          </>
        )}
        {foot === "paw" && <Box m={m} p={[0, -lower + 0.05, 0.06]} s={[w * 1.25, 0.1, w * 1.6]} />}
        {(foot === "talon" || foot === "claw") &&
          [-1, 0, 1].map((s) => (
            <Cone key={s} m={footM} p={[s * w * 0.35, -lower + 0.04, 0.1]} radius={0.035} h={0.2} r={[1.35, 0, 0]} seg={4} />
          ))}
      </group>
    </group>
  );
}

/** Four legs, placed by a body's hips. */
function Legs({
  gait,
  frontZ,
  backZ,
  spread,
  hip,
  upper,
  lower,
  w,
  m,
  footM,
  foot,
  frontM,
  frontFoot,
  frontFootM,
}: {
  gait: React.RefObject<MountGait>;
  frontZ: number;
  backZ: number;
  spread: number;
  hip: number;
  upper: number;
  lower: number;
  w: number;
  m: THREE.Material;
  footM: THREE.Material;
  foot: Foot;
  frontM?: THREE.Material;
  frontFoot?: Foot;
  frontFootM?: THREE.Material;
}) {
  const P = Math.PI;
  return (
    <>
      <Leg gait={gait} walk={0} gallop={0} x={-spread} hip={hip} z={frontZ} upper={upper} lower={lower} w={w} m={frontM ?? m} footM={frontFootM ?? footM} foot={frontFoot ?? foot} />
      <Leg gait={gait} walk={P} gallop={0.45} x={spread} hip={hip} z={frontZ} upper={upper} lower={lower} w={w} m={frontM ?? m} footM={frontFootM ?? footM} foot={frontFoot ?? foot} />
      <Leg gait={gait} walk={P} gallop={P} x={-spread} hip={hip + 0.03} z={backZ} upper={upper} lower={lower} w={w} m={m} footM={footM} foot={foot} />
      <Leg gait={gait} walk={0} gallop={P + 0.45} x={spread} hip={hip + 0.03} z={backZ} upper={upper} lower={lower} w={w} m={m} footM={footM} foot={foot} />
    </>
  );
}

/** A group that sways on the gait: a tail, a neck. */
function Sway({
  gait,
  p,
  base = [0, 0, 0],
  yaw = 0,
  pitch = 0,
  idle = 1.8,
  lift = 0,
  children,
}: {
  gait: React.RefObject<MountGait>;
  p: V3;
  base?: V3;
  yaw?: number;
  pitch?: number;
  idle?: number;
  /** How much a run raises it (a tail streaming out behind). */
  lift?: number;
  children: React.ReactNode;
}) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const gg = gait.current;
    const o = g.current;
    if (!o) return;
    o.rotation.x = base[0] + Math.sin(gg.phase * 2) * pitch * gg.amp + Math.sin(gg.t * idle) * pitch * 0.15 - lift * gg.run;
    o.rotation.y = base[1] + Math.sin(gg.t * idle + gg.phase) * yaw;
    o.rotation.z = base[2];
  });
  return (
    <group ref={g} position={p} rotation={base}>
      {children}
    </group>
  );
}

/** A folded wing that opens and beats when the mount is in the air or flat out. */
function MountWing({ gait, side, p, len, span, m }: { gait: React.RefObject<MountGait>; side: number; p: V3; len: number; span: number; m: THREE.Material }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const gg = gait.current;
    const o = g.current;
    if (!o) return;
    const open = Math.min(1, Math.max(gg.air, Math.max(0, gg.run - 0.55) * 1.6));
    // Folded: laid back along the flank, drooping a little. Open: out level, and beating.
    const fold = -0.45 * (1 - open);
    const beat = open * (0.15 + Math.sin(gg.t * 11) * 0.5);
    o.rotation.z = side * (fold + beat);
    o.rotation.y = side * 1.25 * (1 - open);
  });
  return (
    <group ref={g} position={p}>
      <mesh castShadow material={m} position={[(side * len) / 2, 0, 0]}>
        <boxGeometry args={[len, 0.05, span]} />
      </mesh>
      <mesh castShadow material={m} position={[side * len * 0.85, -0.02, -span * 0.3]}>
        <boxGeometry args={[len * 0.5, 0.04, span * 0.75]} />
      </mesh>
    </group>
  );
}

/** Saddle, cloth in the child's colour, stirrups and a pommel. Every mount wears the same tack. */
function Tack({ mats, seat, z, w }: { mats: Mats; seat: number; z: number; w: number }) {
  return (
    <group position={[0, seat, z]}>
      <Box m={mats.tack} p={[0, -0.1, 0]} s={[w + 0.18, 0.05, 0.8]} />
      <Box m={mats.gold} p={[0, -0.1, -0.41]} s={[w + 0.2, 0.06, 0.03]} />
      <Box m={mats.leather} p={[0, -0.03, 0]} s={[w * 0.72, 0.1, 0.62]} />
      <Box m={mats.leather} p={[0, 0.06, 0.28]} s={[0.2, 0.14, 0.1]} />
      <Box m={mats.leather} p={[0, 0.03, -0.3]} s={[w * 0.6, 0.1, 0.08]} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box m={mats.leather} p={[s * (w / 2 + 0.06), -0.3, 0.02]} s={[0.03, 0.44, 0.05]} />
          <Box m={mats.gold} p={[s * (w / 2 + 0.06), -0.54, 0.02]} s={[0.05, 0.05, 0.16]} />
        </group>
      ))}
    </group>
  );
}

function Eyes({ m, y, z, spread, size = 0.05 }: { m: THREE.Material; y: number; z: number; spread: number; size?: number }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <Box key={s} m={m} p={[s * spread, y, z]} s={[0.03, size, size]} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ bodies */

type BodyProps = { id: string; mats: Mats; gait: React.RefObject<MountGait> };

/** Pony and Donkey. */
function Equine({ id, mats, gait }: BodyProps) {
  const donkey = id === "donkey";
  const legLen = donkey ? 0.84 : 0.95;
  const hip = legLen;
  const r = donkey ? 0.36 : 0.33;
  const bodyY = hip + r * 0.72;
  const len = donkey ? 1.45 : 1.6;
  const seat = mountBuild(id).seat;
  return (
    <>
      <Legs gait={gait} frontZ={len * 0.4} backZ={-len * 0.38} spread={0.2} hip={hip} upper={legLen * 0.52} lower={legLen * 0.48} w={0.15} m={mats.body} footM={mats.hoof} foot="hoof" />
      {/* barrel, chest, rump */}
      <Barrel m={mats.body} p={[0, bodyY, 0]} r0={r} r1={r} len={len} />
      <Box m={mats.body} p={[0, bodyY + 0.02, len * 0.46]} s={[r * 1.7, r * 1.75, 0.36]} />
      <Box m={mats.body} p={[0, bodyY + 0.06, -len * 0.46]} s={[r * 1.85, r * 1.7, 0.42]} />
      {donkey && <Box m={mats.pale} p={[0, bodyY - r * 0.7, 0]} s={[r * 1.3, 0.16, len * 0.7]} />}
      {donkey && <Box m={mats.dark} p={[0, bodyY + r * 0.98, 0]} s={[0.07, 0.03, len * 1.02]} />}
      {donkey && <Box m={mats.dark} p={[0, bodyY + r * 0.6, len * 0.36]} s={[r * 2.05, 0.06, 0.08]} r={[0, 0, 0]} />}
      {/* the neck and head, nodding with the stride */}
      <Sway gait={gait} p={[0, bodyY + 0.18, len * 0.52]} pitch={0.09} yaw={0.03} idle={1.3}>
        <mesh castShadow material={mats.body} position={[0, 0.34, 0.2]} rotation={[0.62, 0, 0]}>
          <cylinderGeometry args={[donkey ? 0.17 : 0.15, 0.25, 0.86, 7]} />
        </mesh>
        <group position={[0, 0.72, 0.5]} rotation={[0.95, 0, 0]}>
          <Box m={mats.body} p={[0, 0, 0.02]} s={[donkey ? 0.3 : 0.27, 0.3, donkey ? 0.66 : 0.6]} />
          <Box m={donkey ? mats.pale : mats.dark} p={[0, -0.02, 0.34]} s={[donkey ? 0.3 : 0.25, 0.26, 0.14]} />
          <Box m={mats.leather} p={[0, 0.02, 0.18]} s={[donkey ? 0.33 : 0.3, 0.05, 0.05]} />
          <Eyes m={mats.eye} y={0.08} z={-0.1} spread={donkey ? 0.155 : 0.14} />
          {[-1, 1].map((s) => (
            <Cone
              key={s}
              m={mats.body}
              p={[s * (donkey ? 0.12 : 0.08), donkey ? 0.14 : 0.2, -0.26 + (donkey ? -0.1 : 0)]}
              radius={donkey ? 0.07 : 0.055}
              h={donkey ? 0.46 : 0.2}
              r={donkey ? [-1.05, 0, s * 0.45] : [-0.9, 0, s * 0.12]}
            />
          ))}
        </group>
        {/* mane: long and falling for the pony, a short brush for the donkey */}
        {[0, 1, 2, 3, 4].map((i) => (
          <Box
            key={i}
            m={mats.dark}
            p={[donkey ? 0 : -0.06, 0.66 - i * 0.14, 0.36 - i * 0.1]}
            s={donkey ? [0.05, 0.12, 0.1] : [0.06, 0.26, 0.13]}
            r={[0.62, 0, donkey ? 0 : 0.28]}
          />
        ))}
      </Sway>
      {/* the tail */}
      <Sway gait={gait} p={[0, bodyY + 0.2, -len * 0.62]} base={[0.35, 0, 0]} yaw={0.22} lift={0.9} idle={2.2}>
        {donkey ? (
          <>
            <Box m={mats.body} p={[0, -0.3, -0.02]} s={[0.05, 0.62, 0.05]} />
            <Box m={mats.dark} p={[0, -0.66, -0.02]} s={[0.1, 0.18, 0.1]} />
          </>
        ) : (
          <>
            <Box m={mats.dark} p={[0, -0.28, -0.04]} s={[0.14, 0.62, 0.12]} />
            <Box m={mats.dark} p={[0, -0.58, -0.08]} s={[0.18, 0.3, 0.14]} />
          </>
        )}
      </Sway>
      <Tack mats={mats} seat={seat} z={0} w={r * 2} />
    </>
  );
}

/** Goat and Stag. */
function Hind({ id, mats, gait }: BodyProps) {
  const stag = id === "stag";
  const legLen = stag ? 1.08 : 0.84;
  const hip = legLen;
  const r = stag ? 0.28 : 0.31;
  const bodyY = hip + r * 0.72;
  const len = stag ? 1.5 : 1.3;
  const seat = mountBuild(id).seat;
  return (
    <>
      <Legs gait={gait} frontZ={len * 0.42} backZ={-len * 0.38} spread={0.17} hip={hip} upper={legLen * 0.5} lower={legLen * 0.5} w={stag ? 0.11 : 0.13} m={mats.body} footM={mats.hoof} foot="cloven" />
      <Barrel m={mats.body} p={[0, bodyY, 0]} r0={r} r1={r * 1.05} len={len} />
      <Box m={mats.body} p={[0, bodyY + 0.04, len * 0.45]} s={[r * 1.75, r * 1.85, 0.3]} />
      <Box m={mats.body} p={[0, bodyY + 0.04, -len * 0.45]} s={[r * 1.8, r * 1.7, 0.34]} />
      {!stag && (
        // The goat's shaggy chest: a fringe hanging under its breast.
        <Box m={mats.pale} p={[0, bodyY - r * 0.85, len * 0.36]} s={[r * 1.4, 0.26, 0.3]} />
      )}
      {stag && <Box m={mats.bone} p={[0, bodyY + 0.05, -len * 0.53]} s={[r * 1.6, r * 1.3, 0.05]} />}
      <Sway gait={gait} p={[0, bodyY + 0.16, len * 0.5]} pitch={0.08} yaw={0.04} idle={1.1}>
        <mesh castShadow material={mats.body} position={[0, stag ? 0.36 : 0.22, 0.12]} rotation={[stag ? 0.35 : 0.5, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.2, stag ? 0.85 : 0.55, 7]} />
        </mesh>
        <group position={[0, stag ? 0.8 : 0.52, stag ? 0.36 : 0.32]} rotation={[0.55, 0, 0]}>
          <Box m={mats.body} p={[0, 0, 0.04]} s={[0.24, 0.25, 0.46]} />
          <Box m={mats.dark} p={[0, -0.02, 0.28]} s={[0.18, 0.18, 0.08]} />
          <Eyes m={mats.eye} y={0.06} z={-0.04} spread={0.125} />
          {[-1, 1].map((s) => (
            // Ears out to the side, as both animals carry them.
            <Box key={s} m={mats.body} p={[s * 0.2, 0.06, -0.12]} s={[0.2, 0.05, 0.09]} r={[0, 0, s * -0.25]} />
          ))}
          {stag ? (
            // Antlers: a beam up and back, and three tines off each.
            [-1, 1].map((s) => (
              <group key={s} position={[s * 0.09, 0.12, -0.12]} rotation={[-0.35, 0, s * -0.35]}>
                <Box m={mats.bone} p={[0, 0.34, 0]} s={[0.045, 0.7, 0.045]} />
                <Box m={mats.bone} p={[s * 0.1, 0.24, 0.07]} s={[0.035, 0.26, 0.035]} r={[0.5, 0, s * -0.7]} />
                <Box m={mats.bone} p={[s * 0.12, 0.48, 0.05]} s={[0.035, 0.28, 0.035]} r={[0.4, 0, s * -0.8]} />
                <Box m={mats.bone} p={[s * -0.06, 0.64, 0]} s={[0.035, 0.24, 0.035]} r={[0, 0, s * 0.7]} />
              </group>
            ))
          ) : (
            <>
              {/* horns sweeping back, and a beard */}
              {[-1, 1].map((s) => (
                <group key={s} position={[s * 0.07, 0.13, -0.08]}>
                  <Cone m={mats.bone} p={[0, 0.1, -0.06]} radius={0.05} h={0.26} r={[-0.8, 0, 0]} />
                  <Cone m={mats.bone} p={[0, 0.16, -0.24]} radius={0.035} h={0.2} r={[-2.1, 0, 0]} />
                </group>
              ))}
              <Box m={mats.pale} p={[0, -0.2, 0.2]} s={[0.08, 0.2, 0.07]} r={[-0.5, 0, 0]} />
            </>
          )}
        </group>
      </Sway>
      <Sway gait={gait} p={[0, bodyY + 0.22, -len * 0.55]} base={[stag ? -0.2 : -0.7, 0, 0]} yaw={0.18} idle={3}>
        <Box m={stag ? mats.bone : mats.dark} p={[0, 0.08, -0.03]} s={[0.1, 0.18, 0.06]} />
      </Sway>
      <Tack mats={mats} seat={seat} z={-0.02} w={r * 2} />
    </>
  );
}

/** The boar. */
function Boar({ mats, gait }: BodyProps) {
  const legLen = 0.62;
  const hip = legLen;
  const r = 0.44;
  const bodyY = hip + r * 0.72;
  const len = 1.5;
  const seat = mountBuild("boar").seat;
  return (
    <>
      <Legs gait={gait} frontZ={len * 0.36} backZ={-len * 0.36} spread={0.26} hip={hip} upper={0.32} lower={0.3} w={0.17} m={mats.body} footM={mats.hoof} foot="cloven" />
      <Barrel m={mats.body} p={[0, bodyY, 0]} r0={r * 0.92} r1={r} len={len} seg={7} />
      {/* the hump over the shoulders, and the bristled ridge down the back */}
      <Box m={mats.body} p={[0, bodyY + r * 0.55, len * 0.25]} s={[r * 1.5, r * 0.8, len * 0.45]} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <Cone key={i} m={mats.dark} p={[0, bodyY + r * 0.98 - (i > 3 ? (i - 3) * 0.06 : 0), len * 0.42 - i * 0.16]} radius={0.06} h={0.2} r={[-0.4, 0, 0]} seg={4} />
      ))}
      <Sway gait={gait} p={[0, bodyY + 0.02, len * 0.5]} pitch={0.07} yaw={0.05} idle={1.6}>
        <group rotation={[0.3, 0, 0]}>
          <Box m={mats.body} p={[0, 0, 0.22]} s={[0.5, 0.48, 0.5]} />
          <Box m={mats.body} p={[0, -0.08, 0.52]} s={[0.36, 0.32, 0.32]} />
          <mesh castShadow material={mats.pale} position={[0, -0.1, 0.7]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.13, 0.15, 0.06, 8]} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s}>
              <Cone m={mats.bone} p={[s * 0.16, -0.08, 0.64]} radius={0.035} h={0.24} r={[-0.5, 0, s * -0.4]} seg={4} />
              <Cone m={mats.body} p={[s * 0.18, 0.26, 0.12]} radius={0.08} h={0.2} r={[-0.3, 0, s * -0.5]} seg={4} />
            </group>
          ))}
          <Eyes m={mats.eye} y={0.08} z={0.4} spread={0.19} size={0.045} />
        </group>
      </Sway>
      <Sway gait={gait} p={[0, bodyY + 0.15, -len * 0.55]} base={[0.4, 0, 0]} yaw={0.4} idle={4}>
        <Box m={mats.body} p={[0, -0.14, -0.02]} s={[0.04, 0.3, 0.04]} />
        <Box m={mats.dark} p={[0, -0.3, -0.02]} s={[0.08, 0.1, 0.08]} />
      </Sway>
      <Tack mats={mats} seat={seat} z={-0.05} w={r * 1.9} />
    </>
  );
}

/** The direwolf. */
function Wolf({ mats, gait }: BodyProps) {
  const legLen = 0.98;
  const hip = legLen;
  const r = 0.3;
  const bodyY = hip + r * 0.72;
  const len = 1.45;
  const seat = mountBuild("direwolf").seat;
  return (
    <>
      <Legs gait={gait} frontZ={len * 0.4} backZ={-len * 0.38} spread={0.19} hip={hip} upper={legLen * 0.5} lower={legLen * 0.5} w={0.14} m={mats.body} footM={mats.dark} foot="paw" />
      <Barrel m={mats.body} p={[0, bodyY, 0]} r0={r * 0.85} r1={r * 1.15} len={len} />
      {/* a deep chest, and the ruff round the neck */}
      <Box m={mats.body} p={[0, bodyY - 0.05, len * 0.42]} s={[r * 1.9, r * 2.3, 0.4]} />
      <Box m={mats.pale} p={[0, bodyY + 0.08, len * 0.56]} s={[r * 2.3, r * 2.1, 0.22]} />
      <Sway gait={gait} p={[0, bodyY + 0.22, len * 0.58]} pitch={0.08} yaw={0.05} idle={1.2}>
        <group position={[0, 0.2, 0.2]} rotation={[0.2, 0, 0]}>
          <Box m={mats.body} p={[0, 0, 0]} s={[0.36, 0.34, 0.38]} />
          <Box m={mats.body} p={[0, -0.07, 0.3]} s={[0.2, 0.18, 0.34]} />
          <Box m={mats.eye} p={[0, -0.02, 0.48]} s={[0.08, 0.07, 0.04]} />
          <Eyes m={mats.glow} y={0.06} z={0.18} spread={0.12} size={0.05} />
          {[-1, 1].map((s) => (
            <Cone key={s} m={mats.body} p={[s * 0.11, 0.27, -0.06]} radius={0.075} h={0.24} r={[-0.15, 0, s * -0.15]} seg={4} />
          ))}
        </group>
      </Sway>
      <Sway gait={gait} p={[0, bodyY + 0.14, -len * 0.55]} base={[0.45, 0, 0]} yaw={0.25} lift={0.6} idle={1.7}>
        <Box m={mats.body} p={[0, -0.3, -0.02]} s={[0.22, 0.6, 0.24]} />
        <Box m={mats.body} p={[0, -0.12, -0.02]} s={[0.16, 0.26, 0.18]} />
        <Box m={mats.pale} p={[0, -0.66, -0.02]} s={[0.17, 0.2, 0.19]} />
      </Sway>
      <Tack mats={mats} seat={seat} z={-0.05} w={r * 2.1} />
    </>
  );
}

/** The gryphon: eagle in front, lion behind. */
function Gryphon({ mats, gait }: BodyProps) {
  const legLen = 0.92;
  const hip = legLen;
  const r = 0.31;
  const bodyY = hip + r * 0.72;
  const len = 1.55;
  const seat = mountBuild("gryphon").seat;
  return (
    <>
      <Legs
        gait={gait}
        frontZ={len * 0.4}
        backZ={-len * 0.38}
        spread={0.19}
        hip={hip}
        upper={legLen * 0.5}
        lower={legLen * 0.5}
        w={0.14}
        m={mats.body}
        footM={mats.dark}
        foot="paw"
        frontM={mats.pale}
        frontFoot="talon"
        frontFootM={mats.beak}
      />
      <Barrel m={mats.body} p={[0, bodyY, 0]} r0={r} r1={r * 1.08} len={len} />
      {/* feathered breast over the front half */}
      <Box m={mats.pale} p={[0, bodyY + 0.02, len * 0.34]} s={[r * 2.25, r * 2.15, len * 0.4]} />
      <MountWing gait={gait} side={-1} p={[-r * 0.8, bodyY + 0.28, 0.2]} len={1.05} span={0.7} m={mats.wing} />
      <MountWing gait={gait} side={1} p={[r * 0.8, bodyY + 0.28, 0.2]} len={1.05} span={0.7} m={mats.wing} />
      <Sway gait={gait} p={[0, bodyY + 0.24, len * 0.55]} pitch={0.08} yaw={0.06} idle={1.4}>
        <mesh castShadow material={mats.pale} position={[0, 0.24, 0.08]} rotation={[0.3, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.24, 0.56, 7]} />
        </mesh>
        <group position={[0, 0.58, 0.2]}>
          <Box m={mats.pale} p={[0, 0, 0]} s={[0.32, 0.32, 0.36]} />
          <Cone m={mats.beak} p={[0, -0.02, 0.28]} radius={0.1} h={0.28} r={[Math.PI / 2 + 0.35, 0, 0]} seg={4} />
          <Eyes m={mats.eye} y={0.05} z={0.1} spread={0.165} />
          {[0, 1, 2].map((i) => (
            <Box key={i} m={mats.body} p={[0, 0.2 - i * 0.02, -0.12 - i * 0.1]} s={[0.12, 0.08, 0.14]} r={[0.5, 0, 0]} />
          ))}
        </group>
      </Sway>
      <Sway gait={gait} p={[0, bodyY + 0.12, -len * 0.55]} base={[0.9, 0, 0]} yaw={0.3} lift={0.7} idle={2}>
        <Box m={mats.body} p={[0, -0.34, -0.02]} s={[0.06, 0.66, 0.06]} />
        <Box m={mats.dark} p={[0, -0.7, -0.02]} s={[0.14, 0.16, 0.14]} />
      </Sway>
      <Tack mats={mats} seat={seat} z={-0.08} w={r * 2.1} />
    </>
  );
}

/** One link of a tail that swings in a travelling wave. */
function TailLink({ gait, i, children }: { gait: React.RefObject<MountGait>; i: number; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const gg = gait.current;
    if (g.current) g.current.rotation.y = Math.sin(gg.t * 2.4 + gg.phase * 0.5 - i * 0.9) * (0.16 + gg.amp * 0.12);
  });
  return <group ref={g}>{children}</group>;
}

/** The wyrm. */
function Wyrm({ mats, gait }: BodyProps) {
  const legLen = 0.66;
  const hip = legLen;
  const r = 0.36;
  const bodyY = hip + r * 0.7;
  const len = 1.8;
  const seat = mountBuild("wyrm").seat;
  const tail = [0.3, 0.24, 0.18, 0.12];
  return (
    <>
      <Legs gait={gait} frontZ={len * 0.34} backZ={-len * 0.34} spread={0.3} hip={hip} upper={0.36} lower={0.32} w={0.17} m={mats.body} footM={mats.bone} foot="claw" />
      <Barrel m={mats.body} p={[0, bodyY, 0]} r0={r} r1={r * 0.95} len={len} />
      <Box m={mats.pale} p={[0, bodyY - r * 0.72, 0]} s={[r * 1.3, 0.12, len * 0.92]} />
      {/* spines down the back, skipping the saddle */}
      {[0.78, 0.62, -0.5, -0.66, -0.82].map((z, i) => (
        <Cone key={i} m={mats.dark} p={[0, bodyY + r * 0.95, z]} radius={0.07} h={0.22} r={[-0.3, 0, 0]} seg={4} />
      ))}
      <MountWing gait={gait} side={-1} p={[-r * 0.8, bodyY + 0.3, 0.05]} len={0.85} span={0.62} m={mats.wing} />
      <MountWing gait={gait} side={1} p={[r * 0.8, bodyY + 0.3, 0.05]} len={0.85} span={0.62} m={mats.wing} />
      {/* the long neck in three links, up to a horned head */}
      <Sway gait={gait} p={[0, bodyY + 0.1, len * 0.5]} pitch={0.07} yaw={0.08} idle={1}>
        <mesh castShadow material={mats.body} position={[0, 0.2, 0.2]} rotation={[0.8, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.28, 0.6, 7]} />
        </mesh>
        <mesh castShadow material={mats.body} position={[0, 0.58, 0.42]} rotation={[0.35, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.2, 0.5, 7]} />
        </mesh>
        <Cone m={mats.dark} p={[0, 0.66, 0.28]} radius={0.06} h={0.18} r={[-0.5, 0, 0]} seg={4} />
        <group position={[0, 0.9, 0.58]} rotation={[0.2, 0, 0]}>
          <Box m={mats.body} p={[0, 0, 0.05]} s={[0.34, 0.26, 0.42]} />
          <Box m={mats.body} p={[0, -0.05, 0.36]} s={[0.26, 0.17, 0.32]} />
          <Box m={mats.pale} p={[0, -0.14, 0.3]} s={[0.22, 0.06, 0.4]} />
          <Eyes m={mats.glow} y={0.07} z={0.14} spread={0.175} size={0.055} />
          {[-1, 1].map((s) => (
            <Cone key={s} m={mats.bone} p={[s * 0.12, 0.18, -0.2]} radius={0.05} h={0.36} r={[-1.1, 0, s * -0.2]} seg={5} />
          ))}
        </group>
      </Sway>
      {/* the tail: four links that wave, tapering to a spade */}
      <group position={[0, bodyY, -len * 0.5]}>
        <TailLink gait={gait} i={0}>
          <Barrel m={mats.body} p={[0, -0.04, -0.28]} r0={tail[0]} r1={tail[1]} len={0.6} rx={-0.15} seg={6} />
          <group position={[0, -0.12, -0.56]}>
            <TailLink gait={gait} i={1}>
              <Barrel m={mats.body} p={[0, -0.02, -0.26]} r0={tail[1]} r1={tail[2]} len={0.56} rx={-0.08} seg={6} />
              <Cone m={mats.dark} p={[0, tail[1], -0.2]} radius={0.05} h={0.16} r={[-0.3, 0, 0]} seg={4} />
              <group position={[0, -0.04, -0.52]}>
                <TailLink gait={gait} i={2}>
                  <Barrel m={mats.body} p={[0, 0, -0.24]} r0={tail[2]} r1={tail[3]} len={0.5} seg={6} />
                  <group position={[0, 0, -0.48]}>
                    <TailLink gait={gait} i={3}>
                      <Barrel m={mats.body} p={[0, 0, -0.2]} r0={tail[3]} r1={0.05} len={0.42} seg={5} />
                      <Box m={mats.dark} p={[0, 0, -0.46]} s={[0.26, 0.04, 0.2]} r={[0, Math.PI / 4, 0]} />
                    </TailLink>
                  </group>
                </TailLink>
              </group>
            </TailLink>
          </group>
        </TailLink>
      </group>
      <Tack mats={mats} seat={seat} z={-0.12} w={r * 2} />
    </>
  );
}

/* ------------------------------------------------------------------ the figure */

/**
 * One mount, standing on `y = 0`, facing `+z`. The caller drives `gait`; this only draws it. The
 * body group bobs and rocks over the stride on its own.
 */
export function MountFigure({ id, color, tack, gait }: { id: string; color: string; tack: string; gait: React.RefObject<MountGait> }) {
  const mats = useMats(color, tack);
  const body = useRef<THREE.Group>(null);
  const build = mountBuild(id);
  useFrame(() => {
    const g = gait.current;
    const b = body.current;
    if (!b) return;
    // A gallop rocks fore and aft; a walk rises a little over each step. Idle, it breathes.
    b.position.y = Math.abs(Math.sin(g.phase)) * 0.07 * g.amp + Math.sin(g.t * 1.6) * 0.008;
    b.rotation.x = Math.sin(g.phase) * 0.07 * g.run * g.amp - g.air * 0.12;
  });
  const props = { id, mats, gait };
  // Drawn bigger than modelled (`MOUNT_SCALE`, which the collision body and the saddle match).
  return (
    <group scale={MOUNT_SCALE}>
      <group ref={body}>
        {build.body === "equine" && <Equine {...props} />}
        {build.body === "hind" && <Hind {...props} />}
        {build.body === "boar" && <Boar {...props} />}
        {build.body === "wolf" && <Wolf {...props} />}
        {build.body === "gryphon" && <Gryphon {...props} />}
        {build.body === "wyrm" && <Wyrm {...props} />}
      </group>
    </group>
  );
}
