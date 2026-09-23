"use client";

/**
 * THE TROUBLES, in the world: the figures, and the frame loop that runs `lib/realm3d/troubles3d`.
 *
 * Mounted by one line in `spike-scene.tsx`, after the camera rig (so the markers project from
 * this frame's camera) and before the HUD driver (so a charge the driver begins is locked onto
 * its trouble on the next frame, before it releases). Every frame, unless the game is paused:
 *
 *   1. lock new charges onto the trouble the child meant, and turn the child to face it;
 *   2. step the field — wake, sleep, drift, chase, bump, and every live spell against every
 *      trouble;
 *   3. hand the frame's events to the HUD, spark a clearing, push a bumped child back;
 *   4. pose the figures, then write each marker and map dot through the `TroubleBus`.
 *
 * The figures are a fixed pool: every slot holds all six models (three kinds, two tones) built
 * once from shared geometry, and a frame only toggles which one is visible. Nothing in the frame
 * loop allocates.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Prop, WorldLayout } from "@/lib/realm/layout";
import type { TroubleKind, TroubleSkin } from "@/lib/realm/spells/troubles";
import { MANA_MAX, type Caster } from "@/lib/realm3d/casting";
import { castlePlan } from "@/lib/realm3d/castle-plan";
import { HERO_RADIUS, overlaps, slideMove, type Collider } from "@/lib/realm3d/collision";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import { makeScreenPoint, projectPoint } from "@/lib/realm3d/project";
import { shoreMove } from "@/lib/realm3d/shore";
import { beginCastFx, spawnFx, type FxSlot } from "@/lib/realm3d/spell-fx";
import { resolveSpell } from "@/lib/utils/spell-catalog";
import {
  hideTroublePlate,
  paintTroubleLabel,
  paintTroubleMark,
  paintTroublePips,
  paintTroublePlate,
  type TroubleBus,
} from "@/lib/realm3d/trouble-bus";
import {
  BODY_RADIUS,
  BODY_TOP,
  DYING_MS,
  KNOCK_SPEED,
  TROUBLE_POOL,
  makeField,
  planHomes,
  rehomeField,
  statusShown,
  stepField,
  trackAim,
  troubleName,
  type FieldInput,
  type Mover,
  type Trouble3,
} from "@/lib/realm3d/troubles3d";
import { WALK_HALF, type RealmWorld } from "@/lib/realm3d/worldgen";
import { at, litMaterial, merge, paint } from "./geo-kit";

/* ------------------------------------------------------------------ figures */

type Figure = { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null; soft: boolean; ghost?: boolean };
type FigureKey = `${TroubleKind}:${TroubleSkin}`;
const KINDS: readonly TroubleKind[] = ["fog", "cursed-stone", "shadow-blob"];
const SKINS: readonly TroubleSkin[] = ["gentle", "monsters"];

/** A puff of fog: a low-poly ball, squashed a little so a bank reads as lying on the ground. */
function puff(r: number, x: number, y: number, z: number, hex: string): THREE.BufferGeometry {
  return at(paint(new THREE.IcosahedronGeometry(r, 1).scale(1, 0.82, 1), hex), x, y, z);
}

function ball(r: number, x: number, y: number, z: number, hex: string, detail = 1): THREE.BufferGeometry {
  return at(paint(new THREE.IcosahedronGeometry(r, detail), hex), x, y, z);
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: string, ry = 0, rz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  return at(paint(g, hex), x, y, z);
}

/** GENTLE fog: a soft bank of pale puffs with a lavender underside and a few sparkles in it. */
function fogBank(): Figure {
  return {
    soft: true,
    body: merge([
      puff(0.8, -0.9, 0.55, 1.0, "#e6e9f6"),
      puff(0.7, 1.2, 0.5, -0.9, "#e1e4f4"),
      puff(1.15, 0, 1.25, 0, "#eef2f9"),
      puff(0.9, -1.15, 0.95, 0.3, "#e3e8f4"),
      puff(0.95, 1.05, 1.05, -0.2, "#e8ecf6"),
      puff(0.8, 0.3, 1.9, 0.15, "#f7f9fd"),
      puff(0.8, -0.45, 0.75, -0.8, "#d9dcf2"),
      puff(0.72, 0.65, 0.65, 0.8, "#dde1f3"),
      puff(0.55, -1.75, 0.6, -0.35, "#d6d2f0"),
      puff(0.58, 1.8, 0.58, 0.4, "#d6d2f0"),
    ]).scale(1.3, 1.1, 1.3),
    glow: merge([
      at(paint(new THREE.OctahedronGeometry(0.16), "#c4b5fd"), -0.6, 1.5, 0.9),
      at(paint(new THREE.OctahedronGeometry(0.12), "#ddd6fe"), 0.8, 1.9, 0.7),
      at(paint(new THREE.OctahedronGeometry(0.14), "#c4b5fd"), 0.2, 0.9, 1.1),
    ]).scale(1.3, 1.1, 1.3),
  };
}

