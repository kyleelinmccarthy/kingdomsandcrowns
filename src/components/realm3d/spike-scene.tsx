"use client";

/**
 * SPIKE — throwaway. Not the Realm. The Realm is `realm-scene.tsx` and is untouched.
 *
 * One question: does this village look like a game a child wants to play if it is built out of
 * real geometry under a real light, instead of pixel-art billboards on a flat plane?
 *
 * Same data — `buildWorldLayout()` gives every building slot, villager, path tile and tree,
 * read-only. Nothing here writes back, and nothing in the shipped Realm imports this file.
 *
 * Rough on purpose: no HUD, no collision, no calm mode, no accessibility, no tests. Only the look.
 */

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { buildWorldLayout, type Prop, type VillagerPlacement } from "@/lib/realm/layout";
import { groundNoise, heightAt, PATCH_HALF, WALK_HALF } from "@/lib/realm3d/heightfield";

/* ------------------------------------------------------------------ palette */

const SKY_TOP = "#2c6fb8";
const SKY_LOW = "#d8e9ec";
const FOG = "#bcdcec";
const SUN_COLOR = "#fff3d2";
const HERO_SPEED = 11;

/** The village colours are muted for a pixel sprite. Under a light they want saturating. */
function vivid(hex: string, satFloor = 0.5, lo = 0.34, hi = 0.58): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.max(hsl.s, satFloor), Math.min(hi, Math.max(lo, hsl.l)));
  return c;
}

/* ------------------------------------------------------- geometry plumbing */

/** Bake a flat colour into a geometry so many parts can share one vertex-coloured material. */
function paint(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

function at(geo: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  geo.translate(x, y, z);
  return geo;
}

/** A gable roof: a triangle extruded along z. A box plus one of these reads as a house. */
function gableGeo(w: number, d: number, h: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

const litMaterial = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });

/* ------------------------------------------------------------------ terrain */

