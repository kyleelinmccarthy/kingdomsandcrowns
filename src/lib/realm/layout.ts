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

/**
 * Where each kingdom building stands once its deeds are done. Alternating sides of the road, in
 * two staggered columns a side — an inner one by the road and an outer one half a row off it —
 * so every building has another beside it, never straight in front of it.
 *
 * Every door faces south (+z), and the rule this plan keeps is that NOTHING stands in front of a
 * door: each one has open ground south of it for a run-up the hero's width and more, with its
 * villager on it, and nothing tall enough in that line to push the camera round while a child
 * walks at it. The first plan stacked each side in one column: the market's door opened onto a
 * 1.2-unit gap behind the bridge house, the library's onto the chapel's bell tower (Librarian
 * Hesper stood inside it), and the chapel and the bridge house had two or three units in front
 * of theirs. `realm3d/doorways.test.ts` walks every door from the spawn point, so a re-plot that
 * tucks one away again fails there.
 *
 * The chapel stands at the castle's flank, the last in its column, because its bell tower is the
 * one thing in the village tall enough to block the camera behind any door north of it.
 *
 * Saves key on the building id, never on where it stands, so moving a slot moves nothing a child
 * has earned. The world generator levels and clears whatever this says.
 */
export const BUILDING_SLOTS: Record<string, Vec2> = {
  well: { x: -4.5, z: 9 },
  mill: { x: 5, z: 8.5 },
  bridge: { x: -14.5, z: 0 },
  chapel: { x: 14, z: -10.5 },
  market: { x: -7.5, z: -3.5 },
  library: { x: 8.5, z: -5 },
  watchtower: { x: -11, z: -10 },
  garden: { x: 13.5, z: 1.5 },
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
export type TerrainKind = "meadow" | "grove" | "litter" | "scree" | "field" | "furrow" | "shore" | "shallow" | "water" | "trail";
/**
 * Ground that is texture rather than place: it is drawn, but the map does not draw it.
 *
 * The minimap draws `terrain` one rectangle for one, which is right for a lake and wrong for two
 * hundred patches of dry grass — a map speckled with them would say nothing and cost two hundred
 * SVG nodes to say it.
 */
export const COSMETIC_TERRAIN: readonly TerrainKind[] = ["meadow", "litter"];
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
 * EVERY surface is now drawn with a detail tile from `tiles.ts`, so none of these is a flat fill
 * any more: each is the TINT a near-white value pattern is multiplied by. That is why they read
 * brighter than the colours they replace — a map can only darken, and the tiles average about
 * four fifths of white. Change one of these and you are changing a surface's hue, never its
 * grain; the grain is in `surfaceTile`.
 */
export const TERRAIN_COLORS: Record<TerrainKind, string> = {
  meadow: "#6f7c43",
  grove: "#3f5230",
  litter: "#6d5a34",
  scree: "#7c7c6c",
  field: "#8e9250",
  furrow: "#9d7d53",
  shore: "#c6b07c",
  shallow: "#7fb6c8",
  water: "#3f7aa4",
  trail: "#bb9669",
};
/** lowStimulus mutes the world; it never empties it. The same ten surfaces, desaturated. */
export const TERRAIN_COLORS_CALM: Record<TerrainKind, string> = {
  meadow: "#5c6349",
  grove: "#374434",
  litter: "#5b5445",
  scree: "#6c6a62",
  field: "#6d7152",
  furrow: "#8f8573",
  shore: "#9a9076",
  shallow: "#6e919c",
  water: "#476678",
  trail: "#a2978a",
};

/**
 * How far in from the nearest bank a point lies, in world units, for the union of the deep-water
 * rectangles — 0 outside the water, growing towards the middle of the lake.
 *
 * The lake is three overlapping rectangles plus the mill pool, so no single one of them knows
 * where the shore is: a point sitting well inside the big rectangle can be a metre from the edge
 * of the small one it also belongs to, and taking the FURTHEST-in answer is what makes the union
 * shelve as one lake rather than as four. Pure, and it takes the patches rather than reading
 * `DEEP`, so what shelves is exactly what the scene was handed and the mill pool comes free.
 */
export function bankDistance(patches: readonly { position: Vec2; size: { w: number; d: number } }[], x: number, z: number): number {
  let best = 0;
  for (const p of patches) {
    const inset = Math.min(p.size.w / 2 - Math.abs(x - p.position.x), p.size.d / 2 - Math.abs(z - p.position.z));
    if (inset > best) best = inset;
  }
  return best;
}

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
 * Five tracks, every one starting at the village and ending at one of the five named PLACES:
 * the Ringstones in the Old Wood, Highcairn on the fells, Longwater's shore, Farfurrow at the
 * end of the east lane, Appleway where the south road runs out. A child who is lost walks a track
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
/**
 * Ten fingerposts: one at the head of every track where it leaves the village, and one at
 * every track's far end pointing back the way it came.
 *
 * The head post is the invitation — a child standing on the village edge can SEE that the dirt
 * going off into the grass is a way to somewhere, rather than grass with a stripe on it. The far
 * post is the one that matters more, and it is why there are ten and not five: five tracks leave
 * the village and none of them is a loop, so a child who has walked out to the fells and turned
 * round twice has exactly one problem, and it is "which way is home". A post at the end of the
 * track answers it without a map, a compass or a grown-up.
 *
 * They carry no words. At WORLD_SPRITE_SCALE.decor the whole figure is a 64-pixel grid, and a
 * place-name written across a signboard would be two pixels tall on screen — so the boards are
 * blank, notched to read as carving, and the NAME is spoken on arrival instead. Lettering here
 * would be a lie told at four hundred percent zoom.
 */
const SIGNPOSTS: Vec2[] = [
  // At the village edge, beside the first tile of each track, in TRAILS order.
  { x: 3, z: 20 }, // the south road, to Appleway
  { x: -20.4, z: 6.6 }, // the west track, to the Ringstones
  { x: 19.6, z: -4.6 }, // the east lane, to Farfurrow
  { x: 11.8, z: -21.8 }, // the lake path, to Longwater
  { x: -11.5, z: -23.5 }, // the fell track, to Highcairn
  // ...and at the far end of each, pointing home.
  { x: -44.5, z: 4 }, // beside the Ringstones' doorway, never standing in it
  { x: -27.5, z: -43 }, // below Highcairn, where the fell track steepens
  { x: 34.5, z: -33.5 }, // above Longwater's shore
  { x: 48, z: -0.8 }, // at the gate of the far plot
  { x: -5, z: 53.5 }, // where the south road runs out
];
/** How much open ground a fingerpost keeps around itself, so no tree ever grows in front of one. */
const SIGNPOST_CLEAR = 3.4;
/**
 * And a clearing at the heart of every named place, for the same reason and a worse one.
 *
 * The fells are three hundred scattered stones, so the cairn — a heap of stones — was invisible
 * in them: walked, it was impossible to tell the landmark from the scatter standing on top of
 * it. A region's own texture burying the one thing worth walking to it for is the failure mode
 * this whole slice exists to fix, so every place gets a hole in the scatter, and the thing at
 * its centre gets to be the only thing there.
 */
const LANDMARK_CLEAR = 6;

/**
 * A track is a RIBBON, not a row of stamps. At two units apart and two units across, two
 * consecutive tiles of a track running east met at their corners, and under this camera that is
 * a zigzag of separate diamonds rather than a path. Wider tiles, closer together, overlap into
 * one continuous band whichever way the track runs.
 */
const TRAIL_STEP = 1.4;
/** Along the track by `w`, across it by `d`. A tile is TURNED to the segment it belongs to. */
const TRAIL_TILE = { w: 2.8, d: 3.2 };
/** How far a track stops short of water. Half a tile plus a little, so it never overhangs. */
const FORD_PAD = 1.9;

function trailTiles(): TerrainPatch[] {
  const tiles: TerrainPatch[] = [];
  let last: Vec2 | null = null;
  for (const line of TRAILS) {
    for (let s = 0; s < line.length - 1; s++) {
      const a = line[s];
      const b = line[s + 1];
      const span = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.max(1, Math.round(span / TRAIL_STEP));
      // The tile's width axis is laid ALONG the segment. Square tiles on a track running east
      // are diamonds under this camera, and a row of overlapping diamonds has a sawtooth edge —
      // a zigzag of stamps rather than a path. Turned, they overlap into one straight ribbon.
      // `angle` turns world +X towards world -Z (see TerrainPatch and GroundBatch), hence -dz.
      const angle = Math.atan2(-(b.z - a.z), b.x - a.x);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        // The ford: the track stops at the water's edge and picks up on the far bank. The
        // stepping stones between are scenery, so a child can see where to cross.
        if (inRect(p, STREAM, FORD_PAD) || DEEP.some((r) => inRect(p, r, FORD_PAD))) continue;
        if (last && Math.hypot(p.x - last.x, p.z - last.z) < TRAIL_STEP * 0.7) continue;
        tiles.push({ id: `trail-${tiles.length + 1}`, kind: "trail", position: p, size: TRAIL_TILE, angle });
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
  type BlobOpts = {
    clusters: number;
    per: number;
    lo: number;
    hi: number;
    spread: number;
    /** Keep only patches whose distance from the area's centre, as a fraction of its half-size,
     *  falls in this band. `[0.75, 1.2]` is a FRINGE — the ragged skirt that stops a region
     *  ending in a straight line against the grass. */
    ring?: [number, number];
    /** The village is kept clear of wilderness ground by default; `meadow` is the exception,
     *  because it lies below every path, foundation and shadow and the village lawn needs it
     *  as much as the fields do. */
    village?: boolean;
  };
  const blobs = (kind: TerrainKind, area: Rect, o: BlobOpts) => {
    const clamp = (v: number, span: number) => Math.max(-HALF + span / 2, Math.min(HALF - span / 2, v));
    for (let c = 0; c < o.clusters; c++) {
      const centre = { x: area.x + (rng() * 2 - 1) * (area.w / 2), z: area.z + (rng() * 2 - 1) * (area.d / 2) };
      for (let i = 0; i < o.per; i++) {
        const p = { x: centre.x + (rng() * 2 - 1) * o.spread, z: centre.z + (rng() * 2 - 1) * o.spread };
        if (!o.village && inRect(p, VILLAGE_KEEP)) continue;
        if (DEEP.some((r) => inRect(p, r, 1)) || inRect(p, STREAM, 1)) continue;
        if (o.ring) {
          const reachOut = Math.hypot((p.x - area.x) / (area.w / 2), (p.z - area.z) / (area.d / 2));
          if (reachOut < o.ring[0] || reachOut > o.ring[1]) continue;
        }
        const w = o.lo + rng() * (o.hi - o.lo);
        const d = w * (0.7 + rng() * 0.6);
        const reach = Math.hypot(w, d); // clamped on the turned footprint, so no corner leaves the world
        push(kind, rect(clamp(p.x, reach), clamp(p.z, reach), w, d), rng() * Math.PI);
      }
    }
  };

  // THE WHOLE WORLD, first and lowest: dry, pale, worn grass. This is the layer that answers
  // "one patch of field looks like every other patch of field" — big, soft-edged and everywhere,
  // the village lawn included, so no stretch of ground is the same as the stretch beside it.
  blobs("meadow", rect(0, 0, 150, 150), { clusters: 74, per: 9, lo: 3.5, hi: 10, spread: 7, village: true });

  blobs("grove", rect(-50, 0, 54, 68), { clusters: 26, per: 13, lo: 4, hi: 11, spread: 4.5 }); // the floor of the Old Wood
  // ...and the wood's edge: litter thrown out past the last trees, so the floor does not end on a line.
  blobs("litter", rect(-50, 0, 66, 80), { clusters: 26, per: 6, lo: 3, hi: 8, spread: 4, ring: [0.62, 1.15] });
  blobs("scree", rect(-36, -56, 60, 34), { clusters: 16, per: 10, lo: 4, hi: 10, spread: 3.5 }); // bare stone across the fells
  blobs("scree", rect(-54, 0, 12, 12), { clusters: 2, per: 7, lo: 3, hi: 6, spread: 2.5 }); // and around the standing stones
  for (const r of PLOTS) push("field", r);
  // Furrows: thin dirt rows across each plot. The cheapest possible "this ground is worked".
  for (const plot of PLOTS) {
    const rows = Math.floor(plot.d / 1.8);
    for (let i = 0; i < rows; i++) push("furrow", rect(plot.x, plot.z - plot.d / 2 + 0.9 + i * 1.8, plot.w - 2, 0.55));
  }
  for (const r of DEEP) push("shore", rect(r.x, r.z, r.w + SHORE_PAD * 2, r.d + SHORE_PAD * 2));
  push("shore", rect(STREAM.x, STREAM.z, STREAM.w + 3, STREAM.d + 1));
  // Mud and shingle thrown out past every bank, for the same reason the wood gets litter: a lake
  // whose shore is one clean rectangle is a rug, not a shore.
  for (const r of DEEP) blobs("shore", rect(r.x, r.z, r.w + SHORE_PAD * 4, r.d + SHORE_PAD * 4), { clusters: 14, per: 4, lo: 2.5, hi: 6, spread: 3, ring: [0.66, 1.1] });
  push("shallow", STREAM);
  for (const r of DEEP) push("water", r);
  return [...patches, ...trailTiles()];
}

/* --- named places -------------------------------------------------------- */

/**
 * The five ends of the five tracks, and the only things in the world that have a NAME.
 *
 * A place is a circle and a sentence. It is deliberately NOT a prop, a collider or a piece of
 * scenery: nothing is drawn from this table and nothing can be walked into because of it. It
 * exists so that a child who walks west is TOLD they reached the Ringstones, and so that the
 * same five words a grown-up says out loud ("go west and you'll see the standing stones") are
 * the words the game uses.
 *
 * `line` is the second half of the arrival, and every one of them names the one thing standing
 * out there. That is the whole contract of this feature: a name a child can repeat, and a
 * promise a child can check. If a line here stops being true of the scenery below, the line is
 * the bug.
 *
 * Because it is pure data and not scenery, it survives `lowStimulus`. A child who has the
 * decorations turned off still walks onto the fells and is still told it is Highcairn — the
 * calm world is quieter, not nameless.
 */
export type RealmPlace = {
  id: string;
  name: string;
  /** The rest of the arrival: what is standing here, in one short clause. */
  line: string;
  position: Vec2;
  /**
   * How close counts as "here". Generous enough that a child aims at a region rather than a
   * pixel, and no more than that: the camera shows about thirty units across, so a radius of
   * thirteen announced "Highcairn" while the cairn was still off the top of the screen. Walked,
   * that reads as the game naming somewhere the child cannot see, which is worse than silence.
   */
  radius: number;
};

export const PLACES: RealmPlace[] = [
  { id: "ringstones", name: "The Ringstones", line: "Eight tall stones, and a lamp still lit.", position: { x: -53, z: 0 }, radius: 10 },
  { id: "highcairn", name: "Highcairn", line: "The highest stones in the realm.", position: { x: -33, z: -48 }, radius: 10 },
  { id: "longwater", name: "Longwater", line: "A little boat is pulled up on the shore.", position: { x: 33, z: -37 }, radius: 11 },
  { id: "farfurrow", name: "Farfurrow", line: "The last field, and a scarecrow keeping it.", position: { x: 55, z: -1 }, radius: 11 },
  { id: "appleway", name: "Appleway", line: "The road ends at a cart full of apples.", position: { x: -2, z: 55 }, radius: 11 },
];

const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p]));

