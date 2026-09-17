import { BUILDINGS } from "@/lib/utils/kingdom";
import { crownForOrdinal } from "@/lib/utils/crown-catalog";
import { BANNER_CAP } from "@/lib/utils/seasons";
import { VILLAGERS, villagerPosition } from "./villagers";
import { seededRng } from "@/lib/utils/drill-generators";

/**
 * Units are abstract; the camera zoom maps them to pixels. The ground is WORLD_SIZE²
 * centered on the origin, and the hero is clamped to it.
 *
 * WORLD_SIZE is the WORLD. VILLAGE_SIZE is the square the village keeps to itself — the
 * old world, unchanged — and it is what anything village-scaled must measure itself
 * against. Scattering across WORLD_SIZE is now a bug: twelve recess gleams spread over
 * 160² would be twelve gleams a child never finds.
 */
export const WORLD_SIZE = 160;
export const VILLAGE_SIZE = 40;

export type Vec2 = { x: number; z: number };
export type PropKind = "castle" | "building" | "foundation" | "path" | "villager" | "barrier" | "banner" | "decor";

/** Which mark the scene draws over a site. Never changes a prop's kind, position, size or solidity. */
export type PropFocus = "objective" | "tracked" | "done" | null;
/** What the villager at a site is doing about it: waiting for you, working, or finished. */
export type VillagerStatus = "objective" | "work" | "built";

export type Prop = {
  id: string;
  kind: PropKind;
  label: string;
  tag?: string; // a second line under the label: "Built" or "2 of 5"
  variant?: string; // decor kind (oak, pine, bush, rock, fence, lantern)
  position: Vec2; // center
  size: { w: number; d: number; h: number }; // footprint width (x), depth (z), height (y)
  color: string;
  solid: boolean; // walkable props (paths, foundations, villagers) are not colliders
  focus?: PropFocus; // a mark the scene draws over a site; additive only, and never read by colliders, spawns or the ceremony
};

/** Progress for one kingdom building, as the deeds overview reports it. */
export type SiteProgress = { id: string; done: number; total: number; complete: boolean };
export type VillagerPlacement = {
  id: string;
  buildingId: string;
  position: Vec2;
  status: VillagerStatus;
  label: string; // the building's name: "Village Well"
  done: number;
  total: number;
};

export type WorldLayout = {
  props: Prop[];
  spawn: Vec2;
  colliders: Prop[];
  villagers: VillagerPlacement[];
  castleType: string;
  /** Ground rectangles outside the village: water, banks, ploughed plots, dirt tracks. Fixed. */
  terrain: TerrainPatch[];
  /** Every tree, rock, reed, fence and lantern in the world, village included. Fixed, and drawn instanced. */
  scenery: Prop[];
};

export const CASTLE_POSITION: Vec2 = { x: 0, z: -14 };
export const SPAWN: Vec2 = { x: 0, z: 15 };
const GATE_Z = 17;

/** Eight castle tiers, tent-sized to towering. Order matches CASTLE_TYPES in the avatar catalog. */
export const CASTLE_FOOTPRINTS: Record<string, { w: number; d: number; h: number }> = {
  campsite: { w: 2, d: 2, h: 1.5 },
  cottage: { w: 3, d: 3, h: 2.5 },
  watchtower: { w: 2.5, d: 2.5, h: 5 },
  keep: { w: 5, d: 4, h: 4 },
  manor: { w: 6, d: 5, h: 4.5 },
  castle: { w: 8, d: 6, h: 6 },
  fortress: { w: 9, d: 7, h: 7 },
  citadel: { w: 10, d: 8, h: 8 },
};

/** Where each kingdom building stands once its deeds are done. Alternating sides of the path. */
export const BUILDING_SLOTS: Record<string, Vec2> = {
  well: { x: -5, z: 8 },
  mill: { x: 6, z: 6 },
  bridge: { x: -7, z: 0 },
  chapel: { x: 7, z: -2 },
  market: { x: -5, z: -6 },
  library: { x: 6, z: -8 },
  watchtower: { x: -9, z: -12 },
  garden: { x: 9, z: -13 },
};

export const BUILDING_COLORS: Record<string, string> = {
  well: "#5b8fb9",
  mill: "#b08a5a",
  bridge: "#8c7a6b",
  chapel: "#d8cfc0",
  market: "#c0563d",
  library: "#6f5a8a",
  watchtower: "#7d7d7d",
  garden: "#5aa55a",
};