function buildTerrainGeometry(): THREE.BufferGeometry {
  const SEG = 86;
  const plane = new THREE.PlaneGeometry(PATCH_HALF * 2, PATCH_HALF * 2, SEG, SEG);
  plane.rotateX(-Math.PI / 2);
  const p0 = plane.attributes.position;
  for (let i = 0; i < p0.count; i++) p0.setY(i, heightAt(p0.getX(i), p0.getZ(i)));
  const geo = plane.toNonIndexed();
  plane.dispose();
  geo.computeVertexNormals();

  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);

  const low = new THREE.Color("#3f6d18");
  const high = new THREE.Color("#7fae36");
  const rock = new THREE.Color("#9a9384");
  const kept = new THREE.Color("#63962a"); // the village's own mown ground
  const c = new THREE.Color();

  for (let f = 0; f < pos.count; f += 3) {
    const y = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const x = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3;
    const z = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
    const ny = (nrm.getY(f) + nrm.getY(f + 1) + nrm.getY(f + 2)) / 3;

    c.copy(low).lerp(high, THREE.MathUtils.smoothstep(y, -5, 15));
    const r = Math.hypot(x, z);
    c.lerp(kept, 1 - THREE.MathUtils.smoothstep(r, 20, 40));
    const steep = 1 - Math.min(1, Math.max(0, ny));
    c.lerp(rock, THREE.MathUtils.smoothstep(steep, 0.3, 0.62));
    // Big soft blotches, not per-facet confetti. A wobble hashed per triangle over a regular
    // grid reads as a chequerboard, which is what the first two passes drew across the
    // village; what the reference actually has is low-frequency patches of darker grass.
    const blot = groundNoise(x * 0.055, z * 0.055) * 0.72 + groundNoise(x * 0.16 + 11, z * 0.16 - 4) * 0.28;
    const j = 0.72 + blot * 0.52;
    // A whisper of per-facet break-up on top, to keep the facets legible without stripes.
    const h1 = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    for (let k = 0; k < 3; k++) {
      const w = j * (0.975 + h1 * 0.05);
      colors[(f + k) * 3] = c.r * w;
      colors[(f + k) * 3 + 1] = c.g * w;
      colors[(f + k) * 3 + 2] = c.b * w;
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function Terrain() {
  const geo = useMemo(() => buildTerrainGeometry(), []);
  const mat = useMemo(() => litMaterial(), []);
  return <mesh geometry={geo} material={mat} receiveShadow castShadow />;
}

/* ------------------------------------------------------------------ scenery */

/** One merged, vertex-coloured mesh per scenery kind, authored at nominal scale 1. */
const SCENERY_GEO: Record<string, () => THREE.BufferGeometry> = {
  oak: () =>
    mergeGeometries([
      paint(at(new THREE.CylinderGeometry(0.15, 0.24, 1.3, 6), 0, 0.65, 0), "#5b3f28"),
      paint(at(new THREE.IcosahedronGeometry(1.0, 0).scale(1, 0.85, 1), 0, 1.95, 0), "#3f8f2c"),
      paint(at(new THREE.IcosahedronGeometry(0.62, 0), 0.62, 2.4, 0.3), "#57ab3a"),
      paint(at(new THREE.IcosahedronGeometry(0.55, 0), -0.6, 1.65, -0.35), "#357a26"),
    ]),
  pine: () =>
    mergeGeometries([
      paint(at(new THREE.CylinderGeometry(0.12, 0.2, 1.0, 6), 0, 0.5, 0), "#4b3320"),
      paint(at(new THREE.ConeGeometry(1.0, 1.6, 7), 0, 1.35, 0), "#2c6b34"),
      paint(at(new THREE.ConeGeometry(0.76, 1.4, 7), 0, 2.25, 0), "#347c3c"),
      paint(at(new THREE.ConeGeometry(0.5, 1.2, 7), 0, 3.1, 0), "#3d8d45"),
    ]),
  bush: () =>
    mergeGeometries([
      paint(at(new THREE.IcosahedronGeometry(0.62, 0).scale(1.1, 0.8, 1.1), 0, 0.45, 0), "#457f28"),
      paint(at(new THREE.IcosahedronGeometry(0.42, 0), 0.42, 0.62, 0.2), "#569a31"),
    ]),
  rock: () =>
    paint(at(new THREE.IcosahedronGeometry(0.62, 0).scale(1.25, 0.8, 1.05), 0, 0.36, 0), "#918d84"),
  menhir: () =>
    mergeGeometries([
      paint(at(new THREE.CylinderGeometry(0.24, 0.4, 2.6, 6).rotateZ(0.05), 0, 1.3, 0), "#8b877d"),
      paint(at(new THREE.IcosahedronGeometry(0.4, 0).scale(1.1, 0.5, 1), 0, 0.2, 0), "#7c786f"),
    ]),
  fence: () =>
    mergeGeometries([
      paint(at(new THREE.BoxGeometry(0.13, 1.0, 0.13), -0.6, 0.5, 0), "#7c5c38"),
      paint(at(new THREE.BoxGeometry(0.13, 1.0, 0.13), 0.6, 0.5, 0), "#7c5c38"),
      paint(at(new THREE.BoxGeometry(1.35, 0.11, 0.08), 0, 0.78, 0), "#8b6a42"),
      paint(at(new THREE.BoxGeometry(1.35, 0.11, 0.08), 0, 0.45, 0), "#8b6a42"),
    ]),
  lantern: () =>
    mergeGeometries([
      paint(at(new THREE.CylinderGeometry(0.07, 0.1, 1.7, 5), 0, 0.85, 0), "#584431"),
      paint(at(new THREE.IcosahedronGeometry(0.24, 0), 0, 1.82, 0), "#ffd98a"),
    ]),
  signpost: () =>
    mergeGeometries([
      paint(at(new THREE.CylinderGeometry(0.06, 0.08, 1.3, 6), 0, 0.65, 0), "#7c5c38"),
      paint(at(new THREE.IcosahedronGeometry(0.11, 0), 0, 1.33, 0), "#8b6a42"),
      paint(at(new THREE.BoxGeometry(0.72, 0.2, 0.05), 0.4, 1.16, 0), "#d9b877"),
      paint(at(new THREE.BoxGeometry(0.72, 0.2, 0.05).rotateY(Math.PI / 2), 0, 0.86, -0.4), "#d9b877"),
    ]),
  cart: () =>
    mergeGeometries([
      paint(at(new THREE.BoxGeometry(1.5, 0.55, 0.95), 0, 0.72, 0), "#8b6a42"),
      paint(at(new THREE.BoxGeometry(1.3, 0.3, 0.75), 0, 1.06, 0), "#c2452c"),
      paint(at(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 9).rotateX(Math.PI / 2), -0.42, 0.42, 0.52), "#5b3f28"),
      paint(at(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 9).rotateX(Math.PI / 2), -0.42, 0.42, -0.52), "#5b3f28"),
    ]),
  scarecrow: () =>
    mergeGeometries([
      paint(at(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 5), 0, 0.95, 0), "#7c5c38"),
      paint(at(new THREE.BoxGeometry(1.5, 0.12, 0.12), 0, 1.5, 0), "#7c5c38"),
      paint(at(new THREE.BoxGeometry(0.55, 0.7, 0.4), 0, 1.35, 0), "#b6863f"),
      paint(at(new THREE.IcosahedronGeometry(0.28, 0), 0, 1.95, 0), "#d9b45c"),
    ]),
};

