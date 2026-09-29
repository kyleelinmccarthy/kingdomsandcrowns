"use client";

/**
 * THE GROUND AND THE WATER of the generated realm.
 *
 * ## How far a child can see, and what it costs
 *
 * All of it. The entire 640-unit island is on screen from the first frame the tiles finish
 * building, and that is a decision, not an oversight.
 *
 * The arithmetic that decides it: a height query is ~0.6µs, and the mesh error against the true
 * surface at a two-unit grid is six millimetres of mean error on village ground and three
 * centimetres in the fells (measured, not guessed). Sixteen tiles of 160 units at two-unit
 * resolution is 105,000 queries — about 60ms — for 205,000 triangles and SIXTEEN draw calls, and
 * it never has to be built again. Streaming machinery would have cost more than that to write
 * and would have bought a world that pops.
 *
 * So there is no terrain LOD here, no ring of chunks around the hero, and no rebuild. There is a
 * fixed grid of sixteen tiles, built nearest-first at one tile a frame so the first second is
 * smooth, and then kept for ever. What that buys is the thing the summits promise: "the whole
 * realm is under you from here" is TRUE — you stand on Cloudfoot at seventy units up and you can
 * see the coast on the far side and the shape of every bay in between.
 *
 * What is NOT drawn to the horizon is the scatter — twenty thousand props cannot be. That lives
 * in `world-props.tsx`, which fades each lattice out at its own distance. The trick that makes a
 * ninety-unit tree horizon survive a two-hundred-unit view is that the GROUND is coloured by
 * biome: distant forest is a dark green hillside rather than a bald one, so what ends at ninety
 * units is the detail of the wood, not the wood.
 *
 * ## The water
 *
 * One surface, one draw call, for the sea and for every inland lake and tarn — because the
 * generator puts all of them at the same level. It is the same fact that makes `shore.ts` a
 * single rule. The authored water (Longwater, the millstream and the mill pool) stands above the
 * sea in a basin the generator digs for it (`world.lakes`), and gets a surface of its own at its
 * own level, built exactly the way the sea's is: a grid that runs a little past the shore and is
 * cut by the bank, so the edge of the water is wherever the ground rises out of it — a curve,
 * never a rectangle.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TERRAIN } from "@/lib/realm/layout";
import { SEA_LEVEL, type Biome, type RealmWorld } from "@/lib/realm3d/worldgen";
import { buildTrackIndex, segmentsOf, type TrackIndex, type TrackSeg } from "@/lib/realm3d/track-index";
import { GROUND_TINT } from "./day-light";
import { groundNoise } from "@/lib/realm3d/heightfield";

/* ------------------------------------------------------------------ ground */

/** Four tiles across the island, so sixteen meshes cover it exactly and none is wasted on sea. */
const TILE = 160;
/**
 * Two units a vertex.
 *
 * Measured against the true surface: 0.006 units of mean error on the village floor, 0.03 in the
 * fells, worst case 0.68 on one cliff. The hero's feet read the true height, not the mesh, so
 * that error is how far he can appear to sink — six millimetres where a child spends their time.
 * Four units a vertex would have been a quarter of the cost and 0.1 of mean error, which is
 * still invisible underfoot, but four-unit facets under a camera twenty-one units back read as
 * a paper model rather than as ground.
 */
const STEP = 2;
const N = TILE / STEP + 1;

/**
 * Ground colour per surface. NOT `BIOME_COLORS` — those are the minimap's, and a map is read
 * flat while this is read under a low sun with a shadow across it, so everything here is a
 * stop or two brighter and greener than the map's version of the same word.
 */
const GROUND: Record<Biome, THREE.Color> = {
  ocean: new THREE.Color("#8d8a63"),
  shore: new THREE.Color("#d5c18d"),
  marsh: new THREE.Color("#5f7742"),
  meadow: new THREE.Color("#7ba63a"),
  wood: new THREE.Color("#5d8f2e"),
  forest: new THREE.Color("#3d6c26"),
  heath: new THREE.Color("#8a7a46"),
  moor: new THREE.Color("#94896a"),
  crag: new THREE.Color("#968f83"),
};
/** The village's own mown ground, so the middle of the realm still reads as kept. */
const KEPT = new THREE.Color("#63962a");
/** Bare rock, blended onto anything steep, whatever it is otherwise. */
const ROCK = new THREE.Color("#8e877b");
/** The tops of the three summits. A white cap is the cheapest landmark in any game ever made. */
const SNOW = new THREE.Color("#e6edf0");
/** The bed and the wet margin of the authored lakes. */
const LAKE_BED = new THREE.Color("#6a6446");
const LAKE_SHORE = new THREE.Color("#a99a6a");
/** A walked track. The same sandy cobble the village road is drawn in. */
const TRACK = new THREE.Color("#c2a469");