const BUILDING_SIZE = { w: 3, d: 3, h: 2.5 };
const WATCHTOWER_SIZE = { w: 2, d: 2, h: 5 };
const CASTLE_COLOR = "#9a9aa8";
const PATH_COLOR = "#c9b27a";
export const FOUNDATION_COLOR = "#6b665a";
const FOUNDATION_H = 0.2;
const VILLAGER_SIZE = { w: 0.9, d: 0.9, h: 1.8 };

export const BANNER_SIZE = { w: 0.4, d: 0.4, h: 1.6 };
/** How far outside the castle footprint a banner pole stands. */
export const BANNER_MARGIN = 0.6;
/** Eight poles, two per side, clockwise from the south-west corner: west side, north, east, south. Factors of the half-footprint. */
const BANNER_POLES: Vec2[] = [
  { x: -1, z: 1 / 3 }, { x: -1, z: -1 / 3 },
  { x: -1 / 3, z: -1 }, { x: 1 / 3, z: -1 },
  { x: 1, z: -1 / 3 }, { x: 1, z: 1 / 3 },
  { x: 1 / 3, z: 1 }, { x: -1 / 3, z: 1 },
];

const DECOR_SIZE = { w: 0.9, d: 0.9, h: 1.4 };
const DECOR_COLOR = "#2f7a3d";
/** The sprite a standard-sized decoration draws at; anything bigger scales off these by its footprint. */
const TREE_SPRITE = { w: 1.2, h: 1.6 };
const PROP_SPRITE = { w: 0.9, h: 0.9 };
/** Twelve fixed spots in the VILLAGE, clear of the path corridor, every site (padded 2), the lap ring, and the ceremony plaza. */
export const DECOR_SPOTS: { kind: string; x: number; z: number }[] = [
  { kind: "oak", x: -15, z: 14 },
  { kind: "pine", x: 15, z: 14 },
  { kind: "bush", x: -4, z: 13 },
  { kind: "rock", x: 4.5, z: 12.5 },
  { kind: "fence", x: -16, z: 6 },
  { kind: "lantern", x: 16, z: 5 },
  { kind: "oak", x: -16, z: -4 },
  { kind: "pine", x: 16, z: -4 },
  { kind: "bush", x: -13.5, z: -14.5 },
  { kind: "rock", x: 14, z: -15 },
  { kind: "pine", x: -16, z: -18 },
  { kind: "oak", x: 16, z: -18 },
];

/** Billboard size for a prop drawn as a sprite: a little wider than its footprint and taller than its box, so roofs show. */
export function spriteSizeFor(prop: Prop): { w: number; h: number } {
  switch (prop.kind) {
    case "castle":
      return { w: prop.size.w + 1, h: prop.size.h + 1.5 };
    case "building":
      return { w: prop.size.w + 0.5, h: prop.size.h + 1 };
    case "decor": {
      // A ratio of the footprint, not a constant: the wilderness varies a tree's size to
      // break up a wood, and a great oak or a standing stone is simply a bigger footprint.
      // A standard DECOR_SIZE decoration still gets exactly the old 1.2 × 1.6 / 0.9 × 0.9.
      const base = prop.variant === "oak" || prop.variant === "pine" ? TREE_SPRITE : PROP_SPRITE;
      // Divide first, then multiply: a standard decoration's ratio is exactly 1, so it draws
      // at exactly the old numbers rather than at 1.5999999999999999.
      return { w: base.w * (prop.size.w / DECOR_SIZE.w), h: base.h * (prop.size.h / DECOR_SIZE.h) };
    }
    default:
      return { w: prop.size.w, h: prop.size.h };
  }
}

export function buildingFootprint(id: string): { w: number; d: number; h: number } {
  return id === "watchtower" ? WATCHTOWER_SIZE : BUILDING_SIZE;
}