function sceneryGeometryFor(kind: string): THREE.BufferGeometry {
  const make = SCENERY_GEO[kind] ?? SCENERY_GEO.rock;
  return make();
}

/** Everything in the patch, one instanced draw per kind. The forest is ~1200 of these. */
function Scenery({ scenery }: { scenery: readonly Prop[] }) {
  const mat = useMemo(() => litMaterial(), []);
  const groups = useMemo(() => {
    const by = new Map<string, Prop[]>();
    for (const p of scenery) {
      if (Math.abs(p.position.x) > PATCH_HALF - 3 || Math.abs(p.position.z) > PATCH_HALF - 3) continue;
      if (p.variant === "boat") continue; // the spike has no water for it to sit beside
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
      const scale = p.size.h / 1.4; // DECOR_SIZE.h — the layout's nominal decoration
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

function House({ prop }: { prop: Prop }) {
  const { w, d, h } = prop.size;
  const wallH = h * 0.66;
  const roofH = Math.max(1.0, h * 0.62);
  const roof = useMemo(() => gableGeo(w * 1.18, d * 1.18, roofH), [w, d, roofH]);
  const roofColor = useMemo(() => vivid(prop.color, 0.55, 0.3, 0.5), [prop.color]);
  return (
    <group position={[prop.position.x, groundY(prop), prop.position.z]}>
      <Plinth w={w * 1.06} d={d * 1.06} />
      <mesh castShadow receiveShadow position={[0, wallH / 2, 0]}>
        <boxGeometry args={[w, wallH, d]} />
        <Plaster />
      </mesh>
      <mesh castShadow receiveShadow position={[0, wallH, 0]} geometry={roof}>
        <meshStandardMaterial color={roofColor} flatShading roughness={0.85} />
      </mesh>
      {/* a door and two windows: the cheapest thing that makes a box read as somewhere a person lives */}
      <mesh position={[0, wallH * 0.36, d / 2 + 0.02]}>
        <boxGeometry args={[w * 0.26, wallH * 0.62, 0.06]} />
        <meshStandardMaterial color="#5b3a22" flatShading />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * w) / 3.1, wallH * 0.66, d / 2 + 0.02]}>
          <boxGeometry args={[w * 0.18, wallH * 0.24, 0.06]} />
          <meshStandardMaterial color="#ffe9a8" emissive="#e8bd4a" emissiveIntensity={0.5} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Well({ prop }: { prop: Prop }) {
  const roof = useMemo(() => gableGeo(2.6, 2.6, 0.9), []);
  return (
    <group position={[prop.position.x, groundY(prop), prop.position.z]}>
      <Plinth w={2.6} d={2.6} />
      <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
        <cylinderGeometry args={[1.05, 1.15, 0.8, 12]} />
        <meshStandardMaterial color="#9c968a" flatShading />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.85, 0.85, 0.08, 12]} />
        <meshStandardMaterial color="#2f6f9e" flatShading roughness={0.25} metalness={0.2} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * 0.85, 1.3, 0]}>
          <boxGeometry args={[0.16, 1.9, 0.16]} />
          <meshStandardMaterial color="#7c5c38" flatShading />
        </mesh>
      ))}
      <mesh castShadow position={[0, 2.2, 0]} geometry={roof}>
        <meshStandardMaterial color={vivid(prop.color, 0.6, 0.35, 0.5)} flatShading />
      </mesh>
    </group>
  );
}

