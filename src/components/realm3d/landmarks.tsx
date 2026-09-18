"use client";

/**
 * THE NINETEEN PLACES — what is actually standing at the spots the generator found.
 *
 * The generator does the hard half: it scans its own terrain and asks it real questions — where
 * are the three highest points, where is the wood deepest by distance transform, which beaches
 * have land wrapped round them rather than sea — clears a space at each answer and names it.
 * Then it puts nothing there, because it has no geometry and must not have any.
 *
 * Nineteen named empty clearings is a worse world than no landmarks at all. A child walks
 * fifteen seconds towards a name, arrives at a circle of grass, and learns that names in this
 * world mean nothing. So each kind of place gets its own built thing, and the six designs are
 * chosen to answer three questions a child asks in order:
 *
 *   1. From over there, is there something at all? — so every one of them is TALL. A cairn with
 *      a beacon pole is eleven units; the tower is thirteen; the stone ring is seven and stands
 *      on bare moor. The undergrowth stops being drawn at 54 units and the wood at 92, but these
 *      are inside the great-tree horizon at 165, so the thing you are walking towards is drawn
 *      the whole way.
 *   2. Is it the same as the last one? — six designs over fourteen sites, and each site varies
 *      its own proportions, count and yaw from a hash of its name. Arriving is not the same
 *      event twice running.
 *   3. Did I get there? — a name board, on a post, rendered from the name the generator gave the
 *      place. It is the only text in the realm and it is the one sentence that matters: you are
 *      at Cloudfoot, and it is called that.
 *
 * Every structure is ONE merged, vertex-coloured geometry, so a landmark is one draw call and
 * not thirty — the same trick the trees use.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Landmark, RealmWorld } from "@/lib/realm3d/worldgen";
import type { Collider } from "@/lib/realm3d/collision";
import { at, litMaterial, merge, paint, roofGeo } from "./geo-kit";

/* ------------------------------------------------------------ determinism */

/** The same integer hash the generator uses, so a landmark's shape never depends on draw order. */
function hash(s: string, salt: number): number {
  let h = salt | 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h ^ s.charCodeAt(i), 2654435761) + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ------------------------------------------------------------- the designs */

/** A seeded draw: the same landmark gets the same shape for ever. */
type Rnd = (k: number) => number;

/**
 * The palette, and why it is so much paler than the colours these things are "really".
 *
 * The sun in this scene comes from the north-east and the camera sits due south of the child, so
 * what a child looks at is the UNLIT face of everything vertical — and a vertical face gets only
 * the hemisphere light, which is half sky and half dark green ground. The first pass at these
 * used honest stone greys and honest timber browns and every landmark came out a black
 * silhouette: photographed, the beacon tower on Split Rock is a chimney.
 *
 * So they are lit for the shot they are actually seen in, at roughly the brightness the village's
 * own watchtower and castle are painted, which were tuned against this same sun and read well.
 */
const STONE = "#cfc6b1";
const STONE_DARK = "#a79e8c";
const TIMBER = "#a87f4e";
const TIMBER_DARK = "#7c5c38";
const THATCH = "#d9b45c";
const PLANK = "#c69c66";
const CLOTH = "#d4553a";
const EMBER = "#ffb347";

/** A cairn on a summit: stones stacked by somebody, with a beacon pole on top of them. */
function cairnGeo(r: Rnd): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const drums = 5;
  let y = 0;
  for (let i = 0; i < drums; i++) {
    const t = i / drums;
    const rad = 2.3 * (1 - t * 0.72);
    const h = 0.95 + r(i) * 0.5;
    parts.push(paint(at(new THREE.CylinderGeometry(rad * 0.82, rad, h, 7).rotateY(r(i + 9) * 3), 0, y + h / 2, 0), i % 2 ? STONE : STONE_DARK));
    y += h * 0.92;
  }
  // The stones that did not make it onto the pile.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r(i + 20) * 0.7;
    const d = 2.8 + r(i + 30) * 1.3;
    parts.push(
      paint(
        at(new THREE.IcosahedronGeometry(0.42 + r(i + 40) * 0.3, 0).scale(1.3, 0.7, 1.1), Math.cos(a) * d, 0.22, Math.sin(a) * d),
        i % 2 ? STONE : STONE_DARK,
      ),
    );
  }
  // The pole, which is the half of this you can see from the next summit.
  parts.push(paint(at(new THREE.CylinderGeometry(0.11, 0.16, 4.2, 6), 0, y + 2.1, 0), TIMBER));
  parts.push(paint(at(new THREE.BoxGeometry(1.5, 0.9, 0.07), 0.75, y + 3.6, 0), CLOTH));
  parts.push(paint(at(new THREE.CylinderGeometry(0.42, 0.52, 0.55, 8), 0, y + 4.3, 0), STONE_DARK));
  return merge(parts);
}