export function buildWorldLayout(input: { castleType: string; buildings: SiteProgress[]; villagers?: boolean; banners?: number; decor?: boolean; objectiveIds?: string[] }): WorldLayout {
  const showVillagers = input.villagers ?? true;
  const objectiveIds = input.objectiveIds ?? [];
  const castleType = input.castleType in CASTLE_FOOTPRINTS ? input.castleType : "campsite";
  const castleSize = CASTLE_FOOTPRINTS[castleType];
  const props: Prop[] = [
    { id: "castle", kind: "castle", label: "Castle", position: CASTLE_POSITION, size: castleSize, color: CASTLE_COLOR, solid: true },
  ];

  // A row of flat tiles from the south gate to the castle's south face.
  const castleSouth = CASTLE_POSITION.z + castleSize.d / 2 + 1;
  for (let z = GATE_Z; z >= castleSouth; z -= 2) {
    props.push({ id: `path-${z}`, kind: "path", label: "Path", position: { x: 0, z }, size: { w: 2, d: 2, h: 0.05 }, color: PATH_COLOR, solid: false });
  }

  // One banner per completed season, in that season's crown colour, on fixed poles around the castle.
  const banners = Math.min(BANNER_CAP, Math.max(0, Math.floor(input.banners ?? 0)));
  for (let i = 0; i < banners; i++) {
    const pole = BANNER_POLES[i];
    const halfW = castleSize.w / 2;
    const halfD = castleSize.d / 2;
    const position = {
      x: CASTLE_POSITION.x + (Math.abs(pole.x) === 1 ? pole.x * (halfW + BANNER_MARGIN) : pole.x * halfW),
      z: CASTLE_POSITION.z + (Math.abs(pole.z) === 1 ? pole.z * (halfD + BANNER_MARGIN) : pole.z * halfD),
    };
    props.push({ id: `banner-${i + 1}`, kind: "banner", label: "", position, size: BANNER_SIZE, color: crownForOrdinal(i + 1).color, solid: false });
  }

  // Every building has a site: the building once complete, a foundation until then. Missing progress means none yet.
  const progress = new Map(input.buildings.map((b) => [b.id, b]));
  // Rank is taken over the objectives that are still OPEN. A raised site is never a quest, so a
  // completed id sitting first in `objectiveIds` would otherwise consume rank 0 and the world
  // would carry NO objective mark at all — no beacon, no ring, no arrow — rather than promoting
  // the next open site. `objectiveState` filters completed ids before they get here, so this is
  // unreachable from the shell today; it is one line to make it impossible.
  const openObjectiveIds = objectiveIds.filter((id) => !(progress.get(id)?.complete ?? false));
  const villagers: VillagerPlacement[] = [];
  for (const building of BUILDINGS) {
    const slot = BUILDING_SLOTS[building.id];
    if (!slot) continue;
    const footprint = buildingFootprint(building.id);
    const p = progress.get(building.id) ?? { id: building.id, done: 0, total: building.deedsToBuild, complete: false };
    // A raised site is never a quest, whatever the caller asks for, so a finished village can never grow a beacon.
    const rank = openObjectiveIds.indexOf(building.id);
    const focus: PropFocus | undefined = p.complete ? "done" : rank === 0 ? "objective" : rank > 0 ? "tracked" : undefined;
    const status: VillagerStatus = p.complete ? "built" : rank === 0 ? "objective" : "work";
    if (p.complete) {
      props.push({ id: building.id, kind: "building", label: building.label, tag: showVillagers ? "Built" : undefined, position: slot, size: footprint, color: BUILDING_COLORS[building.id] ?? "#888888", solid: true, focus });
    } else {
      props.push({ id: building.id, kind: "foundation", label: building.label, tag: showVillagers ? `${p.done} of ${p.total}` : undefined, position: slot, size: { ...footprint, h: FOUNDATION_H }, color: FOUNDATION_COLOR, solid: false, focus });
    }
    if (showVillagers) {
      const villager = VILLAGERS.find((v) => v.buildingId === building.id);
      if (villager) {
        const position = villagerPosition(slot, footprint);
        villagers.push({ id: villager.id, buildingId: building.id, position, status, label: building.label, done: p.done, total: p.total });
        props.push({ id: `villager-${villager.id}`, kind: "villager", label: villager.name, position, size: VILLAGER_SIZE, color: "#000000", solid: false });
      }
    }
  }

  // Scenery is not a prop (see the wilderness section below): it is its own list, drawn by
  // its own instanced pass, and identical for every child on every visit. A world with the
  // decorations turned off keeps its terrain — the water, the tracks and the ploughed plots
  // are what tell a child WHERE they are, and lowStimulus mutes the world, never empties it —
  // but it must not keep the colliders of trees and stones nobody can see.
  const scenery = (input.decor ?? true) ? SCENERY : NO_SCENERY;
  const colliders = [...props.filter((p) => p.solid), ...(scenery === SCENERY ? SCENERY_SOLID : NO_SCENERY), ...WATER_BLOCKERS];

  return { props, spawn: SPAWN, colliders, villagers, castleType, terrain: TERRAIN, scenery };
}

