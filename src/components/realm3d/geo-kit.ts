/**
 * The shed: the small geometry tools and the scenery kit, shared by everything that draws the
 * realm.
 *
 * These lived inside `spike-scene.tsx` while the scene was one file and one village. The scene
 * now draws a 640-unit island — ground, water, twenty thousand generated props and fourteen
 * built landmarks — and all of those need the same two tricks the village used: bake a flat
 * colour into a geometry so a hundred parts can share one vertex-coloured material, and merge
 * the parts so a tree is one draw call and not four.
 *
 * `three` is imported at the top, which is allowed here and nowhere under `src/lib`: this module
 * is only ever reachable from a scene component, which is itself behind a `next/dynamic` with
 * `ssr: false`. Nothing under Vitest may reach it.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Bake a flat colour into a geometry so many parts can share one vertex-coloured material. */
export function paint(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
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

/** Move a part into place within its own model. */
export function at(geo: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  geo.translate(x, y, z);
  return geo;
}

/** A gable roof: a triangle extruded along z. A box plus one of these reads as a house. */
export function gableGeo(w: number, d: number, h: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

/** A painted gable, for the merged models. */
export function roofGeo(w: number, d: number, h: number, hex: string): THREE.BufferGeometry {
  return paint(gableGeo(w, d, h), hex);
}

export const litMaterial = () =>
  new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });

/** The village colours are muted for a pixel sprite. Under a light they want saturating. */
export function vivid(hex: string, satFloor = 0.5, lo = 0.34, hi = 0.58): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.max(hsl.s, satFloor), Math.min(hi, Math.max(lo, hsl.l)));
  return c;
}

/** Merge, with the same painted-part contract as everything else here. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts) as THREE.BufferGeometry;
}

/**
 * One merged, vertex-coloured model per scenery kind, authored at nominal scale 1.
 *
 * The generated world was deliberately written to emit only these eleven variants, so a realm
 * twenty-five times the size of the authored one needed no new art to be walkable. `boat` is
 * new here only because there is finally water for it to sit beside.
 */