export function placeById(id: string): RealmPlace | null {
  return PLACE_BY_ID.get(id) ?? null;
}

/**
 * How far past a place's radius the hero carries its name before it is left.
 *
 * Without it, a child standing on the rim and shuffling would re-arrive every few frames and
 * the lane would stutter the same sentence forever. Leaving is a THIRD further out than
 * arriving, which is more than the hero covers in a second at walking pace.
 */
export const PLACE_LEAVE = 1.33;

/**
 * Which named place the hero is standing in, given the one they were standing in last frame.
 *
 * Pure, and the caller keeps the memory: the scene holds the previous answer in a ref and
 * speaks only when this returns something new. Nearest-wins if two ever overlap, which none
 * of the five do today — it is there so that adding a sixth place cannot make the world
 * announce two names in one frame.
 */
export function placeAt(p: Vec2, current: string | null): string | null {
  const held = current ? PLACE_BY_ID.get(current) : undefined;
  if (held && Math.hypot(p.x - held.position.x, p.z - held.position.z) <= held.radius * PLACE_LEAVE) return held.id;
  let best: RealmPlace | null = null;
  let bestReach = Infinity;
  for (const place of PLACES) {
    // Compared as a FRACTION of each place's own radius, so a big region does not win a
    // point that sits well inside a small one just by being nearer in raw units.
    const reach = Math.hypot(p.x - place.position.x, p.z - place.position.z) / place.radius;
    if (reach <= 1 && reach < bestReach) {
      best = place;
      bestReach = reach;
    }
  }
  return best ? best.id : null;
}