/* ---------------------------------------------------------------------------
 * The world beyond the village.
 *
 * Everything below is FIXED: none of it depends on a child's progress, so it is built once
 * at module load and every layout hands out the same frozen arrays. That is not a
 * micro-optimisation — `World` is memoised on prop identity, and a wilderness rebuilt per
 * layout would hand the scene a new array every time a deed lands.
 *
 * It is deliberately NOT part of `props`. `props` is the village's own list and half the
 * programme walks it: `minimap.ts` takes the world's bounds from it, `recess.ts` and
 * `troubles.ts` filter it for obstacles and path corridors, `ceremony.ts` finds the castle in
 * it. Five hundred trees in that list would zoom the minimap out until the village was four
 * pixels across and starve the trouble spawner. Scenery is its own list, drawn by its own
 * instanced pass in `realm-scene.tsx`.
 * ------------------------------------------------------------------------ */

/** A ground rectangle: the water, its banks, the ploughed plots and the dirt tracks. */
export type TerrainKind = "grove" | "scree" | "field" | "furrow" | "shore" | "shallow" | "water" | "trail";
export type TerrainPatch = {
  id: string;
  kind: TerrainKind;
  position: Vec2;
  size: { w: number; d: number };
  /**
   * Radians about the vertical. Only the NATURAL ground carries one: a ploughed plot, a
   * lake and a laid track are rectangles and stay square to the world, but a patch of forest
   * floor is not, and an unrotated rectangle under this camera is an unmistakable diamond.
   */
  angle?: number;
};

/**
 * `trail` and `furrow` are drawn with the cobble tile, so their colour is a TINT the texture
 * is multiplied by — a lighter hex than the brown you want. The other six are flat colour.
 */
export const TERRAIN_COLORS: Record<TerrainKind, string> = {
  grove: "#275032",
  scree: "#57594a",
  field: "#7c8442",
  furrow: "#c09a6e",
  shore: "#b5a068",
  shallow: "#6ba3b8",
  water: "#35688a",
  trail: "#d9b98a",
};
/** lowStimulus mutes the world; it never empties it. The same eight surfaces, desaturated. */
export const TERRAIN_COLORS_CALM: Record<TerrainKind, string> = {
  grove: "#2c3a31",
  scree: "#5f5d57",
  field: "#5f6547",
  furrow: "#9b8f7c",
  shore: "#8f866c",
  shallow: "#63848f",
  water: "#3d5a6b",
  trail: "#a89c8a",
};

type Rect = { x: number; z: number; w: number; d: number };
const rect = (x: number, z: number, w: number, d: number): Rect => ({ x, z, w, d });
const inRect = (p: Vec2, r: Rect, pad = 0): boolean => Math.abs(p.x - r.x) <= r.w / 2 + pad && Math.abs(p.z - r.z) <= r.d / 2 + pad;

/** Distance from a point to a segment. The tracks are polylines, and nothing stands on one. */
function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const len2 = vx * vx + vz * vz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2));
  return Math.hypot(p.x - (a.x + vx * t), p.z - (a.z + vz * t));
}

const HALF = WORLD_SIZE / 2;
/** The village's square plus a margin: the wilderness starts outside it and the village is untouched. */
const VILLAGE_KEEP = rect(0, 0, VILLAGE_SIZE + 4, VILLAGE_SIZE + 4);

/**
 * Longwater, north-east, in three axis-aligned pieces, so the water a child SEES and the
 * boxes that stop them walking into it are the same rectangles. Deep water is solid. The
 * millstream that leaves it southward is shallow, and is walked straight through.
 */
const LAKE: Rect[] = [rect(42, -48, 26, 16), rect(30, -44, 12, 12), rect(55, -52, 10, 10)];
const MILL_POOL = rect(29, -10, 9, 9);
const STREAM = rect(29, -27, 4, 34);
const DEEP: Rect[] = [...LAKE, MILL_POOL];
/** How far the bank reaches past the water it holds. */
const SHORE_PAD = 2.5;