/** The generator's own rule, repeated here because the mesh has the numbers already in hand. */
function classify(h: number, moisture: number, slope: number): Biome {
  if (h < SEA_LEVEL) return "ocean";
  if (h < SEA_LEVEL + 1.8) return "shore";
  if (slope > 0.7) return "crag";
  if (h < SEA_LEVEL + 5 && moisture > 0.44) return "marsh";
  if (h > 33) return slope > 0.5 ? "crag" : "moor";
  if (h > 18) return moisture > 0.52 ? "forest" : "heath";
  if (moisture > 0.535) return "forest";
  if (moisture > 0.44) return "wood";
  return "meadow";
}

type TileKey = { ix: number; iz: number; x0: number; z0: number; cx: number; cz: number };

function tileKeys(half: number): TileKey[] {
  const out: TileKey[] = [];
  const n = Math.ceil(half / TILE);
  for (let ix = -n; ix < n; ix++) {
    for (let iz = -n; iz < n; iz++) {
      out.push({ ix, iz, x0: ix * TILE, z0: iz * TILE, cx: ix * TILE + TILE / 2, cz: iz * TILE + TILE / 2 });
    }
  }
  return out;
}

/**
 * One tile of ground.
 *
 * Indexed, not `toNonIndexed()`: `flatShading` on a `MeshStandardMaterial` takes its normal from
 * screen-space derivatives, so the facets come out flat whether or not the vertices are shared,
 * and sharing them is four times less memory and four times fewer vertices to shade. The colour
 * is per vertex and therefore interpolates across a facet, which — with the facet edges still
 * hard from the flat normals — is what keeps a hillside from reading as a chequerboard.
 */