/**
 * What the speech lane says on arrival.
 *
 * The first time, the name AND what is here — because the point of the walk is that something
 * is out there and a child should be told what to look at. Every time after that, the name
 * alone: the world has already made its promise and a child who came back does not need it
 * explained again. That is the whole difference between a world and a tour guide.
 */
export function arrivalText(place: RealmPlace, first: boolean): string {
  return first ? `${place.name}. ${place.line}` : `${place.name}.`;
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
  // A fingerpost hidden behind an oak is a fingerpost that does not exist. The scatter's own
  // `gap` is far too small to guarantee it (1.35 in the wood), so the posts get their own hole
  // in the world — the same rule the tracks have, and for exactly the same reason.
  for (const post of SIGNPOSTS) if (Math.hypot(p.x - post.x, p.z - post.z) < SIGNPOST_CLEAR) return false;
  for (const place of PLACES) if (Math.hypot(p.x - place.position.x, p.z - place.position.z) < LANDMARK_CLEAR) return false;
  for (const line of TRAILS) {
    for (let s = 0; s < line.length - 1; s++) if (distToSegment(p, line[s], line[s + 1]) < TRAIL_CLEAR) return false;
  }
  return true;
}

/**
 * A wood is thousands of trunks, and the old `far()` walked every spot already placed to test
 * one candidate — quadratic, and at a wood's real density that is tens of millions of distance
 * checks at MODULE LOAD, i.e. a stall before the realm even opens. A fixed grid makes it
 * constant time: a candidate only ever looks at the cells that could hold something close.
 */