/** Three ploughed plots along the east lane. */
const PLOTS: Rect[] = [rect(38, -11, 18, 12), rect(38, 11, 18, 12), rect(58, -2, 14, 14)];

/**
 * Five tracks, every one starting at the village and ending at something worth finding: the
 * stone ring in the Old Wood, the cairn on the fells, Longwater's shore, the far plot on the
 * east lane, the milestone at the end of the south road. A child who is lost walks a track
 * inward and is home — which is why not one of them is a loop and not one of them is a ring
 * road. They are the map, for a child who cannot read one.
 */
const TRAILS: Vec2[][] = [
  [{ x: 0, z: 19 }, { x: 0, z: 42 }, { x: -3, z: 56 }], // the south road, on from the cobbles
  [{ x: -20, z: 4 }, { x: -34, z: 2 }, { x: -50, z: 0 }], // the west track into the Old Wood
  [{ x: 20, z: -2 }, { x: 34, z: 0 }, { x: 48, z: 2 }], // the east lane through the plots
  [{ x: 14, z: -20 }, { x: 24, z: -28 }, { x: 33, z: -36 }], // the lake path, fording the stream
  [{ x: -14, z: -22 }, { x: -24, z: -34 }, { x: -33, z: -48 }], // the fell track to the cairn
];
const TRAIL_STEP = 2;
const TRAIL_TILE = { w: 2.2, d: 2.2 };

function trailTiles(): TerrainPatch[] {
  const tiles: TerrainPatch[] = [];
  let last: Vec2 | null = null;
  for (const line of TRAILS) {
    for (let s = 0; s < line.length - 1; s++) {
      const a = line[s];
      const b = line[s + 1];
      const span = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.max(1, Math.round(span / TRAIL_STEP));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        // The ford: the track stops at the water's edge and picks up on the far bank. The
        // stepping stones between are scenery, so a child can see where to cross.
        if (inRect(p, STREAM, 0.8) || DEEP.some((r) => inRect(p, r, 0.8))) continue;
        if (last && Math.hypot(p.x - last.x, p.z - last.z) < TRAIL_STEP * 0.7) continue;
        tiles.push({ id: `trail-${tiles.length + 1}`, kind: "trail", position: p, size: TRAIL_TILE });
        last = p;
      }
    }
  }
  return tiles;
}

function buildTerrain(): TerrainPatch[] {
  const patches: TerrainPatch[] = [];
  const rng = seededRng(4271);
  const push = (kind: TerrainKind, r: Rect, angle?: number) => {
    patches.push({ id: `${kind}-${patches.length + 1}`, kind, position: { x: r.x, z: r.z }, size: { w: r.w, d: r.d }, angle });
  };
  /**
   * A patch of ground that is not a rectangle.
   *
   * One big rectangle laid on the grass reads as a rug somebody put there — under this camera
   * it is a hard-edged diamond, and the eye finds the straight line instantly. So a patch is a
   * CLUSTER of small squares of one colour, jittered around a centre and overlapping. They are
   * coplanar and identical, so where they overlap there is nothing to see, and the outline they
   * make together is ragged. Cheap, too: the whole forest floor is still one draw call.
   */
  const blobs = (kind: TerrainKind, area: Rect, clusters: number, per: number, lo: number, hi: number, spread: number) => {
    const clamp = (v: number, span: number) => Math.max(-HALF + span / 2, Math.min(HALF - span / 2, v));
    for (let c = 0; c < clusters; c++) {
      const centre = { x: area.x + (rng() * 2 - 1) * (area.w / 2), z: area.z + (rng() * 2 - 1) * (area.d / 2) };
      for (let i = 0; i < per; i++) {
        const p = { x: centre.x + (rng() * 2 - 1) * spread, z: centre.z + (rng() * 2 - 1) * spread };
        if (inRect(p, VILLAGE_KEEP) || DEEP.some((r) => inRect(p, r, 1)) || inRect(p, STREAM, 1)) continue;
        const w = lo + rng() * (hi - lo);
        const d = w * (0.7 + rng() * 0.6);
        const reach = Math.hypot(w, d); // clamped on the turned footprint, so no corner leaves the world
        push(kind, rect(clamp(p.x, reach), clamp(p.z, reach), w, d), rng() * Math.PI);
      }
    }
  };
  blobs("grove", rect(-50, 0, 54, 68), 16, 9, 4, 9, 3); // the floor of the Old Wood
  blobs("scree", rect(-36, -56, 60, 34), 12, 9, 4, 9, 3); // bare stone across the fells
  blobs("scree", rect(-54, 0, 12, 12), 2, 7, 3, 6, 2.5); // and around the standing stones
  for (const r of PLOTS) push("field", r);
  // Furrows: thin dirt rows across each plot. The cheapest possible "this ground is worked".
  for (const plot of PLOTS) {
    const rows = Math.floor(plot.d / 3);
    for (let i = 0; i < rows; i++) push("furrow", rect(plot.x, plot.z - plot.d / 2 + 1.5 + i * 3, plot.w - 2, 0.7));
  }
  for (const r of DEEP) push("shore", rect(r.x, r.z, r.w + SHORE_PAD * 2, r.d + SHORE_PAD * 2));
  push("shore", rect(STREAM.x, STREAM.z, STREAM.w + 3, STREAM.d + 1));
  push("shallow", STREAM);
  for (const r of DEEP) push("water", r);
  return [...patches, ...trailTiles()];
}