/** MONSTERS fog: a mist-wisp — a friendly little ghost with a wavy tail. */
function mistWisp(): Figure {
  const profile: THREE.Vector2[] = [];
  const pts: [number, number][] = [[0.0, 0.3], [0.55, 0.45], [0.8, 0.85], [0.92, 1.4], [0.88, 1.9], [0.7, 2.3], [0.4, 2.55], [0.0, 2.62]];
  for (const [r, y] of pts) profile.push(new THREE.Vector2(r, y));
  const body = paint(new THREE.LatheGeometry(profile, 9), "#eef4fb");
  const tails = [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2;
    return at(paint(new THREE.ConeGeometry(0.22, 0.55, 5).rotateX(Math.PI), "#e2eaf5"), Math.sin(a) * 0.5, 0.25, Math.cos(a) * 0.5);
  });
  const arms = [-1, 1].map((s) => at(paint(new THREE.ConeGeometry(0.2, 0.7, 5).rotateZ(-s * 1.2), "#e8eff8"), s * 0.95, 1.35, 0.1));
  const eyes = [-1, 1].map((s) => ball(0.13, s * 0.3, 1.85, 0.8, "#1e293b"));
  const mouth = at(paint(new THREE.TorusGeometry(0.11, 0.045, 5, 10), "#1e293b"), 0, 1.5, 0.86);
  return {
    soft: false,
    ghost: true,
    body: merge([body, ...tails, ...arms, ...eyes, mouth]),
    glow: merge([ball(0.05, -0.26, 1.9, 0.9, "#ffffff"), ball(0.05, 0.34, 1.9, 0.9, "#ffffff")]),
  };
}

/** GENTLE stone: a leaning standing stone, with a purple curse glowing in its cracks. */
function cursedStone(): Figure {
  const stone = new THREE.CylinderGeometry(0.5, 0.78, 2.9, 6, 2);
  stone.rotateZ(0.06);
  const body = merge([
    at(paint(stone, "#a3aab8"), 0, 1.45, 0),
    at(paint(new THREE.DodecahedronGeometry(0.52), "#959cab"), 0.05, 2.95, 0),
    ball(0.32, 0.85, 0.2, 0.3, "#6b7280", 0),
    ball(0.26, -0.8, 0.16, -0.25, "#6b7280", 0),
    ball(0.2, -0.3, 0.12, 0.85, "#5f6675", 0),
    at(paint(new THREE.CylinderGeometry(1.25, 1.35, 0.12, 8), "#3f3a52"), 0, 0.04, 0),
  ]);
  // The runes: a zigzag down the front and a ring, standing just proud of the face.
  const glow = merge([
    box(0.09, 0.62, 0.06, -0.08, 2.3, 0.66, "#d8b4fe", 0, 0.5),
    box(0.09, 0.6, 0.06, 0.1, 1.78, 0.7, "#d8b4fe", 0, -0.5),
    box(0.09, 0.55, 0.06, -0.06, 1.25, 0.74, "#d8b4fe", 0, 0.45),
    at(paint(new THREE.TorusGeometry(0.2, 0.05, 5, 12), "#e9d5ff"), 0.02, 0.72, 0.78),
  ]);
  body.scale(1.3, 1.3, 1.3);
  glow.scale(1.3, 1.3, 1.3);
  return { soft: false, body, glow };
}