const CELL = 5;
type Grid = Map<number, Spot[]>;
const cellKey = (cx: number, cz: number) => (cx + 512) * 1024 + (cz + 512);
const newGrid = (): Grid => new Map();

function gridAdd(grid: Grid, s: Spot): void {
  const k = cellKey(Math.floor(s.x / CELL), Math.floor(s.z / CELL));
  const list = grid.get(k);
  if (list) list.push(s);
  else grid.set(k, [s]);
}

function gridFar(grid: Grid, p: Vec2, gap: number): boolean {
  const reach = Math.ceil(gap / CELL);
  const cx = Math.floor(p.x / CELL);
  const cz = Math.floor(p.z / CELL);
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dz = -reach; dz <= reach; dz++) {
      const list = grid.get(cellKey(cx + dx, cz + dz));
      if (!list) continue;
      for (const s of list) if (Math.hypot(s.x - p.x, s.z - p.z) < gap) return false;
    }
  }
  return true;
}

/**
 * How far apart two things a child must walk AROUND are kept.
 *
 * Density is the point of this file now, and density plus solidity is a wall. Trees at a gap of
 * 1.4 make a wood; solid trees at a gap of 1.4 make a fence with no gate — two boulders 1.9 apart
 * already leave less than a hero's diameter between them, and a line of them closes a region off.
 * Every solid is therefore held to its own, much larger spacing, whatever the scatter's gap is.
 */