function Watchtower({ prop }: { prop: Prop }) {
  const { w, d, h } = prop.size;
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
      <mesh position={[0, h * 0.62, d / 2 + 0.02]}>
        <boxGeometry args={[0.5, 0.7, 0.06]} />
        <meshStandardMaterial color="#ffe9a8" emissive="#e8bd4a" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

function Chapel({ prop }: { prop: Prop }) {
  return (
    <group>
      <House prop={prop} />
      <group position={[prop.position.x, groundY(prop), prop.position.z - prop.size.d / 2 - 0.4]}>
        <Plinth w={1.3} d={1.3} />
        <mesh castShadow receiveShadow position={[0, 1.8, 0]}>
          <boxGeometry args={[1.2, 3.6, 1.2]} />
          <Plaster />
        </mesh>
        <mesh castShadow position={[0, 4.4, 0]}>
          <coneGeometry args={[1.0, 1.9, 4]} />
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
          <mesh receiveShadow castShadow position={[0, 0.18, z]}>
            <boxGeometry args={[prop.size.w * 0.92, 0.36, prop.size.d * 0.22]} />
            <meshStandardMaterial color="#6b4a30" flatShading />
          </mesh>
          {[-1, 0, 1].map((k) => (
            <mesh key={k} castShadow position={[(k * prop.size.w) / 3.6, 0.6, z]}>
              <icosahedronGeometry args={[0.32, 0]} />
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
      {posts.map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 1.25, z]}>
          <boxGeometry args={[0.22, 2.2, 0.22]} />
          <meshStandardMaterial color="#8a6a42" flatShading />
        </mesh>
      ))}
      {/* a ridge beam across the top: the outline of the house that is coming */}
      <mesh castShadow position={[0, 2.35, 0]}>
        <boxGeometry args={[0.18, 0.18, d * 0.95]} />
        <meshStandardMaterial color="#a07d4c" flatShading />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[(s * w) / 2.6, 1.85, 0]} rotation={[0, 0, s * 0.5]}>
          <boxGeometry args={[0.16, w * 0.8, 0.16]} />
          <meshStandardMaterial color="#a07d4c" flatShading />
        </mesh>
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={i} castShadow position={[0, 0.42 + i * 0.22, d / 2 - 0.75]} rotation={[0, 0.07 * i, 0]}>
          <boxGeometry args={[w * 0.7, 0.2, 0.2]} />
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
      m.makeScale(t.size.w * 1.6, 0.16, t.size.d * 1.02);
      m.setPosition(t.position.x, heightAt(t.position.x, t.position.z) + 0.06, t.position.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [tiles]);
  return <instancedMesh ref={ref} args={[geo, mat, tiles.length]} receiveShadow frustumCulled={false} />;
}