/** MONSTERS stone: a gargoyle crouched on its plinth — horns, stubby wings, yellow eyes. */
function gargoyle(): Figure {
  const wing = (s: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(s * 1.25, 0.55);
    shape.lineTo(s * 1.05, -0.2);
    shape.lineTo(s * 0.8, 0.1);
    shape.lineTo(s * 0.55, -0.35);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
    return at(paint(g, "#6f7681"), s * 0.35, 1.55, -0.35);
  };
  const body = merge([
    box(1.5, 0.45, 1.3, 0, 0.22, 0, "#5d636d"),
    box(1.05, 1.1, 0.9, 0, 1.0, -0.05, "#8b929c"),
    box(0.85, 0.75, 0.8, 0, 1.9, 0.12, "#949ba5"),
    box(0.5, 0.28, 0.3, 0, 1.72, 0.55, "#7c838d"),
    at(paint(new THREE.ConeGeometry(0.13, 0.5, 5).rotateZ(0.4), "#5d636d"), -0.3, 2.45, 0.1),
    at(paint(new THREE.ConeGeometry(0.13, 0.5, 5).rotateZ(-0.4), "#5d636d"), 0.3, 2.45, 0.1),
    box(0.32, 0.5, 0.35, -0.38, 0.6, 0.45, "#7c838d"),
    box(0.32, 0.5, 0.35, 0.38, 0.6, 0.45, "#7c838d"),
    box(0.5, 0.06, 0.06, 0, 1.62, 0.71, "#374151"),
    wing(-1),
    wing(1),
  ]);
  const glow = merge([box(0.16, 0.12, 0.06, -0.2, 2.0, 0.53, "#fbbf24"), box(0.16, 0.12, 0.06, 0.2, 2.0, 0.53, "#fbbf24")]);
  body.scale(1.3, 1.3, 1.3);
  glow.scale(1.3, 1.3, 1.3);
  return { soft: false, body, glow };
}

/** GENTLE shadow: a soft indigo blob with two big pale friendly eyes and a little curl on top. */
function shadow(): Figure {
  const body = merge([
    at(paint(new THREE.IcosahedronGeometry(1.0, 2).scale(1, 0.85, 0.95), "#3b3490"), 0, 0.85, 0),
    at(paint(new THREE.ConeGeometry(0.22, 0.55, 6).rotateZ(-0.5), "#453d9e"), 0.15, 1.75, 0),
    ball(0.2, -0.55, 0.18, 0.35, "#332c80"),
    ball(0.2, 0.55, 0.18, 0.35, "#332c80"),
  ]);
  const glow = merge([
    ball(0.21, -0.32, 1.05, 0.82, "#e0e7ff"),
    ball(0.21, 0.32, 1.05, 0.82, "#e0e7ff"),
    ball(0.07, -0.3, 1.08, 1.02, "#312e81"),
    ball(0.07, 0.34, 1.08, 1.02, "#312e81"),
  ]);
  return { soft: false, body, glow };
}

/** MONSTERS shadow: a green slime blob, googly-eyed, with a wobbly zigzag grin. Silly, not scary. */
function slime(): Figure {
  const body = merge([
    at(paint(new THREE.IcosahedronGeometry(1.0, 2).scale(1.05, 0.8, 1.0), "#22c55e"), 0, 0.8, 0),
    at(paint(new THREE.IcosahedronGeometry(0.42, 1).scale(1, 0.6, 1), "#86efac"), -0.3, 1.38, -0.1),
    ball(0.23, 0.75, 0.2, 0.45, "#16a34a"),
    ball(0.2, -0.8, 0.18, 0.35, "#16a34a"),
    ball(0.25, -0.33, 1.12, 0.78, "#f8fafc"),
    ball(0.25, 0.33, 1.12, 0.78, "#f8fafc"),
    ball(0.11, -0.3, 1.12, 1.0, "#052e16"),
    ball(0.11, 0.36, 1.14, 1.0, "#052e16"),
    box(0.2, 0.06, 0.06, -0.24, 0.66, 0.97, "#052e16", 0, 0.6),
    box(0.2, 0.06, 0.06, -0.08, 0.66, 0.99, "#052e16", 0, -0.6),
    box(0.2, 0.06, 0.06, 0.08, 0.66, 0.99, "#052e16", 0, 0.6),
    box(0.2, 0.06, 0.06, 0.24, 0.66, 0.97, "#052e16", 0, -0.6),
  ]);
  return { soft: false, body, glow: null };
}

function buildFigures(): Record<FigureKey, Figure> {
  return {
    "fog:gentle": fogBank(),
    "fog:monsters": mistWisp(),
    "cursed-stone:gentle": cursedStone(),
    "cursed-stone:monsters": gargoyle(),
    "shadow-blob:gentle": shadow(),
    "shadow-blob:monsters": slime(),
  };
}

/** The glow sprite's colour, per figure: what the trouble "feels like" from across a field. */
const GLOW: Record<FigureKey, string> = {
  "fog:gentle": "#c7cff7",
  "fog:monsters": "#dbeafe",
  "cursed-stone:gentle": "#a855f7",
  "cursed-stone:monsters": "#f59e0b",
  "shadow-blob:gentle": "#6366f1",
  "shadow-blob:monsters": "#4ade80",
};