const SOLID_GAP = 4.4;

type ScatterOpts = {
  area: Rect;
  count: number;
  gap: number;
  kinds: string[]; // repeat a kind to weight it
  scale?: [number, number];
  solidAbove?: number; // a trunk or a boulder at least this big is walked AROUND, not through
  /**
   * Where the region starts thinning out, as a fraction of its half-size. A wood with a hard
   * rectangular edge is a hedge; a wood that thins over its last third has a canopy edge, which
   * is the thing that says "you are going into the wood" as a child walks in.
   */
  soften?: number;
};

/** Seeded rejection sampling. Same seed, same wood, forever — a world that reshuffles is not a place. */
function scatter(all: Spot[], grid: Grid, solids: Grid, rng: () => number, o: ScatterOpts): void {
  const [lo, hi] = o.scale ?? [0.9, 1.15];
  let placed = 0;
  for (let attempt = 0; attempt < o.count * 18 && placed < o.count; attempt++) {
    const p = { x: o.area.x + (rng() * 2 - 1) * (o.area.w / 2), z: o.area.z + (rng() * 2 - 1) * (o.area.d / 2) };
    if (o.soften !== undefined) {
      const reachOut = Math.hypot((p.x - o.area.x) / (o.area.w / 2), (p.z - o.area.z) / (o.area.d / 2));
      const keep = reachOut <= o.soften ? 1 : Math.max(0, 1 - (reachOut - o.soften) / (1 - o.soften));
      if (rng() > keep) continue;
    }
    if (!openGround(p, 1)) continue;
    if (!gridFar(grid, p, o.gap)) continue;
    const scale = lo + rng() * (hi - lo);
    const kind = o.kinds[Math.min(o.kinds.length - 1, Math.floor(rng() * o.kinds.length))];
    // Only stone and trunks ever block: a gorse bush the hero bounces off is a bug report.
    const solid =
      o.solidAbove !== undefined &&
      scale >= o.solidAbove &&
      (kind === "rock" || kind === "oak" || kind === "pine") &&
      gridFar(solids, p, SOLID_GAP);
    const spot = { kind, x: p.x, z: p.z, scale, solid };
    all.push(spot);
    gridAdd(grid, spot);
    if (solid) gridAdd(solids, spot);
    placed += 1;
  }
}