/* --- scenery ------------------------------------------------------------- */

type Spot = { kind: string; x: number; z: number; scale: number; solid: boolean };

const TRAIL_CLEAR = 2.4;
const WATER_CLEAR = 1.2;

/** Ground nothing may stand on: outside the world, the village, a track, the water, a plot. */
function openGround(p: Vec2, pad: number): boolean {
  if (Math.abs(p.x) > HALF - 2 || Math.abs(p.z) > HALF - 2) return false;
  if (inRect(p, VILLAGE_KEEP)) return false;
  if (inRect(p, STREAM, WATER_CLEAR) || DEEP.some((r) => inRect(p, r, WATER_CLEAR))) return false;
  if (PLOTS.some((r) => inRect(p, r, pad))) return false;
  for (const line of TRAILS) {
    for (let s = 0; s < line.length - 1; s++) if (distToSegment(p, line[s], line[s + 1]) < TRAIL_CLEAR) return false;
  }
  return true;
}

function far(p: Vec2, spots: Spot[], gap: number): boolean {
  for (const s of spots) {
    if (Math.abs(s.x - p.x) < gap && Math.abs(s.z - p.z) < gap && Math.hypot(s.x - p.x, s.z - p.z) < gap) return false;
  }
  return true;
}

type ScatterOpts = {
  area: Rect;
  count: number;
  gap: number;
  kinds: string[]; // repeat a kind to weight it
  scale?: [number, number];
  solidAbove?: number; // a trunk or a boulder at least this big is walked AROUND, not through
};

/** Seeded rejection sampling. Same seed, same wood, forever — a world that reshuffles is not a place. */
function scatter(spots: Spot[], rng: () => number, o: ScatterOpts): void {
  const [lo, hi] = o.scale ?? [0.9, 1.15];
  let placed = 0;
  for (let attempt = 0; attempt < o.count * 14 && placed < o.count; attempt++) {
    const p = { x: o.area.x + (rng() * 2 - 1) * (o.area.w / 2), z: o.area.z + (rng() * 2 - 1) * (o.area.d / 2) };
    if (!openGround(p, 1)) continue;
    if (!far(p, spots, o.gap)) continue;
    const scale = lo + rng() * (hi - lo);
    const kind = o.kinds[Math.min(o.kinds.length - 1, Math.floor(rng() * o.kinds.length))];
    // Only stone and trunks ever block: a gorse bush the hero bounces off is a bug report.
    const solid = o.solidAbove !== undefined && scale >= o.solidAbove && (kind === "rock" || kind === "oak" || kind === "pine");
    spots.push({ kind, x: p.x, z: p.z, scale, solid });
    placed += 1;
  }
}

/** A ring of standing stones, a cairn: placement with a reason, not a sprinkle. */
function ring(spots: Spot[], centre: Vec2, radius: number, count: number, kind: string, scale: number, solid: boolean): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    spots.push({ kind, x: centre.x + Math.cos(a) * radius, z: centre.z + Math.sin(a) * radius, scale, solid });
  }
}

