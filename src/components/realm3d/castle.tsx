"use client";

/**
 * THE CASTLE, and what stands in its place before the child has earned it.
 *
 * `Castle` draws `castlePlan` (lib/realm3d/castle-plan.ts) as one merged, vertex-coloured mesh
 * plus its lit windows; the same plan gives the scene its colliders, so the walls the child
 * bumps into are the walls they see.
 *
 * `CastleGrounds` is the honest answer to "no castle yet": the same footprint, levelled and
 * pegged out with stakes and rope, the line of the curtain scratched into the ground, a stack of
 * dressed stone by where the gate will be and a surveyor's flag in the middle. It says a castle
 * is coming here, rather than leaving a hole at the end of the village road.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { castlePlan, GATE_FRONT, ROAD_END, type CastleColor } from "@/lib/realm3d/castle-plan";
import { litMaterial, merge, paint, vivid } from "./geo-kit";

const COLOR: Record<CastleColor, string> = {
  stone: "#d6ccb2",
  stoneLight: "#efe6cf",
  stoneDark: "#948a76",
  roof: "#a3344f",
  wood: "#5a3a22",
  slate: "#3a3530",
  gold: "#d9b24a",
  window: "#ffe9a8",
};

export function Castle({ tier, x, y, z, banners }: { tier: string; x: number; y: number; z: number; banners: readonly string[] }) {
  const plan = useMemo(() => castlePlan(tier), [tier]);
  const { geo, windows } = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const lit: THREE.BufferGeometry[] = [];
    for (const p of plan.parts) {
      let g: THREE.BufferGeometry;
      if (p.shape === "box") g = new THREE.BoxGeometry(p.sx, p.sy, p.sz);
      else if (p.shape === "cyl") g = new THREE.CylinderGeometry(p.sx, p.sx * 1.04, p.sy, 14);
      else if (p.shape === "cone") g = new THREE.ConeGeometry(p.sx, p.sy, 12);
      else g = new THREE.ConeGeometry(p.sx, p.sy, 4).rotateY(Math.PI / 4);
      g.translate(p.x, p.y, p.z);
      (p.color === "window" ? lit : parts).push(paint(g, COLOR[p.color]));
    }
    const merged = merge(parts);
    const glow = merge(lit);
    for (const g of [...parts, ...lit]) g.dispose();
    return { geo: merged, windows: glow };
  }, [plan]);
  const mat = useMemo(() => litMaterial(), []);
  const glass = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, emissive: "#e8bd4a", emissiveIntensity: 0.6, flatShading: true }),
    [],
  );
  useEffect(
    () => () => {
      geo.dispose();
      windows.dispose();
    },
    [geo, windows],
  );
  useEffect(
    () => () => {
      mat.dispose();
      glass.dispose();
    },
    [mat, glass],
  );

  return (
    <group position={[x, y, z]}>
      <mesh geometry={geo} material={mat} castShadow receiveShadow />
      <mesh geometry={windows} material={glass} />
      {banners.map((color, i) => {
        const s = plan.bannerSpots[i];
        return s ? <WallBanner key={i} color={color} x={s.x} y={s.y} z={s.z} ry={s.ry} /> : null;
      })}
    </group>
  );
}

/** A season's banner, hung down the outside of the curtain from a gilded pole. */
function WallBanner({ color, x, y, z, ry }: { color: string; x: number; y: number; z: number; ry: number }) {
  const cloth = useMemo(() => vivid(color, 0.7, 0.4, 0.6), [color]);
  return (
    <group position={[x, y, z]} rotation={[0, ry, 0]}>
      <mesh position={[0, 1.4, 0.12]}>
        <cylinderGeometry args={[0.07, 0.07, 1.7, 6]} />
        <meshStandardMaterial color="#d9b24a" metalness={0.5} roughness={0.4} flatShading />
      </mesh>
      <mesh castShadow position={[0, 0, 0.12]}>
        <boxGeometry args={[1.35, 2.8, 0.05]} />
        <meshStandardMaterial color={cloth} flatShading side={THREE.DoubleSide} />
      </mesh>
      {/* A swallowtail: two small wedges at the foot. */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.34, -1.62, 0.12]} rotation={[0, 0, s * 0.35]}>
          <boxGeometry args={[0.55, 0.55, 0.05]} />
          <meshStandardMaterial color={cloth} flatShading side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The castle grounds, waiting. The full plan's footprint, so the day the castle comes it stands
 * exactly where the pegs said it would.
 */
export function CastleGrounds({ tier, x, y, z }: { tier: string; x: number; y: number; z: number }) {
  const plan = useMemo(() => castlePlan(tier), [tier]);
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, px: number, py: number, pz: number, hex: string) => {
      g.translate(px, py, pz);
      parts.push(paint(g, hex));
    };
    // The curtain's line, from the plan's own wall boxes: a strip of turned earth where each
    // wall will stand, and a stake with rope at every corner and every few strides along it.
    const walls = plan.parts.filter((p) => p.shape === "box" && p.color === "stone" && p.sy > 4);
    for (const w of walls) {
      add(new THREE.BoxGeometry(w.sx, 0.16, w.sz), w.x, 0.08, w.z, "#8a7453");
      const alongX = w.sx > w.sz;
      const len = alongX ? w.sx : w.sz;
      const n = Math.max(2, Math.round(len / 3));
      for (let i = 0; i <= n; i++) {
        const t = -len / 2 + (len * i) / n;
        add(new THREE.BoxGeometry(0.12, 1.0, 0.12), alongX ? w.x + t : w.x, 0.5, alongX ? w.z : w.z + t, "#7c5c38");
      }
      add(new THREE.BoxGeometry(alongX ? len : 0.06, 0.06, alongX ? 0.06 : len), w.x, 0.82, w.z, "#f4ecd2");
    }
    // Where the towers will be: a ring of short stakes each.
    for (const p of plan.parts.filter((q) => q.shape === "cyl" && q.color === "stoneLight")) {
      for (let a = 0; a < 6; a++) {
        const th = (a / 6) * Math.PI * 2;
        add(new THREE.BoxGeometry(0.1, 0.7, 0.1), p.x + Math.cos(th) * p.sx, 0.35, p.z + Math.sin(th) * p.sx, "#7c5c38");
      }
    }
    // Dressed stone, stacked neat by where the gate will stand, waiting for the masons.
    const bs = 0.6;
    const rows = [4, 3, 2];
    let yy = 0;
    for (let r = 0; r < rows.length; r++) {
      for (let i = 0; i < rows[r]; i++) add(new THREE.BoxGeometry(bs, bs, bs), 4.4 + (i - (rows[r] - 1) / 2) * (bs + 0.05), yy + bs / 2, GATE_FRONT - 1.4, "#c9bfa6");
      yy += bs;
    }
    // A flagstone at the end of the road, so it arrives somewhere.
    add(new THREE.BoxGeometry(4.2, 0.12, ROAD_END - GATE_FRONT), 0, 0.06, (GATE_FRONT + ROAD_END) / 2, "#948a76");
    // The surveyor's pole in the middle of the grounds.
    const kz = plan.parts.find((p) => p.shape === "pyramid")?.z ?? -15;
    add(new THREE.CylinderGeometry(0.09, 0.11, 6.5, 6), 0, 3.25, kz, "#7c5c38");
    const merged = merge(parts);
    for (const g of parts) g.dispose();
    return { merged, flagZ: kz };
  }, [plan]);
  const mat = useMemo(() => litMaterial(), []);
  useEffect(() => () => geo.merged.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <group position={[x, y, z]}>
      <mesh geometry={geo.merged} material={mat} castShadow receiveShadow />
      {/* The pennant: the one thing here that says someone means to build. */}
      <mesh castShadow position={[0.75, 5.9, geo.flagZ]}>
        <boxGeometry args={[1.4, 0.8, 0.04]} />
        <meshStandardMaterial color="#a3344f" flatShading side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