type Place = (spot: Spot) => void;

/**
 * A ring of standing stones, a cairn: placement with a reason, not a sprinkle.
 *
 * `phase` turns the ring. The west track ends dead on the stone ring's east point, and a solid
 * stone standing in the mouth of a track is a track that ends in a boulder — half a step of turn
 * puts a GAP there instead, which is what a way into a clearing should be.
 *
 * `skip` leaves one position EMPTY, and that turn of the screw is worth the parameter. A turned
 * ring of solid stones still only leaves the chord between two neighbours as its way in: at eight
 * stones on a radius of seven that is a gate 2.2 units wide, and an eight-year-old aiming a hero
 * at a 2.2-unit gate bounces off the stone beside it and gives up. Omitting one position instead
 * makes a DOORWAY two chords across — six units of clear ground, on the track's own line — and
 * leaves the rest of the circle close enough to read as a wall you go in through rather than a
 * dotted line you wander across. A stone circle with one way in is also simply the truth.
 */
function ring(place: Place, centre: Vec2, radius: number, count: number, kind: string, scale: number, solid: boolean, phase = 0, skip?: number): void {
  for (let i = 0; i < count; i++) {
    if (i === skip) continue;
    const a = (i / count) * Math.PI * 2 + phase;
    place({ kind, x: centre.x + Math.cos(a) * radius, z: centre.z + Math.sin(a) * radius, scale, solid });
  }
}

function row(place: Place, from: Vec2, to: Vec2, step: number, kind: string, scale: number): void {
  const span = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(1, Math.round(span / step));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    place({ kind, x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, scale, solid: false });
  }
}

/** Reeds along a bank: the rectangle's perimeter, not a circle round its centre. */
function border(place: Place, r: Rect, pad: number, step: number, kind: string, scale: number): void {
  const x0 = r.x - r.w / 2 - pad;
  const x1 = r.x + r.w / 2 + pad;
  const z0 = r.z - r.d / 2 - pad;
  const z1 = r.z + r.d / 2 + pad;
  row(place, { x: x0, z: z0 }, { x: x1, z: z0 }, step, kind, scale);
  row(place, { x: x0, z: z1 }, { x: x1, z: z1 }, step, kind, scale);
  row(place, { x: x0, z: z0 + step }, { x: x0, z: z1 - step }, step, kind, scale);
  row(place, { x: x1, z: z0 + step }, { x: x1, z: z1 - step }, step, kind, scale);
}