const STATUS_COLOR: Record<string, string> = {
  chilled: "#bae6fd",
  slowed: "#c4b5fd",
  bound: "#fcd34d",
};

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

/** A soft round patch, dark in the middle and gone at the rim: the ground shadow under fog and blobs. */
function shadowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------------------------------------------------------- the world */

/** Distance from a point to a segment, for keeping homes off the roads. */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len2));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/**
 * Where a trouble may stand: dry ground on the island, off every road and track, off the castle's
 * pegged-out footprint, and clear of every building, landmark stone and big tree. Used once, to
 * place the homes.
 */
function freeGround(world: RealmWorld, layout: WorldLayout, solids: readonly Collider[], open: boolean) {
  const castle = layout.props.find((p) => p.kind === "castle");
  const plan = castle ? castlePlan(layout.castleType) : null;
  const paths: Prop[] = layout.props.filter((p) => p.kind === "path");
  const trails = layout.terrain.filter((t) => t.kind === "trail");
  const scenery = layout.scenery;
  return (x: number, z: number, r: number): boolean => {
    if (Math.abs(x) > WALK_HALF - 12 || Math.abs(z) > WALK_HALF - 12) return false;
    if (world.waterLevelAt(x, z) - world.heightAt(x, z) > 0.05) return false;
    if (castle && plan) {
      const b = plan.bounds;
      const cx = castle.position.x;
      const cz = castle.position.z;
      if (x > cx + b.x0 - 6 && x < cx + b.x1 + 6 && z > cz + b.z0 - 6 && z < cz + b.z1 + 6) return false;
    }
    for (const road of world.roads) {
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1];
        const b = road.points[i];
        if (segDist(x, z, a.x, a.z, b.x, b.z) < road.halfWidth + r + 2.5) return false;
      }
    }
    for (const t of trails) if (Math.hypot(x - t.position.x, z - t.position.z) < Math.max(t.size.w, t.size.d) / 2 + r + 2) return false;
    for (const p of paths) if (Math.hypot(x - p.position.x, z - p.position.z) < Math.max(p.size.w, p.size.d) / 2 + r + 2) return false;
    for (const c of solids) if (overlaps(c, x, z, r + 0.5)) return false;
    if (world.slopeAt(x, z) > 0.7) return false;
    // Open ground, not the middle of a wood: a trouble a child cannot see for trees is not
    // there at all, and a camera following them in would bury itself in the canopy.
    let blocked = false;
    let trees = 0;
    world.forEachPropNear(x, z, r + 8, (p) => {
      const d = Math.hypot(p.x - x, p.z - z);
      if (p.solid && d < r + 1 + p.scale) blocked = true;
      if ((p.layer === "canopy" || p.layer === "feature") && d < r + 8) trees++;
    });
    for (const s of scenery) {
      if (s.variant !== "oak" && s.variant !== "pine") continue;
      if (Math.hypot(s.position.x - x, s.position.z - z) < r + 8) trees++;
    }
    return !blocked && (!open || trees <= 3);
  };
}

/* ---------------------------------------------------------------- component */