/** A forester's hut in the deep wood: somebody lives out here, and they have a woodpile. */
function hutGeo(r: Rnd): THREE.BufferGeometry {
  const w = 4.0 + r(1) * 1.2;
  const d = 3.4 + r(2) * 1.0;
  const wall = 2.7;
  const parts: THREE.BufferGeometry[] = [
    paint(at(new THREE.BoxGeometry(w * 1.12, 0.5, d * 1.12), 0, 0.2, 0), STONE_DARK),
    paint(at(new THREE.BoxGeometry(w, wall, d), 0, wall / 2 + 0.4, 0), TIMBER),
    at(roofGeo(w * 1.16, d * 1.16, 1.9, THATCH), 0, wall + 0.4, 0),
    paint(at(new THREE.BoxGeometry(1.15, 2.0, 0.12), 0, 1.4, d / 2 + 0.05), TIMBER_DARK),
    paint(at(new THREE.BoxGeometry(0.75, 0.7, 0.1), -w * 0.3, 2.1, d / 2 + 0.05), "#ffe9a8"),
    paint(at(new THREE.BoxGeometry(0.7, 1.9, 0.7), w * 0.3, wall + 1.5, -d * 0.2), STONE),
  ];
  // The woodpile, and the axe block. Two objects, and the hut is somebody's.
  for (let i = 0; i < 7; i++) {
    const row = Math.floor(i / 4);
    parts.push(
      paint(
        at(new THREE.CylinderGeometry(0.19, 0.19, 1.7, 6).rotateZ(Math.PI / 2), -w * 0.7, 0.55 + row * 0.38, -d * 0.2 + (i % 4) * 0.4),
        i % 2 ? TIMBER : TIMBER_DARK,
      ),
    );
  }
  parts.push(paint(at(new THREE.CylinderGeometry(0.5, 0.55, 0.9, 8), w * 0.75, 0.45, d * 0.3), TIMBER_DARK));
  // A lantern by the door, because the deep wood is dark and a light is an invitation.
  parts.push(paint(at(new THREE.CylinderGeometry(0.07, 0.09, 2.1, 5), w * 0.55, 1.05, d / 2 + 0.6), TIMBER));
  parts.push(paint(at(new THREE.IcosahedronGeometry(0.26, 0), w * 0.55, 2.2, d / 2 + 0.6), "#ffd98a"));
  return merge(parts);
}

/** A ring of standing stones, with a trilithon in the middle for the one who walks inside it. */
function stonesGeo(r: Rnd): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 6 + Math.floor(r(1) * 3);
  const ring = 4.2 + r(2) * 1.4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const h = 2.6 + r(i + 10) * 1.9;
    parts.push(
      paint(
        at(
          new THREE.CylinderGeometry(0.3 + r(i + 20) * 0.16, 0.46, h, 5).rotateY(a).rotateZ((r(i + 30) - 0.5) * 0.18),
          Math.cos(a) * ring,
          h / 2 - 0.2,
          Math.sin(a) * ring,
        ),
        i % 3 === 0 ? STONE_DARK : STONE,
      ),
    );
  }
  // The trilithon: two uprights and a lintel. A doorway to nowhere is worth walking through.
  const gh = 4.4;
  for (const s of [-1, 1]) {
    parts.push(paint(at(new THREE.BoxGeometry(0.72, gh, 0.62), s * 1.1, gh / 2 - 0.2, 0), STONE));
  }
  parts.push(paint(at(new THREE.BoxGeometry(3.3, 0.66, 0.72), 0, gh + 0.15, 0), STONE_DARK));
  parts.push(paint(at(new THREE.CylinderGeometry(2.0, 2.2, 0.34, 9), 0, -0.1, 0), "#9a9182"));
  return merge(parts);
}