function buildScenery(): Prop[] {
  const rng = seededRng(20260917);
  const spots: Spot[] = [];
  const grid = newGrid();
  const solids = newGrid();
  // Everything goes through here, structures included, so a scatter can never drop a trunk on
  // top of the cairn and a solid boulder can never land against another one.
  const place: Place = (spot) => {
    spots.push(spot);
    gridAdd(grid, spot);
    if (spot.solid) gridAdd(solids, spot);
  };
  const sow = (o: ScatterOpts) => scatter(spots, grid, solids, rng, o);

  // The village's own twelve, unmoved: they were placed clear of the path, every site, the
  // lap ring and the ceremony plaza, and layout.test.ts still holds them to it.
  for (const spot of DECOR_SPOTS) place({ kind: spot.kind, x: spot.x, z: spot.z, scale: 1, solid: false });

  // The fingerposts go down FIRST, before a single tree, so that everything scattered
  // afterwards has to make room for them (`openGround` holds SIGNPOST_CLEAR around each).
  // Never solid: a post a child bounces off at the mouth of a track is a closed gate.
  for (const post of SIGNPOSTS) place({ kind: "signpost", x: post.x, z: post.z, scale: 2.2, solid: false });

  /**
   * THE OLD WOOD, west.
   *
   * The counts here are the difference between a wood and a lawn somebody left trees on. A
   * hundred and twenty trunks over this rectangle put six on a screen; a child called it grass
   * with stickers, and they were right. At these numbers the trunks touch and overlap, the
   * undergrowth fills between them, and `soften` thins the last third so the wood has an edge
   * rather than a boundary. It is still walked straight THROUGH: not one of these is solid, and
   * a hundred colliders between a child and the way home is a maze.
   */
  sow({ area: rect(-50, 0, 52, 66), count: 720, gap: 1.35, kinds: ["oak", "pine", "oak", "pine", "oak"], scale: [1, 1.9], soften: 0.55 });
  sow({ area: rect(-50, 0, 52, 66), count: 260, gap: 1.4, kinds: ["bush"], scale: [0.75, 1.3], soften: 0.6 });
  // THE RINGSTONES, at the end of the west track: eight standing stones round a lit lantern.
  //
  // They were boulders, and that was the bug. A `rock` draws on the square PROP_SPRITE, so a
  // stone of the ring stood 1.35 units tall against trees of 1.6 to 3 — a child walked to the
  // end of the west track and found pebbles in a wood. A `menhir` is its own figure: tall,
  // narrow and carved, and at this scale it clears the undergrowth around it.
  //
  // The radius went 5 → 7.5, and the eighth stone became a DOORWAY, both for the hero rather
  // than for the look. Eight solid stones evenly spaced leave only the chord between two
  // neighbours as a way in — 1.35 units at the old radius, 2.5 at this one — and a hero
  // walking due west a couple of units off the centre line simply meets a stone and stops.
  // Walked, that is exactly what happened. `skip` is the fix; see `ring` for the arithmetic.
  // Nine positions, eight stones: the missing one is at phase 0, which is due EAST, which is
  // the line the west track arrives on. A child walking the track walks straight in the door.
  ring(place, { x: -54, z: 0 }, 7.5, 9, "menhir", 2.5, true, 0, 0);
  place({ kind: "lantern", x: -54, z: 0, scale: 1.6, solid: false });
  // Three great oaks, solid, far apart: landmarks to steer by inside the wood.
  for (const g of [{ x: -30, z: 18 }, { x: -38, z: -20 }, { x: -62, z: 12 }]) place({ kind: "oak", x: g.x, z: g.z, scale: 2, solid: true });

  // THE FELLS, north and north-west: rock, gorse, and wind-bent pines behind the castle.
  sow({ area: rect(-36, -56, 60, 34), count: 320, gap: 1.7, kinds: ["rock", "rock", "bush"], scale: [0.7, 1.9], solidAbove: 1.6, soften: 0.6 });
  sow({ area: rect(-36, -56, 60, 34), count: 140, gap: 2.1, kinds: ["pine"], scale: [1, 1.6], soften: 0.55 });
  // HIGHCAIRN, at the end of the fell track: five stones round a sixth, the tallest thing up
  // here, with a beacon burning beside it. The centre stone and the lamp are both bigger than
  // they were: this is the top of the world and it has to LOOK like it from halfway up the
  // track, or the last thirty units of walking are uphill towards nothing.
  ring(place, { x: -33, z: -50 }, 1.9, 5, "rock", 1.8, true);
  place({ kind: "rock", x: -33, z: -50, scale: 3, solid: true });
  // ...and a marker stone standing on it, taller than anything else up here. A cairn ALONE
  // does not read: the fells are made of scattered boulders and a heap of boulders is just a
  // denser patch of fell. One menhir on top is what turns it into a monument somebody built,
  // and it rhymes with the Ringstones on purpose — the same old people, two different marks.
  // Set BEHIND the heap, not on its south face: the fell track's last tile lands at (-33, -48),
  // and a solid stone of this size standing there ends the track in a wall — layout.test.ts's
  // walk caught exactly that. From here it still rises out of the cairn and blocks nothing.
  place({ kind: "menhir", x: -34.2, z: -51.4, scale: 3.4, solid: true });
  place({ kind: "lantern", x: -29.5, z: -47, scale: 2, solid: false });

  // LONGWATER, north-east: reeds along every bank, shingle, and a lantern where the lake path
  // arrives — the fishing spot. The reeds stand close enough to be a reed BED, which is also the
  // thing that softens the straight line where a bank meets the grass.
  for (const r of LAKE) border(place, r, SHORE_PAD + 0.8, 1.5, "bush", 0.85);
  sow({ area: rect(42, -48, 40, 30), count: 130, gap: 1.9, kinds: ["rock", "bush"], scale: [0.75, 1.4], soften: 0.6 });
  sow({ area: rect(46, -64, 46, 18), count: 110, gap: 1.9, kinds: ["pine"], scale: [1, 1.7], soften: 0.6 });
  place({ kind: "lantern", x: 33, z: -38, scale: 1.4, solid: false });
  // LONGWATER's own find: a little boat pulled up where the lake path meets the water, with
  // its oars beside it. Not solid, and deliberately drawn ON the shore rather than out on the
  // lake — deep water is a collider, so a boat afloat would be a boat a child can never stand
  // next to. Pulled up on the shingle, they can walk right to the gunwale.
  place({ kind: "boat", x: 30.5, z: -37.4, scale: 2.4, solid: false });
  // The ford: three stepping stones where the lake path crosses the millstream.
  for (const x of [27.4, 29, 30.6]) place({ kind: "rock", x, z: -32.4, scale: 0.7, solid: false });
  // The mill pool at the stream's end, close enough to the village to be found in the first minute.
  border(place, MILL_POOL, SHORE_PAD + 0.8, 1.5, "bush", 0.85);

  // THE PLOTS, east: fenced on three sides — a gate you can walk in by — with a lantern on the post.
  for (const plot of PLOTS) {
    const x0 = plot.x - plot.w / 2 - 1;
    const x1 = plot.x + plot.w / 2 + 1;
    const z0 = plot.z - plot.d / 2 - 1;
    const z1 = plot.z + plot.d / 2 + 1;
    row(place, { x: x0, z: z0 }, { x: x1, z: z0 }, 1.6, "fence", 1);
    row(place, { x: x0, z: z1 }, { x: x1, z: z1 }, 1.6, "fence", 1);
    row(place, { x: x0, z: z0 + 1.6 }, { x: x0, z: z1 - 1.6 }, 1.6, "fence", 1);
    place({ kind: "lantern", x: x1, z: plot.z, scale: 1, solid: false });
  }
  // FARFURROW's own find, standing in the middle of the far plot where the east lane runs out:
  // a scarecrow, with a crow sitting on its arm that plainly is not frightened of it. Tall,
  // because a field is flat and the whole point is to see it from the lane.
  place({ kind: "scarecrow", x: 56, z: -1, scale: 2.8, solid: false });
  sow({ area: rect(46, 0, 56, 50), count: 170, gap: 2.2, kinds: ["oak", "bush", "rock"], scale: [0.9, 1.5], soften: 0.6 });

  // THE ORCHARD, south of the gate: planted in rows either side of the road, so the first thing
  // a child meets outside the village is plainly somebody's work rather than more field.
  for (const side of [-1, 1]) {
    for (let col = 0; col < 4; col++) {
      for (let r = 0; r < 7; r++) place({ kind: "oak", x: side * (7 + col * 3.4), z: 27 + r * 3.6, scale: 1.3, solid: false });
    }
  }
  row(place, { x: -20, z: 26 }, { x: -20, z: 50 }, 1.8, "fence", 1);
  row(place, { x: 20, z: 26 }, { x: 20, z: 50 }, 1.8, "fence", 1);
  // APPLEWAY, where the south road runs out: a carved milestone, a lamp, and a cart standing
  // heaped with apples from the orchard the road came through. This is the FIRST place a child
  // finds — it is straight out of the south gate, the way the cobbles already point — so it is
  // the one that has to be worth arriving at, or none of the other four get walked.
  place({ kind: "lantern", x: -1.5, z: 57, scale: 1.3, solid: false });
  place({ kind: "menhir", x: -7, z: 57, scale: 1.7, solid: true });
  place({ kind: "cart", x: 3, z: 55.5, scale: 2.6, solid: false });
  sow({ area: rect(0, 50, 100, 36), count: 210, gap: 2.2, kinds: ["oak", "pine", "bush", "rock"], scale: [0.9, 1.6], soften: 0.6 });

  // THE WILD EDGE. The hero is clamped at WORLD_SIZE / 2; a thicket standing on that line is
  // what turns an invisible wall into somewhere a child can SEE they have gone far enough. Two
  // ranks deep now, because one rank at seven units apart was a dotted line, not a thicket.
  const EDGE = HALF - 6;
  for (let i = -EDGE; i <= EDGE; i += 3) {
    for (const p of [{ x: i, z: -EDGE }, { x: i, z: EDGE }, { x: -EDGE, z: i }, { x: EDGE, z: i }]) {
      for (const inward of [0, 3.4]) {
        const towards = { x: p.x === -EDGE ? inward : p.x === EDGE ? -inward : 0, z: p.z === -EDGE ? inward : p.z === EDGE ? -inward : 0 };
        const q = { x: p.x + towards.x + (rng() * 2 - 1) * 1.4, z: p.z + towards.z + (rng() * 2 - 1) * 1.4 };
        if (!openGround(q, 1)) continue;
        if (!gridFar(grid, q, 1.5)) continue;
        place({ kind: rng() < 0.5 ? "pine" : "oak", x: q.x, z: q.z, scale: 1.25 + rng() * 0.5, solid: false });
      }
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