export function Troubles({
  tbus,
  bus,
  pool,
  caster,
  heroRef,
  aimRef,
  solids,
  world,
  layout,
  calm: calmProp,
}: {
  tbus: TroubleBus;
  bus: HudBus;
  pool: FxSlot[];
  caster: Caster;
  heroRef: React.RefObject<THREE.Vector3>;
  aimRef: React.RefObject<number>;
  solids: Collider[];
  world: RealmWorld;
  layout: WorldLayout;
  calm: boolean;
}) {
  const { camera, size } = useThree();
  // Development only: `?calm=1` shows the calm troubles on an account whose profile is not calm.
  const [devCalm] = useState(
    () => process.env.NODE_ENV !== "production" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("calm") === "1",
  );
  const calm = calmProp || devCalm;

  const unfinished = useMemo(() => layout.props.filter((p) => p.kind === "foundation").length, [layout]);
  const homes = useMemo(
    () =>
      planHomes({
        seed: world.seed,
        landmarks: world.landmarks,
        unfinished,
        spawn: layout.spawn,
        free: freeGround(world, layout, solids, true),
        fallback: freeGround(world, layout, solids, false),
      }),
    // Solids only matter for placing, once; the array's identity is stable for the World's life.
    [world, layout, unfinished, solids],
  );
  // ONE field for the visit. A building finishing re-plans the homes; the frame loop hands the
  // new plan to `rehomeField`, which keeps every trouble that is out exactly where it stands —
  // it used to be a new field, and every awake trouble blinked out at once.
  const [field] = useState(() => makeField(homes));
  const planned = useRef(homes);
  // Development only: the field, for a screenshot script to find a home and read what happened.
  // `__realmCastAs(element, form, modifier?)` begins a cast of ANY catalog spell at the walker,
  // through the same charge, lock and release as a key press, so every shape can be looked at
  // on an account that owns only a bolt. No mana, no cooldown, nothing saved.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __realmTroubles?: unknown; __realmCastAs?: unknown };
    w.__realmTroubles = field;
    w.__realmCastAs = (elementId: string, formId: string, modifierId: string | null = null) => {
      const spell = resolveSpell({ elementId, formId, modifierId });
      const p = heroRef.current;
      if (spell) beginCastFx(pool, spell, { x: p.x, y: p.y + 1.35, z: p.z }, 0, -1);
      return spell ? spell.shape : null;
    };
    return () => {
      if (w.__realmTroubles === field) delete w.__realmTroubles;
      delete w.__realmCastAs;
    };
  }, [field, pool, heroRef]);

  const figures = useMemo(() => buildFigures(), []);
  const lit = useMemo(() => litMaterial(), []);
  const soft = useMemo(() => {
    // Fog is lit from inside a little and rounded rather than faceted, so it reads as a bank of
    // mist and not as a heap of grey boulders.
    const m = litMaterial();
    m.transparent = true;
    m.opacity = 0.8;
    m.depthWrite = false;
    m.flatShading = false;
    m.emissive.set("#d9d6f5");
    m.emissiveIntensity = 0.55;
    return m;
  }, []);
  // The mist-wisp glows faintly from inside, so it reads as a little ghost and not a grey egg.
  const ghost = useMemo(() => {
    const m = litMaterial();
    m.flatShading = false;
    m.emissive.set("#cfe3ff");
    m.emissiveIntensity = 0.5;
    return m;
  }, []);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), []);
  const tex = useMemo(() => glowTexture(), []);
  const ringGeo = useMemo(() => new THREE.TorusGeometry(1, 0.08, 5, 28).rotateX(-Math.PI / 2), []);
  const shadowGeo = useMemo(() => new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), []);
  const shadowTex = useMemo(() => shadowTexture(), []);
  useEffect(
    () => () => {
      shadowGeo.dispose();
      shadowTex.dispose();
    },
    [shadowGeo, shadowTex],
  );
  useEffect(
    () => () => {
      for (const f of Object.values(figures)) {
        f.body.dispose();
        f.glow?.dispose();
      }
      lit.dispose();
      soft.dispose();
      ghost.dispose();
      glowMat.dispose();
      tex.dispose();
      ringGeo.dispose();
    },
    [figures, lit, soft, ghost, glowMat, tex, ringGeo],
  );

  /** Per slot: the slot's group, its six figure groups (KINDS × SKINS order), its glow and its status ring. */
  const groups = useRef<(THREE.Group | null)[]>(new Array(TROUBLE_POOL).fill(null));
  const models = useRef<(THREE.Group | null)[]>(new Array(TROUBLE_POOL * 6).fill(null));
  const glows = useRef<(THREE.Sprite | null)[]>(new Array(TROUBLE_POOL).fill(null));
  const rings = useRef<(THREE.Mesh | null)[]>(new Array(TROUBLE_POOL).fill(null));
  const shadows = useRef<(THREE.Mesh | null)[]>(new Array(TROUBLE_POOL).fill(null));
  const drawn = useRef({ figure: new Int8Array(TROUBLE_POOL).fill(-1), status: new Array<string>(TROUBLE_POOL).fill("") });

  // Frame scratch, held in refs: the frame loop writes these, and a render's value is not its to change.
  const mvp = useRef(new THREE.Matrix4());
  const point = useRef(makeScreenPoint());
  const scratch = useRef({ a: { x: 0, z: 0 }, b: { x: 0, z: 0 } });
  const levelAt = useMemo(() => (x: number, z: number) => world.waterLevelAt(x, z), [world]);
  const move = useMemo<Mover>(() => {
    const wet = { x: 0, z: 0 };
    return (out, fx, fz, tx, tz, kind) => {
      const cx = tx < -WALK_HALF ? -WALK_HALF : tx > WALK_HALF ? WALK_HALF : tx;
      const cz = tz < -WALK_HALF ? -WALK_HALF : tz > WALK_HALF ? WALK_HALF : tz;
      // Fog may drift over a shallow; the others stay on their feet.
      shoreMove(wet, fx, fz, cx, cz, world.heightAt, levelAt, kind === "fog" ? 1.0 : 0.35);
      slideMove(out, fx, fz, wet.x, wet.z, solids, BODY_RADIUS[kind] * 0.6);
    };
  }, [world, levelAt, solids]);
  const input = useRef<FieldInput>({ dt: 0, heroX: 0, heroZ: 0, calm, move, solids });

  useFrame((state, rawDt) => {
    const p = heroRef.current;
    const dt = Math.min(0.05, rawDt);
    if (planned.current !== homes) {
      planned.current = homes;
      rehomeField(field, homes);
    }
    const inp = input.current;
    inp.calm = calm;
    inp.move = move;
    inp.solids = solids;
    inp.heroX = p.x;
    inp.heroZ = p.z;
    inp.dt = dt;

    /* ---- simulation: nothing moves, respawns or gets hit under a menu ---- */
    if (!bus.paused) {
      const face = trackAim(field, pool);
      if (face === face) aimRef.current = face;
      stepField(field, pool, inp);
      if (field.refund > 0) giveMana(caster, field.refund);
      for (let i = 0; i < field.nEvents; i++) {
        const e = field.events[i];
        if (e.kind === "cleared") {
          // The satisfying moment: a gold ring bursting out of the ground and a glow in the
          // trouble's own colour going up where it stood.
          const gy = world.heightAt(e.x, e.z);
          spawnFx(pool, { kind: "ring", color: "#ffd66b", x: e.x, y: gy, z: e.z, dx: 0, dz: 1, size: 4.2, life: 0.9 });
          spawnFx(pool, { kind: "aura", color: GLOW[`${e.trouble}:${tbus.skin}`], x: e.x, y: gy, z: e.z, dx: 0, dz: 1, size: 2.6, life: 1.0 });
        }
        const home = field.homes[e.home];
        tbus.onEvent(e, home?.placeName ?? null, home?.id ?? null);
      }
      // A bump: the child is pushed back, through the same water and walls as a walk.
      if (field.now < field.knock.until) {
        const s = scratch.current;
        const step = KNOCK_SPEED * dt;
        shoreMove(s.a, p.x, p.z, p.x + field.knock.dx * step, p.z + field.knock.dz * step, world.heightAt, levelAt);
        slideMove(s.b, p.x, p.z, s.a.x, s.a.z, solids, HERO_RADIUS);
        p.x = Math.max(-WALK_HALF, Math.min(WALK_HALF, s.b.x));
        p.z = Math.max(-WALK_HALF, Math.min(WALK_HALF, s.b.z));
      }
      // A standing stone is a stone: the child walks round it, not through it.
      for (const t of field.troubles) {
        if (!t.live || t.dying || t.kind !== "cursed-stone") continue;
        const dx = p.x - t.x;
        const dz = p.z - t.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const min = BODY_RADIUS["cursed-stone"] * 0.8 + HERO_RADIUS;
        if (d < min && d > 0.001) {
          p.x = t.x + (dx / d) * min;
          p.z = t.z + (dz / d) * min;
        }
      }
    }

    /* ---- the figures -------------------------------------------------- */
    const skin = tbus.skin;
    const skinIndex = skin === "gentle" ? 0 : 1;
    const time = state.clock.elapsedTime;
    const now = field.now;
    for (let i = 0; i < TROUBLE_POOL; i++) {
      const g = groups.current[i];
      if (!g) continue;
      const t = field.troubles[i];
      if (!t.live) {
        if (g.visible) g.visible = false;
        const shade = shadows.current[i];
        if (shade && shade.visible) shade.visible = false;
        continue;
      }
      g.visible = true;
      const which = KINDS.indexOf(t.kind) * 2 + skinIndex;
      if (drawn.current.figure[i] !== which) {
        drawn.current.figure[i] = which;
        for (let m = 0; m < 6; m++) {
          const model = models.current[i * 6 + m];
          if (model) model.visible = m === which;
        }
        const sprite = glows.current[i];
        if (sprite) (sprite.material as THREE.SpriteMaterial).color.set(GLOW[`${t.kind}:${skin}`]);
      }
      poseTrouble(g, t, now, time, calm, world, p.x, p.z);
      const shade = shadows.current[i];
      if (shade) {
        // A soft dark patch on the ground under fog and blobs (a stone has its own dark disc):
        // mist casts no real shadow, and without one a fog bank looked afloat. A blob's patch
        // shrinks as it hops, which is what makes a hop read as leaving the ground.
        const kinded = t.kind !== "cursed-stone";
        if (shade.visible !== kinded) shade.visible = kinded;
        if (kinded) {
          const floor = Math.max(world.heightAt(t.x, t.z), t.kind === "fog" ? world.waterLevelAt(t.x, t.z) : -1e9);
          const lift = g.position.y - floor;
          const fade = t.dying ? Math.max(0, 1 - (now - t.diedAt) / (DYING_MS * 0.6)) : 1;
          const r = (t.kind === "fog" ? 3.9 : 1.35) * Math.max(0.55, 1 - lift * 0.35) * (0.4 + 0.6 * fade);
          shade.position.set(t.x, floor + 0.07, t.z);
          shade.scale.set(r, r, 1);
          (shade.material as THREE.MeshBasicMaterial).opacity = (t.kind === "fog" ? 0.6 : 0.5) * fade;
        }
      }
      const sprite = glows.current[i];
      if (sprite) {
        const flash = Math.max(0, 1 - (now - t.hitAt) / 260);
        const dying = t.dying ? Math.min(1, (now - t.diedAt) / DYING_MS) : 0;
        const pulse = calm ? 0 : Math.sin(time * 2.4 + i) * 0.08;
        (sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.42 + pulse + flash * 0.6 + dying * 0.5);
        const sc = (t.kind === "fog" ? 5.2 : 3.6) * (1 + flash * 0.5 + dying * 0.8);
        sprite.scale.set(sc, sc, 1);
      }
      const ring = rings.current[i];
      if (ring) {
        const st = t.dying ? null : statusShown(t, now);
        const key = st ?? "";
        if (drawn.current.status[i] !== key) {
          drawn.current.status[i] = key;
          ring.visible = st !== null && STATUS_COLOR[st] !== undefined;
          if (ring.visible) (ring.material as THREE.MeshBasicMaterial).color.set(STATUS_COLOR[key]);
        }
        if (ring.visible) {
          const r = BODY_RADIUS[t.kind] + 0.35;
          ring.scale.set(r, 1, r);
          ring.rotation.y = calm ? 0 : time * 1.5;
        }
      }
    }

    /* ---- markers and map dots ----------------------------------------- */
    camera.updateMatrixWorld();
    const m = mvp.current;
    m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const e = m.elements;
    const pt = point.current;
    for (let i = 0; i < TROUBLE_POOL; i++) {
      const t = field.troubles[i];
      if (!t.live || t.dying) {
        hideTroublePlate(tbus, i);
        paintTroubleMark(tbus, i, "");
        continue;
      }
      paintTroubleMark(tbus, i, `translate(${t.x.toFixed(1)} ${t.z.toFixed(1)})`);
      const g = groups.current[i];
      const y = (g ? g.position.y : t.y) + BODY_TOP[t.kind] + 0.35;
      const ok = projectPoint(pt, e, t.x, y, t.z, size.width, size.height);
      // Near enough to matter, and in front of the lens: the marker. Past fifty-five units a
      // trouble is the map's business, not the screen's.
      if (!ok || pt.depth > 62 || pt.x < -40 || pt.x > size.width + 40 || pt.y < -20 || pt.y > size.height + 40) {
        hideTroublePlate(tbus, i);
        continue;
      }
      const fade = pt.depth < 48 ? 1 : Math.max(0, 1 - (pt.depth - 48) / 14);
      const scale = Math.max(0.88, Math.min(1.15, 24 / pt.depth));
      paintTroubleLabel(tbus, i, t.kind, skin, troubleName(t.kind, skin));
      paintTroublePips(tbus, i, t.hitsLeft, t.maxHits);
      paintTroublePlate(
        tbus,
        i,
        `translate3d(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px,0) translate(-50%,-100%) scale(${scale.toFixed(2)})`,
        fade.toFixed(2),
      );
    }
  });

  return (
    <>
      {Array.from({ length: TROUBLE_POOL }, (_, i) => (
        <group key={i} ref={(el) => { groups.current[i] = el; }} visible={false}>
          {KINDS.map((kind, k) =>
            SKINS.map((skin, s) => {
              const f = figures[`${kind}:${skin}`];
              return (
                <group key={`${kind}:${skin}`} ref={(el) => { models.current[i * 6 + k * 2 + s] = el; }} visible={false}>
                  <mesh geometry={f.body} material={f.soft ? soft : f.ghost ? ghost : lit} castShadow={!f.soft} />
                  {f.glow && <mesh geometry={f.glow} material={glowMat} />}
                </group>
              );
            }),
          )}
          <sprite ref={(el) => { glows.current[i] = el; }} position={[0, 1.2, 0]}>
            <spriteMaterial map={tex} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </sprite>
          <mesh ref={(el) => { rings.current[i] = el; }} geometry={ringGeo} position={[0, 0.12, 0]} visible={false}>
            <meshBasicMaterial transparent opacity={0.85} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: TROUBLE_POOL }, (_, i) => (
        <mesh key={`shade-${i}`} ref={(el) => { shadows.current[i] = el; }} geometry={shadowGeo} visible={false} renderOrder={1}>
          <meshBasicMaterial map={shadowTex} color="#1c1633" transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** Mana a `mended` spell won back, into the caster, never past full. */
function giveMana(c: Caster, n: number): void {
  c.mana = Math.min(MANA_MAX, c.mana + n);
}

/**
 * Where a trouble stands and how it moves this frame, as a pose on its group: the ground (or the
 * water, for fog), the bob, the blob's hop, the recoil's bigger hop, the flinch of a hit, and the
 * pop of a clearing. `calm` keeps every one of them small.
 */
function poseTrouble(g: THREE.Group, t: Trouble3, now: number, time: number, calm: boolean, world: RealmWorld, hx: number, hz: number): void {
  const ground = world.heightAt(t.x, t.z);
  const soft = calm ? 0.3 : 1;
  const hit = Math.max(0, 1 - (now - t.hitAt) / 260);
  let y = ground;
  let sy = 1;
  let sxz = 1;
  switch (t.kind) {
    case "fog": {
      // Seated: the bank's lowest puffs sit in the grass, and the breathing only ever lifts it a
      // hand's width — it used to bob up to a fifth of a unit clear, and read as floating.
      y = Math.max(ground, world.waterLevelAt(t.x, t.z)) + (0.5 + 0.5 * Math.sin(t.phase * 1.3)) * 0.07 * soft;
      const breath = Math.sin(t.phase * 0.9) * 0.05 * soft;
      sxz = 1 + breath;
      sy = 1 - breath;
      g.rotation.y = t.phase * 0.12;
      break;
    }
    case "cursed-stone": {
      // It sits. The gargoyle breathes, very slightly.
      sy = 1 + Math.sin(t.phase * 1.6) * 0.015 * soft;
      g.rotation.y = faceToward(t, hx, hz, 18);
      break;
    }
    case "shadow-blob": {
      const hop = Math.abs(Math.sin(t.phase * 5.5));
      y = ground + hop * 0.42 * soft;
      sy = 1 - (1 - hop) * 0.14 * soft;
      sxz = 1 + (1 - hop) * 0.08 * soft;
      if (now < t.recoilUntil) {
        // The bounce: a real hop, back the way it came.
        const k = 1 - (t.recoilUntil - now) / 450;
        y = ground + Math.sin(k * Math.PI) * 1.4 * (calm ? 0.5 : 1);
      }
      g.rotation.y = faceToward(t, hx, hz, 16);
      break;
    }
  }
  // A hit: a squash and a shiver, over a quarter second.
  if (hit > 0) {
    sy *= 1 - hit * 0.22;
    sxz *= 1 + hit * 0.16;
    g.rotation.z = calm ? 0 : Math.sin(time * 60) * 0.08 * hit;
  } else {
    g.rotation.z = 0;
  }
  // Cleared: a swell, then it shrinks to nothing as it lifts away.
  if (t.dying) {
    const k = Math.min(1, (now - t.diedAt) / DYING_MS);
    const pop = (1 - k * k) * (1 + Math.sin(k * Math.PI) * 0.45);
    sy *= pop;
    sxz *= pop;
    y += k * 1.6;
    if (!calm) g.rotation.y += k * 4;
  }
  g.position.set(t.x, y, t.z);
  g.scale.set(sxz, sy, sxz);
}

/** A face that looks at the child when they are near, and along its way when they are not. */
function faceToward(t: Trouble3, hx: number, hz: number, within: number): number {
  const dx = hx - t.x;
  const dz = hz - t.z;
  return dx * dx + dz * dz < within * within ? Math.atan2(dx, dz) : t.heading;
}