/** A jetty on a cove, running out over the water, with a boat tied to it. */
function jettyGeo(r: Rnd): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const length = 11 + r(1) * 4;
  // The deck runs along +x; the caller turns the whole thing to face the water.
  for (let i = 0; i < 9; i++) {
    const x = 1.2 + (i / 8) * length;
    for (const s of [-1, 1]) {
      parts.push(paint(at(new THREE.CylinderGeometry(0.17, 0.2, 4.6, 5), x, -1.6, s * 0.85), TIMBER_DARK));
    }
  }
  parts.push(paint(at(new THREE.BoxGeometry(length + 1.4, 0.22, 2.2), 1.2 + length / 2, 0.55, 0), PLANK));
  for (let i = 0; i < 6; i++) {
    parts.push(paint(at(new THREE.BoxGeometry(0.4, 0.1, 2.3), 2 + (i / 5) * length, 0.68, 0), i % 2 ? PLANK : TIMBER));
  }
  // A mast at the end with a lantern on it: the thing you can see from the headland.
  parts.push(paint(at(new THREE.CylinderGeometry(0.13, 0.18, 6.4, 6), 1.2 + length, 3.4, 0), TIMBER));
  parts.push(paint(at(new THREE.BoxGeometry(1.2, 0.85, 0.06), 1.2 + length + 0.6, 5.6, 0), "#e8dcc0"));
  parts.push(paint(at(new THREE.IcosahedronGeometry(0.28, 0), 1.2 + length, 6.7, 0), "#ffd98a"));
  // A boat, pulled up on the sand beside it. The first version of this was a bare cylinder and
  // it read as a driftwood log — which, at a place called Driftwood Cove, is a joke nobody meant.
  // A hull needs three things to stop being a log: a flat sheer line along the top, a prow that
  // rises out of the water, and something across it you could sit on.
  const bx = 0.4;
  const bz = 3.4 + r(2) * 1.2;
  parts.push(paint(at(new THREE.CylinderGeometry(0.66, 0.5, 3.2, 6).rotateZ(Math.PI / 2).scale(1, 0.85, 1.05), bx, 0.5, bz), "#8a6237"));
  parts.push(paint(at(new THREE.ConeGeometry(0.5, 1.1, 5).rotateZ(-Math.PI / 2).scale(1, 0.8, 1.05), bx + 2.0, 0.62, bz), "#8a6237"));
  parts.push(paint(at(new THREE.ConeGeometry(0.46, 0.9, 5).rotateZ(Math.PI / 2).scale(1, 0.8, 1.05), bx - 2.0, 0.58, bz), "#8a6237"));
  for (const s2 of [-1, 1]) {
    parts.push(paint(at(new THREE.BoxGeometry(4.2, 0.18, 0.16), bx, 0.92, bz + s2 * 0.62), TIMBER_DARK));
  }
  for (const tz of [-0.85, 0.85]) {
    parts.push(paint(at(new THREE.BoxGeometry(0.55, 0.12, 1.3), bx + tz, 0.86, bz), PLANK));
  }
  parts.push(paint(at(new THREE.BoxGeometry(2.4, 0.1, 0.13).rotateY(0.34), bx - 0.4, 1.02, bz + 0.2), PLANK));
  // Creels and a coil of rope, so somebody plainly works here.
  for (let i = 0; i < 3; i++) {
    parts.push(paint(at(new THREE.BoxGeometry(0.7, 0.5, 0.7), -1.4 - i * 0.2, 0.28 + i * 0.5, -2.4 + i * 0.3), i % 2 ? TIMBER : PLANK));
  }
  return merge(parts);
}

/** A ruin in the mire: somebody built here once and the water took it back. */
function ruinGeo(r: Rnd): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const w = 6.5 + r(1) * 2;
  const d = 5.0 + r(2) * 2;
  // Three broken walls, each a run of blocks that stops where it fell.
  const walls: [number, number, number, number, number][] = [
    [0, -d / 2, w, 0.7, 3.4],
    [-w / 2, 0, 0.7, d, 2.6],
    [w / 2, 0, 0.7, d * 0.55, 1.6],
  ];
  walls.forEach(([x, z, ww, dd, h], wi) => {
    const courses = Math.max(2, Math.round(h / 0.62));
    for (let i = 0; i < courses; i++) {
      // Each course a little shorter than the one below: that taper IS the ruin.
      const shrink = 1 - (i / courses) * (0.15 + r(wi * 7 + i) * 0.55);
      parts.push(
        paint(
          at(
            new THREE.BoxGeometry(ww * (ww > dd ? shrink : 1), 0.6, dd * (dd > ww ? shrink : 1)),
            x + (r(wi * 5 + i) - 0.5) * 0.18,
            0.25 + i * 0.6,
            z + (r(wi * 3 + i) - 0.5) * 0.18,
          ),
          i % 2 ? STONE : STONE_DARK,
        ),
      );
    }
  });
  // The arch that is still standing, which is why you can see it from the reeds.
  for (const s of [-1, 1]) {
    parts.push(paint(at(new THREE.BoxGeometry(0.75, 4.6, 0.8), s * 1.5, 2.3, d / 2 - 0.4), STONE));
  }
  parts.push(paint(at(new THREE.BoxGeometry(3.9, 0.8, 0.9), 0, 4.9, d / 2 - 0.4), STONE_DARK));
  parts.push(paint(at(new THREE.BoxGeometry(2.4, 0.5, 0.85).rotateZ(0.06), 0, 5.5, d / 2 - 0.4), STONE));
  // Fallen blocks in the grass.
  for (let i = 0; i < 5; i++) {
    parts.push(
      paint(
        at(new THREE.BoxGeometry(1.1, 0.55, 0.9).rotateY(r(i + 60) * 3), (r(i + 70) - 0.5) * w, 0.25, (r(i + 80) - 0.2) * d * 0.7),
        i % 2 ? STONE : STONE_DARK,
      ),
    );
  }
  parts.push(paint(at(new THREE.CylinderGeometry(0.42, 0.5, 2.1, 8).rotateZ(1.42), w * 0.25, 0.5, -d * 0.1), "#9a9182"));
  return merge(parts);
}