function buildTile(world: RealmWorld, tracks: TrackIndex, x0: number, z0: number): THREE.BufferGeometry {
  const pos = new Float32Array(N * N * 3);
  const col = new Float32Array(N * N * 3);
  const heights = new Float32Array(N * N);

  for (let j = 0; j < N; j++) {
    const z = z0 + j * STEP;
    for (let k = 0; k < N; k++) heights[j * N + k] = world.heightAt(x0 + k * STEP, z);
  }

  const c = new THREE.Color();
  for (let j = 0; j < N; j++) {
    for (let k = 0; k < N; k++) {
      const i = j * N + k;
      const x = x0 + k * STEP;
      const z = z0 + j * STEP;
      const y = heights[i];
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      const hx = heights[j * N + Math.min(N - 1, k + 1)] - heights[j * N + Math.max(0, k - 1)];
      const hz = heights[Math.min(N - 1, j + 1) * N + k] - heights[Math.max(0, j - 1) * N + k];
      const slope = Math.hypot(hx, hz) / (2 * STEP);
      const moisture = world.moistureAt(x, z);
      c.copy(GROUND[classify(y, moisture, slope)]);

      // Under water the ground is seabed, and it gets darker as it goes down: a flat colour
      // under a translucent surface makes a lagoon of any depth look like a puddle.
      if (y < SEA_LEVEL) c.multiplyScalar(1 - Math.min(0.55, (SEA_LEVEL - y) * 0.05));
      // The authored lakes stand above the sea, so `classify` calls their bed meadow. Grass
      // under water is the single thing that makes a pond look painted on; give it a muddy bed
      // that darkens with depth, and a strip of wet shore where it comes up out of the water.
      const lake = world.waterLevelAt(x, z);
      if (lake > SEA_LEVEL) {
        const under = lake - y;
        if (under > -0.9) c.lerp(LAKE_SHORE, THREE.MathUtils.smoothstep(under, -0.9, -0.1) * 0.85);
        if (under > 0) c.copy(LAKE_BED).multiplyScalar(1 - Math.min(0.5, under * 0.16));
      }
      // Bare rock on anything steep, whatever biome says it is.
      if (slope > 0.35) c.lerp(ROCK, THREE.MathUtils.smoothstep(slope, 0.35, 0.85));
      // Snow on the three summits. Worth every line: it is the one thing in this realm that is
      // legible from two hundred units away and says "there, and it is a long way up".
      if (y > 52) c.lerp(SNOW, THREE.MathUtils.smoothstep(y, 54, 74) * 0.9);
      // The village's kept green, held INSIDE the authored square so the change of colour is
      // never the thing that shows a child where the hand-made world stops.
      c.lerp(KEPT, (1 - THREE.MathUtils.smoothstep(Math.hypot(x, z), 26, 62)) * 0.75);
      // Tracks. The generator already graded them into the ground; this is what makes them read.
      const onTrack = tracks.nearness(x, z);
      if (onTrack > 0 && y > SEA_LEVEL) c.lerp(TRACK, onTrack * 0.82);

      // Big soft blotches. A per-facet wobble reads as confetti; what a hillside actually has is
      // low-frequency patches of darker grass.
      const blot = groundNoise(x * 0.055, z * 0.055) * 0.72 + groundNoise(x * 0.16 + 11, z * 0.16 - 4) * 0.28;
      const w = 0.78 + blot * 0.42;
      col[i * 3] = c.r * w;
      col[i * 3 + 1] = c.g * w;
      col[i * 3 + 2] = c.b * w;
    }
  }

  const index = new Uint32Array((N - 1) * (N - 1) * 6);
  let t = 0;
  for (let j = 0; j < N - 1; j++) {
    for (let k = 0; k < N - 1; k++) {
      const a = j * N + k;
      const b = a + 1;
      const d = a + N;
      const e = d + 1;
      index[t++] = a;
      index[t++] = d;
      index[t++] = b;
      index[t++] = b;
      index[t++] = d;
      index[t++] = e;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  return geo;
}

/**
 * The island, as sixteen tiles built one a frame.
 *
 * Nearest first, because the first thing a child sees is the ground they are standing on, and a
 * tile arriving two hundred units away three frames later is a cloud clearing rather than a
 * glitch. One a frame and not all at once: sixty milliseconds in a single frame is a visible
 * lurch on arrival, and sixteen frames of four is not.
 */
export function RealmGround({ world, heroRef }: { world: RealmWorld; heroRef: React.RefObject<THREE.Vector3> }) {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
    // Assigned, not passed to the constructor (which would copy it): one paint tints the ground and the scatter.
    m.color = GROUND_TINT;
    return m;
  }, []);
  const tracks = useMemo(() => {
    const segs: TrackSeg[] = [];
    for (const road of world.roads) segs.push(...segmentsOf(road.points, road.halfWidth));
    // The authored tracks are single tiles rather than a polyline, so each one is its own dot of
    // track — which is exactly what the village's own path already looks like on the ground.
    for (const patch of TERRAIN) {
      if (patch.kind !== "trail") continue;
      const r = Math.max(patch.size.w, patch.size.d) / 2;
      segs.push({ ax: patch.position.x - 0.01, az: patch.position.z, bx: patch.position.x + 0.01, bz: patch.position.z, half: r });
    }
    return buildTrackIndex(segs, 1.4);
  }, [world]);

  const keys = useMemo(() => tileKeys(world.half), [world]);
  const [tiles, setTiles] = useState<{ key: string; geo: THREE.BufferGeometry }[]>([]);
  const pending = useRef<TileKey[]>([]);
  const built = useRef<Set<string>>(new Set());

  useEffect(
    () => () => {
      for (const t of tiles) t.geo.dispose();
    },
    // Deliberately on unmount only: the list grows every tile, and disposing the geometry of a
    // tile that is still on screen because a NEW one arrived is how you make the ground blink.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world],
  );

  useFrame(() => {
    if (built.current.size >= keys.length) return;
    const p = heroRef.current;
    pending.current.length = 0;
    for (const k of keys) if (!built.current.has(`${k.ix},${k.iz}`)) pending.current.push(k);
    pending.current.sort((a, b) => Math.hypot(a.cx - p.x, a.cz - p.z) - Math.hypot(b.cx - p.x, b.cz - p.z));
    const next = pending.current[0];
    const geo = buildTile(world, tracks, next.x0, next.z0);
    // Marked here, not read back from `tiles`: a frame can run again before React commits the tile
    // this one added, and would build the same tile twice (two children with one key).
    built.current.add(`${next.ix},${next.iz}`);
    setTiles((list) => [...list, { key: `${next.ix},${next.iz}`, geo }]);
  });

  const meshes = useRef<Map<string, THREE.Mesh>>(new Map());
  useFrame(() => {
    // Only the ground near the hero needs to cast: the sun's shadow camera is 104 units across,
    // so a tile two hundred units away would be four hundred thousand triangles of depth pass
    // for nothing. It is a boolean, not a rebuild.
    const p = heroRef.current;
    for (const [key, mesh] of meshes.current) {
      const [ix, iz] = key.split(",").map(Number);
      const dx = Math.max(0, Math.abs(ix * TILE + TILE / 2 - p.x) - TILE / 2);
      const dz = Math.max(0, Math.abs(iz * TILE + TILE / 2 - p.z) - TILE / 2);
      mesh.castShadow = Math.hypot(dx, dz) < 70;
    }
  });

  return (
    <>
      {tiles.map(({ key, geo }) => (
        <mesh
          key={key}
          geometry={geo}
          material={mat}
          receiveShadow
          ref={(m) => {
            if (m) meshes.current.set(key, m);
            else meshes.current.delete(key);
          }}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------- water */

/** The surface grid. Coarser than the ground on purpose: it is flat, and the swell is a shader. */
const WATER_STEP = 8;

/** Deep water, the shallows, and the wash at the very edge. */
const DEEP = new THREE.Color("#1d5178");
const SHALLOW = new THREE.Color("#4f9fb8");
const WASH = new THREE.Color("#a9dbe2");
/** The authored lakes' own water: greener and stiller than the sea's. */
const LAKE_SHALLOW = new THREE.Color("#4d93a3");
const LAKE_DEEP = new THREE.Color("#245a74");

function buildWaterGeometry(world: RealmWorld): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const dep: number[] = [];
  const wash: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();

  const tint = (depth: number, lake: boolean) => {
    if (lake) {
      // A still pool: no pale surf band, and deep sooner — its bed is two and a half down, not nine.
      c.copy(LAKE_SHALLOW).lerp(LAKE_DEEP, THREE.MathUtils.smoothstep(depth, 0.2, 2.4));
      return c;
    }
    c.copy(WASH).lerp(SHALLOW, THREE.MathUtils.smoothstep(depth, 0.1, 1.6)).lerp(DEEP, THREE.MathUtils.smoothstep(depth, 1.4, 9));
    return c;
  };

  const quad = (x: number, z: number, w: number, d: number, y: number, depths: [number, number, number, number], surf = 1) => {
    const base = pos.length / 3;
    const corners: [number, number][] = [
      [x - w / 2, z - d / 2],
      [x + w / 2, z - d / 2],
      [x - w / 2, z + d / 2],
      [x + w / 2, z + d / 2],
    ];
    for (let i = 0; i < 4; i++) {
      pos.push(corners[i][0], y, corners[i][1]);
      const t = tint(depths[i], surf < 1);
      col.push(t.r, t.g, t.b);
      dep.push(depths[i]);
      wash.push(surf);
    }
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };

  // The sea, and every inland lake and tarn with it: one level, so one grid.
  const half = world.half;
  const n = Math.ceil((half * 2) / WATER_STEP);
  const depthGrid = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) {
    for (let k = 0; k <= n; k++) {
      const x = -half + k * WATER_STEP;
      const z = -half + j * WATER_STEP;
      depthGrid[j * (n + 1) + k] = SEA_LEVEL - world.heightAt(x, z);
    }
  }
  /**
   * Which of that water is the SEA: flood in from the rim over every wet vertex. Anything the
   * flood does not reach is a pond or a tarn with no way out, and a still pond has no surf — drawn
   * with the sea's white wash at its edge, a shallow inland pool was one pale sheet.
   */
  const W = n + 1;
  const sea = new Uint8Array(W * W);
  {
    const stack: number[] = [];
    for (let i = 0; i < W; i++) for (const v of [i, (W - 1) * W + i, i * W, i * W + W - 1]) if (depthGrid[v] > 0 && !sea[v]) {
      sea[v] = 1;
      stack.push(v);
    }
    while (stack.length) {
      const v = stack.pop() as number;
      const vx = v % W;
      const vz = (v - vx) / W;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = vx + dx;
        const z = vz + dz;
        if (x < 0 || z < 0 || x >= W || z >= W) continue;
        const u = z * W + x;
        if (sea[u] || depthGrid[u] <= 0) continue;
        sea[u] = 1;
        stack.push(u);
      }
    }
  }
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < n; k++) {
      const d00 = depthGrid[j * (n + 1) + k];
      const d10 = depthGrid[j * (n + 1) + k + 1];
      const d01 = depthGrid[(j + 1) * (n + 1) + k];
      const d11 = depthGrid[(j + 1) * (n + 1) + k + 1];
      // A quad with every corner well above the waterline is dry land; drawing it would put a
      // blue sheet across the meadow. One corner under is enough to keep it, so the surface
      // always runs past the true shoreline and is cut by the beach rather than stopping short.
      if (d00 < -0.5 && d10 < -0.5 && d01 < -0.5 && d11 < -0.5) continue;
      const x = -half + k * WATER_STEP;
      const z = -half + j * WATER_STEP;
      quad(x + WATER_STEP / 2, z + WATER_STEP / 2, WATER_STEP, WATER_STEP, SEA_LEVEL, [
        Math.max(0, d00),
        Math.max(0, d10),
        Math.max(0, d01),
        Math.max(0, d11),
      ], sea[j * W + k] | sea[j * W + k + 1] | sea[(j + 1) * W + k] | sea[(j + 1) * W + k + 1] ? 1 : 0.25);
    }
  }

  /**
   * The open sea, past the island, out to where the fog takes it.
   *
   * Without this the water stops dead at the world's own half-extent, and from the top of
   * Cloudfoot — seventy units up, which is exactly where a child goes to look at their realm —
   * the ocean ends in a ruler-straight line with sky under it. It is the single most "this is a
   * model" thing in the picture and it costs five hundred quads to remove.
   *
   * Coarse, because it is deep water with no shore in it: forty units a quad, which is still
   * fine enough for the swell to read as a swell rather than as one enormous tilting sheet.
   */
  {
    const step = 40;
    // Both extents are whole multiples of the step, so every cell is either wholly inside the
    // island's square — where the fine grid owns it — or wholly outside it. Nothing overlaps,
    // nothing is left as a gap, and no quad is ever half of each.
    const outer = half + 240;
    for (let x = -outer; x < outer; x += step) {
      for (let z = -outer; z < outer; z += step) {
        if (x >= -half && x + step <= half && z >= -half && z + step <= half) continue;
        const d = Math.max(4, SEA_LEVEL - world.heightAt(x + step / 2, z + step / 2));
        quad(x + step / 2, z + step / 2, step, step, SEA_LEVEL, [d, d, d, d]);
      }
    }
  }

  /**
   * ...and the lakes that stand above the sea, each at its own level, over a grid fine enough to
   * follow a four-unit millstream. Exactly the sea's rule: a cell is kept if any corner is under
   * the surface, so the surface always runs a little past the shore and the bank cuts it, and
   * the depth each vertex carries fades the shallows out rather than ending them on a line.
   * `surf` 0.25: a still inland pool has none of the sea's surf at its edge.
   */
  for (const lake of world.lakes) {
    const step = 1.5;
    const nx = Math.ceil((lake.x1 - lake.x0) / step);
    const nz = Math.ceil((lake.z1 - lake.z0) / step);
    const grid = new Float32Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++) {
      for (let k = 0; k <= nx; k++) grid[j * (nx + 1) + k] = lake.level - world.heightAt(lake.x0 + k * step, lake.z0 + j * step);
    }
    for (let j = 0; j < nz; j++) {
      for (let k = 0; k < nx; k++) {
        const d00 = grid[j * (nx + 1) + k];
        const d10 = grid[j * (nx + 1) + k + 1];
        const d01 = grid[(j + 1) * (nx + 1) + k];
        const d11 = grid[(j + 1) * (nx + 1) + k + 1];
        if (d00 <= 0 && d10 <= 0 && d01 <= 0 && d11 <= 0) continue;
        const x = lake.x0 + k * step;
        const z = lake.z0 + j * step;
        quad(x + step / 2, z + step / 2, step, step, lake.level, [Math.max(0, d00), Math.max(0, d10), Math.max(0, d01), Math.max(0, d11)], 0.25);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.setAttribute("aDepth", new THREE.BufferAttribute(new Float32Array(dep), 1));
  geo.setAttribute("aWash", new THREE.BufferAttribute(new Float32Array(wash), 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * The surface.
 *
 * A standard lit material rather than a hand-rolled shader, so the water takes the same sun, the
 * same fog and the same tone mapping as everything else and cannot drift out of the picture when
 * one of those is tuned. What is hand-rolled is the swell: a vertical displacement from three
 * crossed sines, with the NORMAL derived analytically from the same three, because a moving
 * surface whose normal stays flat has no motion in it at all — it is the sliding highlight that
 * reads as water, not the shape.
 *
 * The swell is damped to nothing in the shallows, so the sea does not saw through the beach, and
 * the wash at the water's edge is a fragment-shader band driven by the same clock: white where it
 * is a hand's depth, gone by a stride out.
 */
function waterMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.86,
    roughness: 0.22,
    metalness: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mat.userData.time = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = mat.userData.time;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         attribute float aDepth;
         attribute float aWash;
         varying float vDepth;
         varying float vWash;
         varying vec3 vWorld;`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `vDepth = aDepth;
         vWash = aWash;
         vWorld = position;
         float amp = mix(0.03, 0.26, clamp(aDepth / 3.5, 0.0, 1.0)) * mix(0.35, 1.0, aWash);
         float a1 = position.x * 0.115 + uTime * 0.85;
         float a2 = position.z * 0.089 - uTime * 0.67;
         float a3 = (position.x + position.z) * 0.047 + uTime * 0.41;
         float wave = (sin(a1) + sin(a2) + 1.35 * sin(a3)) * amp * 0.34;
         vec3 objectNormal = normalize(vec3(
           -(0.115 * cos(a1) + 0.047 * 1.35 * cos(a3)) * amp * 0.34,
           1.0,
           -(0.089 * cos(a2) + 0.047 * 1.35 * cos(a3)) * amp * 0.34));
         #ifdef USE_TANGENT
           vec3 objectTangent = vec3( tangent.xyz );
         #endif`,
      )
      .replace("#include <begin_vertex>", "vec3 transformed = vec3(position.x, position.y + wave, position.z);");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         varying float vDepth;
         varying float vWash;
         varying vec3 vWorld;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         float band = sin(vWorld.x * 0.42 + vWorld.z * 0.31 + uTime * 1.6) * 0.5 + 0.5;
         float edge = 1.0 - smoothstep(0.05, 0.85, vDepth);
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.98, 1.0), edge * (0.35 + 0.45 * band) * vWash);
         float glint = pow(max(0.0, sin(vWorld.x * 0.21 - uTime * 0.9) * sin(vWorld.z * 0.17 + uTime * 0.7)), 6.0);
         diffuseColor.rgb += glint * 0.16;
         diffuseColor.a *= mix(0.72, 1.0, smoothstep(0.0, 1.2, vDepth));`,
      );
  };
  return mat;
}

/** The swell's clock. A free function so the material is never written to as a hook result. */
function setWaterTime(mat: THREE.MeshStandardMaterial, t: number): void {
  (mat.userData.time as { value: number }).value = t;
}

export function RealmWater({ world }: { world: RealmWorld }) {
  const geo = useMemo(() => buildWaterGeometry(world), [world]);
  const mat = useMemo(() => waterMaterial(), []);
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);
  useFrame((state) => {
    setWaterTime(mat, state.clock.elapsedTime);
  });
  return <mesh geometry={geo} material={mat} renderOrder={2} />;
}

/**
 * The ring of wash around a child standing in the water.
 *
 * Without it, wading is something you can see happening to the hero from the outside and cannot
 * feel: the surface cuts across his legs and nothing else in the world admits he is there. One
 * flat ring at the waterline, drawn only when he is actually in it, and the water has him in it.
 */
export function WadeRing({ world, heroRef }: { world: RealmWorld; heroRef: React.RefObject<THREE.Vector3> }) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.RingGeometry(0.5, 1.15, 16).rotateX(-Math.PI / 2), []);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#e8f7fb", transparent: true, opacity: 0.55, depthWrite: false }),
    [],
  );
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const p = heroRef.current;
    const ground = world.heightAt(p.x, p.z);
    const level = world.waterLevelAt(p.x, p.z);
    const depth = level - ground;
    m.visible = depth > 0.06;
    if (!m.visible) return;
    m.position.set(p.x, level + 0.06, p.z);
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3.4) * 0.09;
    m.scale.setScalar(pulse * (0.9 + Math.min(1, depth / 1.3) * 0.5));
  });
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={3} visible={false} />;
}