function row(spots: Spot[], from: Vec2, to: Vec2, step: number, kind: string, scale: number): void {
  const span = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(1, Math.round(span / step));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    spots.push({ kind, x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, scale, solid: false });
  }
}

/** Reeds along a bank: the rectangle's perimeter, not a circle round its centre. */
function border(spots: Spot[], r: Rect, pad: number, step: number, kind: string, scale: number): void {
  const x0 = r.x - r.w / 2 - pad;
  const x1 = r.x + r.w / 2 + pad;
  const z0 = r.z - r.d / 2 - pad;
  const z1 = r.z + r.d / 2 + pad;
  row(spots, { x: x0, z: z0 }, { x: x1, z: z0 }, step, kind, scale);
  row(spots, { x: x0, z: z1 }, { x: x1, z: z1 }, step, kind, scale);
  row(spots, { x: x0, z: z0 + step }, { x: x0, z: z1 - step }, step, kind, scale);
  row(spots, { x: x1, z: z0 + step }, { x: x1, z: z1 - step }, step, kind, scale);
}

function buildScenery(): Prop[] {
  const rng = seededRng(20260917);
  const spots: Spot[] = [];

  // The village's own twelve, unmoved: they were placed clear of the path, every site, the
  // lap ring and the ceremony plaza, and layout.test.ts still holds them to it.
  for (const spot of DECOR_SPOTS) spots.push({ kind: spot.kind, x: spot.x, z: spot.z, scale: 1, solid: false });

  // THE OLD WOOD, west. Thick enough to be a wood rather than a lawn with trees on it, and
  // walked THROUGH on purpose: a hundred colliders between a child and the way home is a maze.
  scatter(spots, rng, { area: rect(-50, 0, 52, 66), count: 120, gap: 2.7, kinds: ["oak", "pine", "oak", "pine", "oak"], scale: [0.85, 1.3] });
  scatter(spots, rng, { area: rect(-50, 0, 52, 66), count: 24, gap: 2.8, kinds: ["bush"], scale: [0.8, 1.1] });
  // The clearing at the end of the west track: a ring of standing stones round a lit lantern.
  ring(spots, { x: -54, z: 0 }, 5, 8, "rock", 1.5, true);
  spots.push({ kind: "lantern", x: -54, z: 0, scale: 1.2, solid: false });
  // Three great oaks, solid, far apart: landmarks to steer by inside the wood.
  for (const g of [{ x: -30, z: 18 }, { x: -38, z: -20 }, { x: -62, z: 12 }]) spots.push({ kind: "oak", x: g.x, z: g.z, scale: 2, solid: true });

  // THE FELLS, north and north-west: rock, gorse, and wind-bent pines behind the castle.
  scatter(spots, rng, { area: rect(-36, -56, 60, 34), count: 55, gap: 3, kinds: ["rock", "rock", "bush"], scale: [0.8, 1.6], solidAbove: 1.35 });
  scatter(spots, rng, { area: rect(-36, -56, 60, 34), count: 24, gap: 4, kinds: ["pine"], scale: [0.9, 1.2] });
  // The cairn at the end of the fell track: five stones round a sixth, the tallest thing up here.
  ring(spots, { x: -33, z: -50 }, 1.7, 5, "rock", 1.6, true);
  spots.push({ kind: "rock", x: -33, z: -50, scale: 2.2, solid: true });
  spots.push({ kind: "lantern", x: -29, z: -47, scale: 1, solid: false });

  // LONGWATER, north-east: reeds along every bank, shingle, and a lantern where the lake path
  // arrives — the fishing spot.
  for (const r of LAKE) border(spots, r, SHORE_PAD + 0.8, 3.2, "bush", 0.9);
  scatter(spots, rng, { area: rect(42, -48, 40, 30), count: 22, gap: 3.2, kinds: ["rock", "bush"], scale: [0.8, 1.3] });
  scatter(spots, rng, { area: rect(46, -64, 46, 18), count: 20, gap: 3.6, kinds: ["pine"], scale: [0.9, 1.2] });
  spots.push({ kind: "lantern", x: 33, z: -38, scale: 1, solid: false });
  // The ford: three stepping stones where the lake path crosses the millstream.
  for (const x of [27.4, 29, 30.6]) spots.push({ kind: "rock", x, z: -32.4, scale: 0.7, solid: false });
  // The mill pool at the stream's end, close enough to the village to be found in the first minute.
  border(spots, MILL_POOL, SHORE_PAD + 0.8, 3, "bush", 0.9);

  // THE PLOTS, east: fenced on three sides — a gate you can walk in by — with a lantern on the post.
  for (const plot of PLOTS) {
    const x0 = plot.x - plot.w / 2 - 1;
    const x1 = plot.x + plot.w / 2 + 1;
    const z0 = plot.z - plot.d / 2 - 1;
    const z1 = plot.z + plot.d / 2 + 1;
    row(spots, { x: x0, z: z0 }, { x: x1, z: z0 }, 2.4, "fence", 1);
    row(spots, { x: x0, z: z1 }, { x: x1, z: z1 }, 2.4, "fence", 1);
    row(spots, { x: x0, z: z0 + 2.4 }, { x: x0, z: z1 - 2.4 }, 2.4, "fence", 1);
    spots.push({ kind: "lantern", x: x1, z: plot.z, scale: 1, solid: false });
  }
  scatter(spots, rng, { area: rect(46, 0, 56, 50), count: 30, gap: 4, kinds: ["oak", "bush", "rock"], scale: [0.85, 1.2] });

  // THE ORCHARD, south of the gate: planted in rows either side of the road, so the first thing
  // a child meets outside the village is plainly somebody's work rather than more field.
  for (const side of [-1, 1]) {
    for (let col = 0; col < 3; col++) {
      for (let r = 0; r < 5; r++) spots.push({ kind: "oak", x: side * (7 + col * 4), z: 28 + r * 5, scale: 1.05, solid: false });
    }
  }
  row(spots, { x: -20, z: 26 }, { x: -20, z: 50 }, 3, "fence", 1);
  row(spots, { x: 20, z: 26 }, { x: 20, z: 50 }, 3, "fence", 1);
  // The milestone where the south road runs out.
  spots.push({ kind: "lantern", x: -1.5, z: 57, scale: 1.1, solid: false });
  spots.push({ kind: "rock", x: -7, z: 57, scale: 1.4, solid: true });
  scatter(spots, rng, { area: rect(0, 50, 100, 36), count: 34, gap: 4.5, kinds: ["oak", "pine", "bush", "rock"], scale: [0.85, 1.25] });

  // THE WILD EDGE. The hero is clamped at WORLD_SIZE / 2; a thicket standing on that line is
  // what turns an invisible wall into somewhere a child can SEE they have gone far enough.
  const EDGE = HALF - 6;
  for (let i = -EDGE; i <= EDGE; i += 7) {
    for (const p of [{ x: i, z: -EDGE }, { x: i, z: EDGE }, { x: -EDGE, z: i }, { x: EDGE, z: i }]) {
      const q = { x: p.x + (rng() * 2 - 1) * 1.8, z: p.z + (rng() * 2 - 1) * 1.8 };
      if (!openGround(q, 1)) continue;
      spots.push({ kind: rng() < 0.5 ? "pine" : "oak", x: q.x, z: q.z, scale: 1 + rng() * 0.35, solid: false });
    }
  }

  return spots.map((s, i) => ({
    id: `wild-${i + 1}`,
    kind: "decor" as const,
    label: "",
    variant: s.kind,
    position: { x: s.x, z: s.z },
    size: { w: DECOR_SIZE.w * s.scale, d: DECOR_SIZE.d * s.scale, h: DECOR_SIZE.h * s.scale },
    color: DECOR_COLOR,
    solid: s.solid,
  }));
}

/** Built once, at module load. Every layout hands out these same arrays. */
export const TERRAIN: TerrainPatch[] = buildTerrain();
export const SCENERY: Prop[] = buildScenery();
const SCENERY_SOLID: Prop[] = SCENERY.filter((p) => p.solid);
const NO_SCENERY: Prop[] = [];

/** Deep water, as colliders: the same rectangles the scene paints, so the edge you see is the edge you feel. */
const WATER_BLOCKERS: Prop[] = DEEP.map((r, i) => ({
  id: `water-${i + 1}`,
  kind: "barrier" as const,
  label: "",
  position: { x: r.x, z: r.z },
  size: { w: r.w, d: r.d, h: 0.1 },
  color: TERRAIN_COLORS.water,
  solid: true,
}));