/** A beacon tower on an outcrop: the tallest built thing in the realm, and it is lit. */
function towerGeo(r: Rnd): THREE.BufferGeometry {
  const h = 6.0 + r(1) * 1.8;
  const parts: THREE.BufferGeometry[] = [
    paint(at(new THREE.CylinderGeometry(2.5, 2.9, 0.7, 9), 0, 0.25, 0), STONE_DARK),
    paint(at(new THREE.CylinderGeometry(1.75, 2.15, h, 9), 0, h / 2 + 0.5, 0), STONE),
    paint(at(new THREE.CylinderGeometry(2.25, 1.9, 0.6, 9), 0, h + 0.8, 0), STONE_DARK),
    paint(at(new THREE.BoxGeometry(1.15, 2.0, 0.5), 0, 1.5, 2.0), TIMBER_DARK),
    paint(at(new THREE.BoxGeometry(0.5, 0.9, 0.3), 0, h * 0.6, 1.9), "#3d3a33"),
  ];
  // Merlons, so the top reads as a tower and not as a chimney.
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    parts.push(paint(at(new THREE.BoxGeometry(0.62, 0.8, 0.62).rotateY(a), Math.cos(a) * 1.95, h + 1.45, Math.sin(a) * 1.95), STONE));
  }
  // The brazier. A fire on a hill is the oldest "come here" there is.
  parts.push(paint(at(new THREE.CylinderGeometry(0.85, 0.6, 0.7, 8), 0, h + 1.6, 0), "#4a4238"));
  parts.push(paint(at(new THREE.ConeGeometry(0.72, 1.5, 7), 0, h + 2.6, 0), EMBER));
  parts.push(paint(at(new THREE.ConeGeometry(0.42, 1.0, 6), 0, h + 3.2, 0), "#ffe08a"));
  // A rough stair spiralling up the outside, so it plainly CAN be climbed even though it cannot.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 3.1;
    parts.push(
      paint(at(new THREE.BoxGeometry(1.1, 0.26, 0.7).rotateY(a), Math.cos(a) * 2.2, 0.9 + i * 0.6, Math.sin(a) * 2.2), STONE_DARK),
    );
  }
  return merge(parts);
}

type Design = {
  geo: (r: Rnd) => THREE.BufferGeometry;
  /** Footprint the hero is stopped by, and the box that can hide him from the camera. */
  solid: { r: number; h: number } | null;
  /** How high the name board hangs. See `BOARD_OUT` for why it is never much higher than this. */
  board: number;
  /** True when the thing has to be turned to face the water. */
  facesWater: boolean;
};

const DESIGNS: Record<Landmark["kind"], Design | null> = {
  place: null, // the five authored places are furnished by hand and are not touched
  summit: { geo: cairnGeo, solid: { r: 2.2, h: 5.2 }, board: 3.9, facesWater: false },
  deepwood: { geo: hutGeo, solid: { r: 2.6, h: 3.2 }, board: 3.9, facesWater: false },
  tarn: { geo: stonesGeo, solid: null, board: 3.9, facesWater: false },
  cove: { geo: jettyGeo, solid: null, board: 3.9, facesWater: true },
  mire: { geo: ruinGeo, solid: { r: 3.4, h: 2.6 }, board: 3.9, facesWater: false },
  outcrop: { geo: towerGeo, solid: { r: 2.3, h: 8.5 }, board: 3.9, facesWater: false },
};

/**
 * How far south of the thing itself the name board stands, and why it is not over the top of it.
 *
 * The camera looks down at forty-three degrees from twenty-one units back, and at that pitch the
 * top of the frame at the hero's own position is about twelve units up. A board floating over a
 * thirteen-unit tower is therefore a board nobody ever sees — which is precisely what the first
 * version did: walk to Split Rock and the name is off the top of the screen.
 *
 * So it stands where a sign stands: at head height, a few strides out on the side the child
 * arrives from. It is still a sprite, so it is square to the camera however the boom is swung.
 */