export const SCENERY_GEO: Record<string, () => THREE.BufferGeometry> = {
  oak: () =>
    merge([
      paint(at(new THREE.CylinderGeometry(0.15, 0.24, 1.3, 6), 0, 0.65, 0), "#5b3f28"),
      paint(at(new THREE.IcosahedronGeometry(1.0, 0).scale(1, 0.85, 1), 0, 1.95, 0), "#3f8f2c"),
      paint(at(new THREE.IcosahedronGeometry(0.62, 0), 0.62, 2.4, 0.3), "#57ab3a"),
      paint(at(new THREE.IcosahedronGeometry(0.55, 0), -0.6, 1.65, -0.35), "#357a26"),
    ]),
  pine: () =>
    merge([
      paint(at(new THREE.CylinderGeometry(0.12, 0.2, 1.0, 6), 0, 0.5, 0), "#4b3320"),
      paint(at(new THREE.ConeGeometry(1.0, 1.6, 7), 0, 1.35, 0), "#2c6b34"),
      paint(at(new THREE.ConeGeometry(0.76, 1.4, 7), 0, 2.25, 0), "#347c3c"),
      paint(at(new THREE.ConeGeometry(0.5, 1.2, 7), 0, 3.1, 0), "#3d8d45"),
    ]),
  bush: () =>
    merge([
      paint(at(new THREE.IcosahedronGeometry(0.62, 0).scale(1.1, 0.8, 1.1), 0, 0.45, 0), "#457f28"),
      paint(at(new THREE.IcosahedronGeometry(0.42, 0), 0.42, 0.62, 0.2), "#569a31"),
    ]),
  rock: () => paint(at(new THREE.IcosahedronGeometry(0.62, 0).scale(1.25, 0.8, 1.05), 0, 0.36, 0), "#918d84"),
  menhir: () =>
    merge([
      paint(at(new THREE.CylinderGeometry(0.24, 0.4, 2.6, 6).rotateZ(0.05), 0, 1.3, 0), "#8b877d"),
      paint(at(new THREE.IcosahedronGeometry(0.4, 0).scale(1.1, 0.5, 1), 0, 0.2, 0), "#7c786f"),
    ]),
  fence: () =>
    merge([
      paint(at(new THREE.BoxGeometry(0.13, 1.0, 0.13), -0.6, 0.5, 0), "#7c5c38"),
      paint(at(new THREE.BoxGeometry(0.13, 1.0, 0.13), 0.6, 0.5, 0), "#7c5c38"),
      paint(at(new THREE.BoxGeometry(1.35, 0.11, 0.08), 0, 0.78, 0), "#8b6a42"),
      paint(at(new THREE.BoxGeometry(1.35, 0.11, 0.08), 0, 0.45, 0), "#8b6a42"),
    ]),
  lantern: () =>
    merge([
      paint(at(new THREE.CylinderGeometry(0.07, 0.1, 1.7, 5), 0, 0.85, 0), "#584431"),
      paint(at(new THREE.IcosahedronGeometry(0.24, 0), 0, 1.82, 0), "#ffd98a"),
    ]),
  signpost: () =>
    merge([
      paint(at(new THREE.CylinderGeometry(0.06, 0.08, 1.3, 6), 0, 0.65, 0), "#7c5c38"),
      paint(at(new THREE.IcosahedronGeometry(0.11, 0), 0, 1.33, 0), "#8b6a42"),
      paint(at(new THREE.BoxGeometry(0.72, 0.2, 0.05), 0.4, 1.16, 0), "#d9b877"),
      paint(at(new THREE.BoxGeometry(0.72, 0.2, 0.05).rotateY(Math.PI / 2), 0, 0.86, -0.4), "#d9b877"),
    ]),
  cart: () =>
    merge([
      paint(at(new THREE.BoxGeometry(1.5, 0.55, 0.95), 0, 0.72, 0), "#8b6a42"),
      paint(at(new THREE.BoxGeometry(1.3, 0.3, 0.75), 0, 1.06, 0), "#c2452c"),
      paint(at(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 9).rotateX(Math.PI / 2), -0.42, 0.42, 0.52), "#5b3f28"),
      paint(at(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 9).rotateX(Math.PI / 2), -0.42, 0.42, -0.52), "#5b3f28"),
    ]),
  scarecrow: () =>
    merge([
      paint(at(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 5), 0, 0.95, 0), "#7c5c38"),
      paint(at(new THREE.BoxGeometry(1.5, 0.12, 0.12), 0, 1.5, 0), "#7c5c38"),
      paint(at(new THREE.BoxGeometry(0.55, 0.7, 0.4), 0, 1.35, 0), "#b6863f"),
      paint(at(new THREE.IcosahedronGeometry(0.28, 0), 0, 1.95, 0), "#d9b45c"),
    ]),
  /** A clinker hull with a thwart and two oars. It sits ON the water, so its origin is its keel. */
  boat: () =>
    merge([
      paint(at(new THREE.CylinderGeometry(0.52, 0.34, 2.9, 7, 1, false).rotateZ(Math.PI / 2).scale(1, 1, 0.62), 0, 0.3, 0), "#8a6237"),
      paint(at(new THREE.BoxGeometry(2.6, 0.12, 0.62), 0, 0.5, 0), "#6b4a30"),
      paint(at(new THREE.BoxGeometry(0.5, 0.1, 0.72), 0.2, 0.52, 0), "#a57c4a"),
      paint(at(new THREE.BoxGeometry(1.7, 0.08, 0.1).rotateY(0.22), -0.2, 0.58, 0.28), "#9c7748"),
    ]),
};

export function sceneryGeometryFor(kind: string): THREE.BufferGeometry {
  const make = SCENERY_GEO[kind] ?? SCENERY_GEO.rock;
  return make();
}

/**
 * The pop-free horizon.
 *
 * Every instanced field in this scene ends somewhere — a fern is four pixels of picture and a
 * draw call's worth of cost at ninety units, so it is not drawn there. What a child must never
 * see is the LINE where it ends: trees switching on a fixed distance ahead is the single thing
 * that tells them the world is being made up just out of shot.
 *
 * So the last stretch of every field is a fade, and the fade is done in the vertex shader rather
 * than by rewriting matrices: each instance shrinks towards its own root as it approaches the
 * horizon, so a tree sinks into the ground and grows back out of it. It costs two lines of GPU
 * arithmetic, it needs no per-frame work on the CPU at all, and — this is the part that matters —
 * it is continuous, so there is no distance at which anything appears.
 *
 * Transparency would have been the other answer and is worse: every instanced field would have
 * to be sorted and blended, and a half-transparent oak at eighty units looks like a bug.
 */
export function fadeWithDistance(mat: THREE.Material, near: number, far: number): THREE.Material {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.fadeNear = { value: near };
    shader.uniforms.fadeFar = { value: far };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float fadeNear;\nuniform float fadeFar;")
      .replace(
        "#include <project_vertex>",
        `#ifdef USE_INSTANCING
           vec3 instOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
           float fadeD = distance(instOrigin, cameraPosition);
           float fadeK = 1.0 - smoothstep(fadeNear, fadeFar, fadeD);
           transformed *= fadeK;
         #endif
         #include <project_vertex>`,
      );
  };
  // Two materials with different fades must not share a compiled program.
  mat.customProgramCacheKey = () => `fade${near}_${far}`;
  return mat;
}