function Village({ props, villagers }: { props: Prop[]; villagers: VillagerPlacement[] }) {
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

type Keys = { f: boolean; b: boolean; l: boolean; r: boolean; yawL: boolean; yawR: boolean };

function Hero({ heroRef, keys, yawRef }: { heroRef: React.RefObject<THREE.Vector3>; keys: React.RefObject<Keys>; yawRef: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const facing = useRef(0);
  const bob = useRef(0);

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
    const p = heroRef.current;
    if (len > 0.001) {
      dx /= len;
      dz /= len;
      p.x = THREE.MathUtils.clamp(p.x + dx * HERO_SPEED * dt, -WALK_HALF, WALK_HALF);
      p.z = THREE.MathUtils.clamp(p.z + dz * HERO_SPEED * dt, -WALK_HALF, WALK_HALF);
      facing.current = Math.atan2(dx, dz);
      bob.current += dt * 11;
    } else {
      bob.current += dt * 2;
    }
    p.y = heightAt(p.x, p.z);

    const g = group.current;
    if (!g) return;
    g.position.set(p.x, p.y + (len > 0.001 ? Math.abs(Math.sin(bob.current)) * 0.13 : 0), p.z);
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, facing.current, 9, dt);
    g.rotation.z = len > 0.001 ? Math.sin(bob.current) * 0.05 : 0;
  });

  return (
    <group ref={group}>
      {/* legs */}
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * 0.16, 0.3, 0]}>
          <boxGeometry args={[0.22, 0.6, 0.24]} />
          <meshStandardMaterial color="#3b3226" flatShading />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.02, 0]}>
        <cylinderGeometry args={[0.3, 0.42, 0.9, 8]} />
        <meshStandardMaterial color="#3f6fc4" flatShading />
      </mesh>
      {/* cloak: a half-cone hung off the back, so the hero has a silhouette from behind */}
      <mesh castShadow position={[0, 1.0, -0.18]}>
        <coneGeometry args={[0.56, 1.5, 8, 1, false, Math.PI * 0.55, Math.PI * 0.9]} />
        <meshStandardMaterial color="#6a3fa8" flatShading side={THREE.DoubleSide} />
      </mesh>
      <mesh castShadow position={[0, 1.62, 0]}>
        <icosahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color="#efc79c" flatShading />
      </mesh>
      {/* the pointed hat — it is what makes a stack of solids read as a person from behind */}
      <mesh castShadow position={[0, 2.15, 0]}>
        <coneGeometry args={[0.42, 0.95, 8]} />
        <meshStandardMaterial color="#6a3fa8" flatShading />
      </mesh>
      <mesh castShadow position={[0, 1.78, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 0.07, 10]} />
        <meshStandardMaterial color="#5a3596" flatShading />
      </mesh>
      {/* staff */}
      <mesh castShadow position={[0.48, 1.05, 0.12]} rotation={[0.12, 0, -0.1]}>
        <cylinderGeometry args={[0.055, 0.07, 2.4, 6]} />
        <meshStandardMaterial color="#8a6a42" flatShading />
      </mesh>
      <mesh position={[0.6, 2.28, 0.14]}>
        <icosahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial color="#9fe8ff" emissive="#4fd2ff" emissiveIntensity={3} toneMapped={false} />
      </mesh>
      <pointLight position={[0.6, 2.28, 0.14]} color="#69d8ff" intensity={6} distance={7} />
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

function Rig({ heroRef, yawRef }: { heroRef: React.RefObject<THREE.Vector3>; yawRef: React.RefObject<number> }) {
  const { camera } = useThree();
  const desired = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const off = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const p = heroRef.current;
    off.set(0, 19.5, 21).applyAxisAngle(up, yawRef.current);
    const dx = p.x + off.x;
    const dz = p.z + off.z;
    // Never let the camera sink into a hill.
    desired.set(dx, Math.max(p.y + off.y, heightAt(dx, dz) + 3.5), dz);
    camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
    look.set(p.x, p.y + 3.4, p.z);
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
        .filter((p) => p.variant === "lantern" && Math.abs(p.position.x) < PATCH_HALF && Math.abs(p.position.z) < PATCH_HALF)
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
      <sphereGeometry args={[300, 24, 16]} />
    </mesh>
  );
}

/* --------------------------------------------------------------------- app */

function World() {
  const layout = useMemo(
    () =>
      buildWorldLayout({
        castleType: "castle",
        // A half-built village: four raised, four still foundations. It is the state a child is
        // actually in, and it shows both kinds of site at once.
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
      }),
    [],
  );

  const heroRef = useRef(new THREE.Vector3(0, 0, 15));
  const yawRef = useRef(0);
  const keys = useRef<Keys>({ f: false, b: false, l: false, r: false, yawL: false, yawR: false });
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
        default: return;
      }
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
  }, []);

  return (
    <>
      <SkyDome />
      <fog attach="fog" args={[FOG, 72, 215]} />
      <Sun heroRef={heroRef} />
      <Terrain />
      <Scenery scenery={layout.scenery} />
      <Village props={layout.props} villagers={layout.villagers} />
      <Hero heroRef={heroRef} keys={keys} yawRef={yawRef} />
      <LanternGlow scenery={layout.scenery} tex={tex} />
      <Motes tex={tex} />
      <Rig heroRef={heroRef} yawRef={yawRef} />
    </>
  );
}

export default function SpikeScene() {
  return (
    <div className="fixed inset-0 bg-[#bcdcec]">
      <Canvas
        dpr={1}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 46, near: 0.5, far: 420, position: [0, 22, 40] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
        }}
      >
        <World />
      </Canvas>
      <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/45 px-3 py-1 text-sm text-white/85">
        WASD to walk · Q / E to swing the camera
      </p>
    </div>
  );
}