const BOARD_OUT = 6.2;

/* --------------------------------------------------------------- the board */

/**
 * The name, on a board.
 *
 * The one piece of text in the realm, and it earns its place: the generator names these spots,
 * and a name a child never sees is a name that does not exist. A canvas texture on a sprite, so
 * it is always square to the camera and always readable however the child has swung the boom —
 * a board modelled flat would be edge-on half the time, which is the same as not being there.
 */
function boardTexture(name: string, sub: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  const round = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  ctx.fillStyle = "rgba(38, 26, 16, 0.82)";
  round(6, 10, 500, 140, 22);
  ctx.fill();
  ctx.strokeStyle = "#c9a35f";
  ctx.lineWidth = 5;
  round(6, 10, 500, 140, 22);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffeec2";
  ctx.font = "bold 62px Georgia, serif";
  ctx.fillText(name, 256, 78, 460);
  ctx.fillStyle = "#d8c49a";
  ctx.font = "italic 30px Georgia, serif";
  ctx.fillText(sub, 256, 122, 470);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  return t;
}

/* ------------------------------------------------------------------ colliders */

/**
 * What a child is stopped by, and what can hide them, at the built places.
 *
 * Built once with the world, because nothing here ever moves — so these go on the front of the
 * same arrays the village fills, ahead of the wilderness's own, and the frame loop never learns
 * that there is more than one kind of thing in them.
 */
export function landmarkColliders(world: RealmWorld): { solids: Collider[]; occluders: Collider[] } {
  const solids: Collider[] = [];
  const occluders: Collider[] = [];
  for (const l of world.landmarks) {
    const design = DESIGNS[l.kind];
    if (!design?.solid) continue;
    const { r, h } = design.solid;
    solids.push({ x: l.position.x, z: l.position.z, hw: r, hd: r, round: true, base: l.y - 1, top: l.y + h });
    occluders.push({ x: l.position.x, z: l.position.z, hw: r + 0.4, hd: r + 0.4, round: true, base: l.y - 1, top: l.y + h + 1.2 });
  }
  return { solids, occluders };
}

/* --------------------------------------------------------------- the scene */

/** Which way the water is, so a jetty runs out into it rather than up the beach. */
function waterYaw(world: RealmWorld, l: Landmark): number {
  let best = 0;
  let deepest = Infinity;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const h = world.heightAt(l.position.x + Math.cos(a) * 14, l.position.z + Math.sin(a) * 14);
    if (h < deepest) {
      deepest = h;
      best = a;
    }
  }
  // The models are authored running along +x, and three's yaw turns +x towards +z at -angle.
  return -best;
}

export function RealmLandmarks({ world }: { world: RealmWorld }) {
  const mat = useMemo(() => litMaterial(), []);
  const built = useMemo(() => {
    const out: { l: Landmark; geo: THREE.BufferGeometry | null; yaw: number; board: THREE.Texture; boardY: number }[] = [];
    for (const l of world.landmarks) {
      const design = DESIGNS[l.kind];
      const r = (k: number) => hash(l.id + l.name, k * 2654435761);
      const geo = design ? design.geo(r) : null;
      out.push({
        l,
        geo,
        yaw: design?.facesWater ? waterYaw(world, l) : r(99) * Math.PI * 2,
        board: boardTexture(l.name, l.line),
        // The authored places have their own furniture and it is head height, so their board
        // hangs low enough to read as a sign in the village rather than a kite over it.
        boardY: design ? design.board : 5.2,
      });
    }
    return out;
  }, [world]);

  useEffect(
    () => () => {
      for (const b of built) {
        b.geo?.dispose();
        b.board.dispose();
      }
      mat.dispose();
    },
    [built, mat],
  );

  return (
    <>
      {built.map(({ l, geo, yaw, board, boardY }) => (
        <group key={l.id} position={[l.position.x, l.y, l.position.z]}>
          {geo && <mesh geometry={geo} material={mat} rotation={[0, yaw, 0]} castShadow receiveShadow />}
          {/* 6.2 units wide, not the 9.6 it was first drawn at: a board a child can read from
              sixty units away is a board that fills a quarter of the screen when they arrive. */}
          <sprite position={[0, boardY, BOARD_OUT]} scale={[6.2, 1.94, 1]}>
            <spriteMaterial map={board} transparent depthWrite={false} toneMapped={false} />
          </sprite>
        </group>
      ))}
    </>
  );
}
