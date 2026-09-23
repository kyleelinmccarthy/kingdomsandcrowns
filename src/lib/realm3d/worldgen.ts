/**
 * THE WIDER REALM — a procedural world generated AROUND the village that is already there.
 *
 * ## What this is, and what it deliberately is not
 *
 * `src/lib/realm/layout.ts` holds a hand-authored world: a 160-unit square with a 40-unit
 * village in the middle, six named regions, five tracks, five named places and about two
 * thousand props placed one at a time. It looks good. It cannot grow, because every new acre
 * is somebody typing coordinates.
 *
 * This module does NOT replace it. It generates the land OUTSIDE it, and generates the
 * TERRAIN underneath all of it, so that:
 *
 *   - the authored core keeps every prop, track, plot and place exactly where it is;
 *   - the ground under the core is the same continuous surface as the ground two hundred
 *     units away, so there is no seam to see;
 *   - the village square stays flat enough to stand eight buildings and a castle on.
 *
 * That split IS the answer to "make the join invisible". The join is not a blend between two
 * worlds; there is one world, and the middle of it happens to be furnished by hand.
 *
 * ## No three, ever
 *
 * Plain numbers and plain objects. It has to be testable in jsdom with no WebGL, and the
 * heightfield has to be callable from the hero's feet without raycasting a mesh.
 *
 * ## Determinism
 *
 * Three rules, and between them a world can never rearrange itself:
 *
 *   1. Every random number comes from an integer hash of (seed, lattice coordinates, salt).
 *      There is no stream, no cursor and no `Math.random`. A prop's existence, position,
 *      kind and size are a pure function of where it is — so generating chunk A does not
 *      change chunk B, and generating them in a different order changes nothing.
 *   2. Props live on GLOBAL lattices, not on per-chunk grids. A lattice cell belongs to the
 *      world, not to a chunk, so a prop that straddles a chunk edge is the same prop whichever
 *      chunk asked for it, and a wood does not grow a fence-line along a chunk boundary.
 *   3. Nothing reads the clock, the platform, locale, or floating-point-sensitive library
 *      calls beyond `Math.sin/exp/hypot/floor`, all of which are exact-enough IEEE ops here.
 *
 * The test asserts (1) by generating the same seed twice and comparing every field of every
 * prop, and (3) by generating chunks in a shuffled order and comparing against sorted order.
 */

import { BUILDING_SLOTS, buildingFootprint, CASTLE_FOOTPRINTS, CASTLE_POSITION, PLACES, SPAWN, TERRAIN, VILLAGE_SIZE, WORLD_SIZE, type Vec2 } from "@/lib/realm/layout";

/* --- how big, and why ---------------------------------------------------- */

/**
 * Half-extent of the realm. The world is 640 units across.
 *
 * The number comes from the hero, not from taste. The 3D spike walks at 11 units a second.
 * Today's patch is 132 across, so a child crosses the entire world in twelve seconds and
 * meets the invisible wall before they have decided where they were going. At 640 across,
 * crossing the realm end to end is about a minute of running, and any one journey — village
 * to a named place, one place on to the next — is ten to forty seconds. That is the unit
 * this is tuned in: a JOURNEY should cost about as long as a child will keep walking without
 * being shown something, which is roughly fifteen seconds.
 *
 * It is a FIXED ISLAND, not an endless streamed plane, and that is a judgement not a shortcut:
 *
 *   - An island has a visible edge. A coastline says "this is the end of the realm" in a way
 *     that fog and a clamped coordinate never will, and it costs nothing to draw.
 *   - A bounded world fits on one minimap. A child choosing where to go next needs to see
 *     everywhere they could go; an endless world can only ever show them where they are.
 *   - It is finishable. "I have been to all of it" is a real reward for an eight-year-old and
 *     an endless world can never give it.
 *   - The whole thing generates in well under a second, so there is no streaming machinery,
 *     no pop-in budget per frame, and no chunk format to version in a save file.
 *
 * What endless would have bought — more land — is the thing we have the least use for. An
 * empty world is worse than a small full one. 640² is already twenty-five times the authored
 * world's area; the risk is filling it, not running out.
 *
 * Props are still generated per chunk and cached, so a consumer that wants to stream can.
 * The bound is on the world, not on the machinery.
 */
export const WORLD_HALF = 320;
/**
 * Below this height the ground is under water.
 *
 * The village floor is the world's zero — `buildWorldLayout()` puts everything on y = 0 and
 * that cannot change — so the sea is six units below the village green. Close enough that
 * walking down to a beach is a slope and not a cliff, deep enough that the village is never
 * in danger of being a puddle.
 */
export const SEA_LEVEL = -6;
/** The hero's clamp: just inside the beach, so the edge a child meets is sand rather than nothing. */
export const WALK_HALF = WORLD_HALF - 8;

/** Prop lookup granularity. One chunk is about three seconds of walking. */
export const CHUNK = 32;
/** How far a prop may sit outside the chunk that owns it: half the largest lattice cell's jitter. */
const CHUNK_OVERHANG = 8;

/** The authored square from `layout.ts`. Nothing is generated inside it. */
const CORE_HALF = WORLD_SIZE / 2;
/** ...and generated density is feathered in over this band, so the authored wood has no hard edge. */
const CORE_FEATHER = 22;

/** The village keeps a flat floor out to here... */
export const VILLAGE_FLAT = 26;
/** ...and is blended into full relief by here. */
export const VILLAGE_RAMP = 58;
/**
 * How much of the surrounding relief survives inside the flat disc.
 *
 * Not zero. `buildWorldLayout()` puts every building, path tile and villager on y = 0 and knows
 * nothing about hills, so a faithful reading would hold the village dead flat — and a dead-flat
 * disc in the middle of rolling ground looks like a bug from the air. A seventh of the relief
 * is well under a metre across the whole village: enough for the light to find an edge, gentle
 * enough that a house with a plinth under it does not float.
 */
const VILLAGE_RELIEF = 0.14;

/* --- noise --------------------------------------------------------------- */

/**
 * Integer hash, not `sin(x * 12.9898) * 43758.5`.
 *
 * The sine trick is the usual shader idiom and it is wrong here for two reasons: it is slow
 * (a transcendental per lattice corner, four per octave, twenty per height query) and it is
 * not reliably identical across engines at large coordinates. `Math.imul` is exact 32-bit
 * multiplication defined by the spec, so this returns the same bits on every machine forever.
 */
function hash2(x: number, z: number, salt: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(salt, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 668265263);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise on the unit lattice, smoothstepped. 0..1. No allocation. */
function vnoise(x: number, z: number, salt: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, salt);
  const b = hash2(xi + 1, zi, salt);
  const c = hash2(xi, zi + 1, salt);
  const d = hash2(xi + 1, zi + 1, salt);
  const top = a + (b - a) * u;
  const bot = c + (d - c) * u;
  return top + (bot - top) * v;
}

/** Fractal value noise, `oct` octaves, each half the amplitude and twice the frequency. 0..1. */
function fbm(x: number, z: number, salt: number, oct: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fz = z;
  for (let i = 0; i < oct; i++) {
    sum += vnoise(fx, fz, salt + i * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.03; // not exactly 2: an exact doubling lines every octave's lattice up on the
    fz *= 2.03; // same points and the result grids visibly at the low frequencies.
  }
  return sum / norm;
}

/** Ridged noise: the fold turns smooth lumps into crests with real spines. 0..1. */
function ridged(x: number, z: number, salt: number, oct: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fz = z;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise(fx, fz, salt + i * 2027) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.03;
    fz *= 2.03;
  }
  return sum / norm;
}

/* --- biomes -------------------------------------------------------------- */

/**
 * Nine surfaces. Every one of them is a pure function of the land — height above the sea,
 * how wet the ground is, and how steeply it falls away. None of them is painted on a map.
 *
 * That matters for more than tidiness: because a biome is derived, the marsh is always
 * actually in a hollow, the crag is always actually on a cliff, and the shore is always
 * actually at the water. A child cannot find the exception, because there is none.
 */
export type Biome = "ocean" | "shore" | "marsh" | "meadow" | "wood" | "forest" | "heath" | "moor" | "crag";

export const BIOME_NAMES: Record<Biome, string> = {
  ocean: "open water",
  shore: "the shore",
  marsh: "the marshes",
  meadow: "meadow",
  wood: "open wood",
  forest: "deep forest",
  heath: "heath",
  moor: "the high moor",
  crag: "crags",
};

/** A colour per biome, for the minimap and for the contour proof. Not a material. */
export const BIOME_COLORS: Record<Biome, string> = {
  ocean: "#2c5f86",
  shore: "#c9b489",
  marsh: "#5f7355",
  meadow: "#7d8f4a",
  wood: "#5a7a3c",
  forest: "#33502c",
  heath: "#7c6f45",
  moor: "#8a8161",
  crag: "#8d8b84",
};

/**
 * Classify one point. Order matters: water first, then the things that are about being steep
 * or high, then the things that are about being wet.
 */
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

/* --- reservations: the part of the world that is not allowed to move ------ */

/**
 * The hard constraint. Eight building sites, their villagers, the castle, the spawn point and
 * five named places have fixed positions that saves and game logic depend on, and the five
 * authored tracks have to still reach the places they lead to.
 *
 * So the generator is handed a list of things it must respect, and every one of them is DERIVED
 * from `layout.ts` rather than retyped here. That is deliberate: a copied coordinate is a
 * coordinate that will drift the first time somebody nudges a building, and the failure would be
 * silent — a tree inside the chapel. The tracks in particular are read from the exported
 * `TERRAIN` patches of kind `trail`, which is the ribbon the scene actually draws, so what is
 * protected is exactly what is on screen.
 */
export type Reservation =
  /** Ground held to a level: the village square, a building's plot, a landmark's clearing. */
  | { kind: "flat"; x: number; z: number; w: number; d: number; feather: number; datum: number; noProps: boolean; priority: number }
  /** Nothing may be generated within `r` of here, but the ground is left alone. */
  | { kind: "clear"; x: number; z: number; r: number; priority: number }
  /** A graded corridor between two points: cut and filled to a walkable ramp, and kept empty. */
  | { kind: "road"; ax: number; az: number; bx: number; bz: number; halfWidth: number; aY: number; bY: number; priority: number };

/**
 * Who wins where two reservations overlap.
 *
 * They are applied in order and each one drags the ground towards its own level, so the last
 * one to touch a point decides it. That has to be an explicit ranking rather than the order
 * somebody happened to push them in: the authored mill pool sits five units from the village
 * fence, and the first version of this dug a seven-unit crater into the village green because
 * a lake was added to the list after the square was.
 */
const PRIORITY = { water: 0, track: 1, road: 1, landmark: 1, place: 2, village: 3, site: 4 } as const;

/** How far a reservation can reach, for the lookup grid. */
function reservationReach(r: Reservation): number {
  if (r.kind === "clear") return r.r;
  if (r.kind === "road") return r.halfWidth * 2.4;
  return Math.max(r.w, r.d) / 2 + r.feather;
}

/** Squared distance from a point to a segment, plus where along it the foot fell. */
function segmentT(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  if (len2 === 0) return 0;
  const t = ((px - ax) * vx + (pz - az) * vz) / len2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/* --- the world ----------------------------------------------------------- */

/** One generated thing standing on the ground. */
export type WorldProp = {
  id: string;
  /**
   * The figure the scene already knows how to draw. Strictly the eleven variants
   * `layout.ts` already emits — oak, pine, bush, rock, menhir, fence, lantern, signpost,
   * boat, cart, scarecrow — so a wider world needs no new art to be walkable today.
   */
  variant: string;
  /**
   * ...and what it actually IS: "heather", "reed", "boulder", "standing stone". The scene may
   * ignore this entirely. It is here so that the day somebody models a reed, the reeds can
   * become reeds without regenerating a single position.
   */
  role: string;
  /**
   * Which lattice grew it, which is the same thing as how big a thing it is — `under` is
   * knee-high scatter, `feature` is the great oak you can see from the next valley. The scene
   * draws each lattice out to its own horizon, because a fern at a hundred units is four pixels
   * of cost and no pixels of picture.
   */
  layer: "under" | "canopy" | "boulder" | "feature";
  x: number;
  z: number;
  /** Ground height at (x, z), computed once here so the scene never has to ask again. */
  y: number;
  scale: number;
  /** Trunks and boulders above a size are walked around. Nothing else ever blocks. */
  solid: boolean;
  biome: Biome;
};

/** Somewhere worth walking to, found in the terrain rather than chosen on a map. */
export type Landmark = {
  id: string;
  name: string;
  /** What is here, in one clause — the same contract as `RealmPlace.line`. */
  line: string;
  position: Vec2;
  /** Ground height at the landmark, so a marker can be placed without a second query. */
  y: number;
  radius: number;
  biome: Biome;
  /** `place` is one of the five authored ones, carried through unmoved. */
  kind: "place" | "summit" | "deepwood" | "tarn" | "cove" | "mire" | "outcrop";
};

/** A way between two landmarks: a polyline the scene can draw as a trail ribbon. */
export type Road = { id: string; from: string; to: string; points: Vec2[]; halfWidth: number };

export type WorldOptions = {
  seed?: number;
  /** Override the extent. The default is argued for above; tests use a small one to run fast. */
  half?: number;
  /** Skip the authored core's reservations entirely — for testing the raw fields. */
  bare?: boolean;
};

export type RealmWorld = {
  readonly seed: number;
  readonly half: number;
  readonly sea: number;
  /** Ground height at a world point. Constant cost, zero allocation. See the note on the method. */
  heightAt(x: number, z: number): number;
  /** Steepness, by central difference. Four height queries. */
  slopeAt(x: number, z: number, eps?: number): number;
  /** How wet the ground is here, 0..1. One fbm. */
  moistureAt(x: number, z: number): number;
  /** The surface at a point. About six height queries — do not call it per prop per frame. */
  biomeAt(x: number, z: number): Biome;
  isWater(x: number, z: number): boolean;
  /**
   * The height of the water surface that governs this point: `SEA_LEVEL` almost everywhere,
   * and a pool's own level inside the basin of one of the authored bodies of water that stand
   * above the sea. Depth anywhere is `waterLevelAt - heightAt`, when that is positive.
   */
  waterLevelAt(x: number, z: number): number;
  /** Bulk height sampling into a caller-owned array, for building a terrain mesh. No allocation. */
  sampleHeights(x0: number, z0: number, step: number, nx: number, nz: number, out: Float32Array): Float32Array;
  /** The props in one chunk. Generated on first ask, then cached and shared — never copied. */
  chunkProps(cx: number, cz: number): readonly WorldProp[];
  /** Every prop within `radius`, handed one at a time. Allocates nothing after the first visit. */
  forEachPropNear(x: number, z: number, radius: number, visit: (p: WorldProp) => void): void;
  /** The same, collected into a caller-owned array. Convenience; `forEachPropNear` is the cheap one. */
  propsNear(x: number, z: number, radius: number, out: WorldProp[]): WorldProp[];
  /** Force the chunks around a point to exist now, so no frame pays for a first visit. */
  warmAround(x: number, z: number, radius: number): void;
  /** Everything, for a one-shot emit or a map. Expensive on purpose; it touches every chunk. */
  allProps(): WorldProp[];
  readonly landmarks: readonly Landmark[];
  readonly roads: readonly Road[];
  /** Which landmark the hero is standing in, or null. Same shape as `placeAt`. */
  landmarkAt(x: number, z: number): Landmark | null;
  readonly chunkSpan: number;
};

/* --- prop palettes ------------------------------------------------------- */

/**
 * Four lattices, coarse to fine, and one density per biome per lattice.
 *
 * A lattice is a global grid: cell (i, j) of lattice L either holds one thing or holds nothing,
 * decided by `hash(seed, L, i, j)` against the density where that cell sits. Because the cell
 * belongs to the WORLD and not to a chunk, two neighbouring chunks agree about the tree on the
 * line between them without talking to each other, and there is no rejection loop, no quadratic
 * spacing test, and no generation order to get wrong.
 *
 * Jitter is held to 62% of a cell so two neighbours can never be closer than 0.38 of the cell
 * width. That is the spacing guarantee, for free, instead of the grid-and-retry the authored
 * world needs.
 */
type Layer = { salt: number; cell: number; jitter: number };
const LAYERS: Record<"under" | "canopy" | "boulder" | "feature", Layer> = {
  under: { salt: 7001, cell: 1.8, jitter: 0.62 },
  /**
   * 3.2, not 2.1 — and the reason is the camera, not the look.
   *
   * At 2.1 the deep forest is a canopy every two units with crowns two to five units across,
   * which is a closed ceiling: walk a child into it and there is no angle, at any boom length,
   * from which they can be seen. It was drawn, played and photographed at 2.1, and the picture
   * is a screen of solid green with the hero somewhere inside it.
   *
   * At 3.2 the same densities give the deep wood a tree every three and a bit units — still
   * unmistakably a forest to walk through, still closing over the child in patches, but with
   * gaps the light and the camera can both get through. The clumping field does the rest: the
   * thickets are still thickets, they are just not everywhere.
   */
  canopy: { salt: 7103, cell: 3.2, jitter: 0.62 },
  boulder: { salt: 7207, cell: 6.5, jitter: 0.6 },
  feature: { salt: 7309, cell: 17, jitter: 0.55 },
};
const LAYER_KEYS = ["under", "canopy", "boulder", "feature"] as const;
type LayerKey = (typeof LAYER_KEYS)[number];

/** Chance a cell of each lattice is occupied, per biome. This is the whole look of the world. */
const DENSITY: Record<Biome, Record<LayerKey, number>> = {
  ocean: { under: 0, canopy: 0, boulder: 0, feature: 0 },
  shore: { under: 0.22, canopy: 0.02, boulder: 0.14, feature: 0.06 },
  marsh: { under: 0.78, canopy: 0.06, boulder: 0.02, feature: 0.05 },
  // A meadow is meant to be the ground you can RUN across. At a gorse bush every five units it
  // was furnished like a wood with the trees taken out; at eight it is open grass with
  // something in it, which is what makes stepping into the trees feel like stepping into them.
  // ...but open is not the same as empty, and the first walk north out of the village came out
  // as a putting green. What furnishes open country is not more gorse, it is TREES you can see
  // from a long way off: a hedgerow oak every ten units or so and a great field oak every
  // thirty, both of which are drawn out to the far horizon where the undergrowth is not.
  meadow: { under: 0.1, canopy: 0.07, boulder: 0.05, feature: 0.28 },
  // The wood and the forest lost a third of their undergrowth when the canopy lattice opened
  // out. Not book-keeping: at a fern every 1.8 units the forest floor is a mat, and a mat under
  // a ceiling is why the first drawn version of the deep wood had no forest in it to look at —
  // what a child should see in there is trunks, with the ferns in patches between them.
  wood: { under: 0.17, canopy: 0.45, boulder: 0.1, feature: 0.22 },
  forest: { under: 0.2, canopy: 0.95, boulder: 0.06, feature: 0.34 },
  heath: { under: 0.42, canopy: 0.12, boulder: 0.24, feature: 0.14 },
  moor: { under: 0.34, canopy: 0.025, boulder: 0.48, feature: 0.24 },
  crag: { under: 0.12, canopy: 0.012, boulder: 0.55, feature: 0.3 },
};

type Pick = { variant: string; role: string; lo: number; hi: number };
/** What each biome grows on each lattice. Repeat an entry to weight it. */
const PALETTE: Record<Biome, Record<LayerKey, Pick[]>> = {
  ocean: { under: [], canopy: [], boulder: [], feature: [] },
  shore: {
    under: [{ variant: "bush", role: "marram", lo: 0.5, hi: 0.9 }, { variant: "rock", role: "shingle", lo: 0.3, hi: 0.6 }],
    canopy: [{ variant: "pine", role: "wind-bent pine", lo: 0.9, hi: 1.4 }],
    boulder: [{ variant: "rock", role: "boulder", lo: 0.8, hi: 1.6 }],
    feature: [{ variant: "rock", role: "sea rock", lo: 1.6, hi: 2.4 }],
  },
  marsh: {
    under: [{ variant: "bush", role: "reed", lo: 0.6, hi: 1.1 }, { variant: "bush", role: "reed", lo: 0.6, hi: 1.1 }, { variant: "bush", role: "sedge", lo: 0.45, hi: 0.8 }],
    canopy: [{ variant: "oak", role: "willow", lo: 1, hi: 1.6 }],
    boulder: [{ variant: "rock", role: "mossy stone", lo: 0.5, hi: 0.9 }],
    feature: [{ variant: "oak", role: "drowned oak", lo: 1.8, hi: 2.4 }],
  },
  meadow: {
    under: [{ variant: "bush", role: "gorse", lo: 0.6, hi: 1.1 }, { variant: "rock", role: "field stone", lo: 0.4, hi: 0.7 }],
    canopy: [{ variant: "oak", role: "hedgerow oak", lo: 1.1, hi: 1.8 }],
    boulder: [{ variant: "rock", role: "boulder", lo: 0.8, hi: 1.4 }],
    feature: [{ variant: "oak", role: "field oak", lo: 1.9, hi: 2.6 }],
  },
  wood: {
    under: [{ variant: "bush", role: "bramble", lo: 0.7, hi: 1.25 }, { variant: "bush", role: "fern", lo: 0.6, hi: 1 }],
    canopy: [{ variant: "oak", role: "oak", lo: 1.1, hi: 1.9 }, { variant: "pine", role: "pine", lo: 1.1, hi: 1.9 }, { variant: "oak", role: "oak", lo: 1, hi: 1.7 }],
    boulder: [{ variant: "rock", role: "boulder", lo: 0.7, hi: 1.3 }],
    feature: [{ variant: "oak", role: "great oak", lo: 2, hi: 2.8 }],
  },
  forest: {
    under: [{ variant: "bush", role: "fern", lo: 0.7, hi: 1.3 }, { variant: "bush", role: "bramble", lo: 0.7, hi: 1.2 }],
    canopy: [{ variant: "pine", role: "pine", lo: 1.2, hi: 2.2 }, { variant: "oak", role: "oak", lo: 1.2, hi: 2.1 }, { variant: "pine", role: "pine", lo: 1.3, hi: 2.3 }, { variant: "oak", role: "oak", lo: 1.1, hi: 1.9 }],
    boulder: [{ variant: "rock", role: "mossy boulder", lo: 0.7, hi: 1.3 }],
    feature: [{ variant: "oak", role: "great oak", lo: 2.2, hi: 3 }, { variant: "pine", role: "old pine", lo: 2.2, hi: 3 }],
  },
  heath: {
    under: [{ variant: "bush", role: "heather", lo: 0.55, hi: 0.95 }, { variant: "bush", role: "gorse", lo: 0.6, hi: 1.1 }],
    canopy: [{ variant: "pine", role: "scots pine", lo: 1, hi: 1.7 }],
    boulder: [{ variant: "rock", role: "boulder", lo: 0.8, hi: 1.5 }],
    feature: [{ variant: "menhir", role: "standing stone", lo: 2, hi: 2.8 }],
  },
  moor: {
    under: [{ variant: "bush", role: "heather", lo: 0.5, hi: 0.9 }, { variant: "rock", role: "scree", lo: 0.4, hi: 0.8 }],
    canopy: [{ variant: "pine", role: "wind-bent pine", lo: 0.9, hi: 1.3 }],
    boulder: [{ variant: "rock", role: "boulder", lo: 0.9, hi: 1.8 }, { variant: "rock", role: "boulder", lo: 0.8, hi: 1.5 }],
    feature: [{ variant: "menhir", role: "standing stone", lo: 2.2, hi: 3.2 }, { variant: "rock", role: "erratic", lo: 2, hi: 2.8 }],
  },
  crag: {
    under: [{ variant: "rock", role: "scree", lo: 0.4, hi: 0.8 }, { variant: "bush", role: "heather", lo: 0.45, hi: 0.8 }],
    canopy: [{ variant: "pine", role: "clinging pine", lo: 0.9, hi: 1.4 }],
    boulder: [{ variant: "rock", role: "crag stone", lo: 1, hi: 2 }],
    feature: [{ variant: "rock", role: "tor", lo: 2.4, hi: 3.4 }],
  },
};

/** Only a big trunk or a big stone ever blocks the hero. A gorse bush you bounce off is a bug. */
const SOLID_MIN_SCALE = 1.9;
const SOLID_VARIANTS = new Set(["oak", "pine", "rock", "menhir"]);
/** Trees will not stand on anything steeper than this. Bushes and stones will. */
const TREE_MAX_SLOPE = 0.42;

/* --- landmark naming ----------------------------------------------------- */

const NAME_PARTS: Record<Landmark["kind"], { names: string[]; lines: string[] }> = {
  place: { names: [], lines: [] },
  summit: {
    names: ["Skyreach", "Windward Top", "The Watchstone", "Cloudfoot", "Thunder Head", "Greyman's Seat", "The Far Crown"],
    lines: ["The whole realm is under you from here.", "A beacon, and a very long way down.", "You can see the village from up here.", "The wind never stops on this one."],
  },
  deepwood: {
    names: ["Owl's Hollow", "The Still Glade", "Thornhall", "The Green Deep", "Mosswell", "Elderglade"],
    lines: ["A clearing in the middle of the deep wood.", "Nothing here but old trees and quiet.", "A ring of ferns where the canopy opens.", "The trees stand back from this spot."],
  },
  tarn: {
    names: ["Black Tarn", "The Quiet Pool", "Silvermere", "Coldwater", "Moon Pool"],
    lines: ["A small lake with the sky in it.", "Still water, high up and cold.", "A pool the wind never reaches."],
  },
  cove: {
    names: ["Gullbay", "The Shell Strand", "Driftwood Cove", "Longsands", "Anchor Bight"],
    lines: ["A curve of sand, and the sea.", "A boat is pulled up here.", "The waves come right up the beach."],
  },
  mire: {
    names: ["The Sunken Ways", "Frogmarsh", "Willowmire", "The Reedlands"],
    lines: ["Reeds taller than you are.", "Wet underfoot, and full of birds.", "A island of dry ground in the reeds."],
  },
  outcrop: {
    names: ["The Broken Tor", "Ravenstone", "The Giant's Chair", "Split Rock", "Old Grey"],
    lines: ["A tower of rock standing on the moor.", "Stone piled up by nobody.", "A crag with a view of the coast."],
  },
};

/* --- construction -------------------------------------------------------- */

export const DEFAULT_SEED = 20260918;

export function createWorld(options: WorldOptions = {}): RealmWorld {
  const seed = options.seed ?? DEFAULT_SEED;
  const half = options.half ?? WORLD_HALF;
  const bare = options.bare ?? false;

  /* ---- the raw land, before anything is protected ---- */

  /**
   * The relief: rolling ground, the high country and the drowned basin, with a mean of about
   * zero near the village.
   *
   * The shape is not arbitrary. Each term continues something the authored core already says,
   * so that a child walking out of a region walks into MORE of it rather than into a different
   * world with a line down the middle:
   *
   *   - the fells are north (`z` negative) in `layout.ts`, so the mountain mask grows northward
   *     and the realm's high country is the fells, continued and made worth climbing;
   *   - Longwater is north-east, so the basin term drowns the north-east and Longwater becomes
   *     the near end of a real inland sea;
   *   - the Old Wood is west, so the moisture field is biased west and the forest keeps going;
   *   - the fields and the orchard are east and south on flat ground, so the south-east is held
   *     low and gentle and reads as farmland running out into meadow.
   *
   * The join is invisible because the two halves agree about what is where, not because the
   * numbers happen to meet at the boundary.
   *
   * The octaves are written out rather than handed to `fbm`, because the amplitude-per-
   * wavelength of each one IS the walkability of the world and a halving series gets it wrong.
   * The first map this generated classified a tenth of the land as `crag`: four octaves at
   * halving amplitude put nine units of relief on a nineteen-unit wavelength, which is a
   * one-in-one slope everywhere, and the biome rule that says "steep ground is rock" was
   * simply telling the truth about a world made of gravel. Each line below is amplitude over
   * wavelength ≈ 0.3 or less, and that ratio is the whole difference between hills and scree.
   */
  function relief(x: number, z: number, ox: number, oz: number): number {
    const u = x + ox;
    const v = z + oz;
    let h = (vnoise(u * 0.005, v * 0.005, seed ^ 0x1a3b) - 0.5) * 48; // ~200u across, ±24
    h += (vnoise(u * 0.0125 + 3.7, v * 0.0125 - 2.2, seed ^ 0x2c71) - 0.5) * 15;
    h += (vnoise(u * 0.031 - 1.1, v * 0.031 + 4.4, seed ^ 0x3f19) - 0.5) * 4.2;
    h += (vnoise(u * 0.082 + 7.2, v * 0.082 - 3.3, seed ^ 0x5c8d) - 0.5) * 1.3;

    // The high country, north. Ridged noise gives it spines and passes instead of domes, so
    // there is a way up and a way round and they are not the same way.
    const northward = smoothstep(120, -0.35 * half, z);
    // Long wavelength on purpose. A mountain is tall AND wide, or it is a spike of scree: at
    // a 180-unit wavelength a 90-unit peak is a one-in-one face and the whole range classifies
    // as `crag`, which is the biome rule correctly reporting that nobody can walk up there.
    const spine = ridged(u * 0.0038 + 7.7, v * 0.0038 + 1.9, seed ^ 0x4d07, 3);
    h += spine * 86 * northward * northward;

    // Valleys, everywhere. Ridged noise turned upside down carves a branching network rather
    // than round dips, which is what water would have done and what makes a map of an interior
    // worth reading: a way through the hills, a hollow that holds a tarn, somewhere lower to
    // walk down into. Without it the middle of the island is one smooth dome and every walk
    // across it is the same walk.
    h -= (ridged(u * 0.0072 + 13.1, v * 0.0072 - 9.4, seed ^ 0x6e11, 2) - 0.32) * 21;

    // The low gentle south-east, where the ploughed fields run out into meadow.
    const px = (x - half * 0.4) / (half * 0.55);
    const pz = (z - half * 0.3) / (half * 0.5);
    h *= 1 - 0.6 * Math.exp(-(px * px + pz * pz));

    // The realm rises away from the home vale. Ten units over two hundred is a twentieth of a
    // slope — nothing to walk — but it is what keeps the land around the village from being
    // half lake, and it makes "outward" mean "upward", which is worth something on its own.
    h += 16 * smoothstep(50, 210, Math.hypot(x, z));

    // The drowned north-east: Longwater's basin, opened out to the sea.
    const bx = (x - half * 0.42) / (half * 0.4);
    const bz = (z + half * 0.48) / (half * 0.34);
    h -= 42 * Math.exp(-(bx * bx + bz * bz));
    return h;
  }

  /**
   * Where the noise lattice is sampled from.
   *
   * The village cannot move, and the village floor has to be the world's zero. The obvious fix —
   * subtract whatever the noise says at the origin — shifts the entire world by up to twenty-five
   * units and turns a seed into an ocean or into the Alps. Subtracting it only locally is worse:
   * it digs a conical pit two hundred units wide with the village at the bottom.
   *
   * So the generator does not move the village and does not bend the land to meet it. It moves
   * the NOISE, until the noise agrees with the village that is already there. Sixty-four
   * candidate offsets are scored on what a village needs — near zero at the green, no water and
   * no mountain anywhere in the authored square, and gentle ground to walk out onto — and the
   * best one is kept. Deterministic, a couple of milliseconds, and the result is a village
   * sitting in ground that genuinely suits it rather than ground that was flattened to.
   */
  function scoreOffset(ox: number, oz: number): number {
    let worst = Math.abs(relief(0, 0, ox, oz)) * 3;
    // Four rings across the authored square and a little beyond it.
    for (const r of [22, 48, 78, 104]) {
      for (let a = 0; a < 12; a++) {
        const th = (a / 12) * Math.PI * 2;
        const h = relief(Math.cos(th) * r, Math.sin(th) * r, ox, oz);
        // Drowned core, or a mountain in the middle of it, are both disqualifying.
        if (h < SEA_LEVEL + 7) worst += (SEA_LEVEL + 7 - h) * 5;
        if (h > 34) worst += (h - 34) * 2;
        // ...and the ground immediately around the village should be gentle.
        worst += Math.abs(h) * (r < 40 ? 0.45 : 0.3);
      }
    }
    /**
     * And then the land is asked to make the authored world's promises true.
     *
     * `PLACES` does not only say where the five places are; it says what they ARE. Highcairn
     * is "the highest stones in the realm", Longwater is a lake, Farfurrow is the last field.
     * Those are sentences a child is told on arrival, and terrain that contradicts them is a
     * lie the game tells out loud — a cairn in a bog, a lake on a hilltop. Since the offset is
     * free to move anyway, it may as well move to ground that agrees.
     */
    const cairn = relief(-33, -48, ox, oz); // Highcairn: it has to be up
    worst += Math.max(0, 20 - cairn) * 3;
    // Longwater: a basin, not a shoulder. Sampled over the lake itself and the shore the
    // lake path arrives on, because a lake bed reserved at sea level under ground standing
    // twenty units above it is not a lake, it is a quarry with a cliff round it.
    for (const wet of [
      [42, -48], // the body of Longwater
      [30, -44],
      [33, -37], // the shore the lake path arrives on, where the boat is pulled up
      [29, -10], // the mill pool
    ]) {
      worst += Math.max(0, relief(wet[0], wet[1], ox, oz) - 4) * 3;
    }
    for (const flat of [
      [55, -1], // Farfurrow, the last ploughed field
      [-2, 55], // Appleway, where the south road runs out
      [-53, 0], // the Ringstones, in the Old Wood
    ]) {
      worst += Math.abs(relief(flat[0], flat[1], ox, oz)) * 0.7;
    }
    return worst;
  }

  let noiseOX = 0;
  let noiseOZ = 0;
  {
    let best = Infinity;
    for (let i = 0; i < 64; i++) {
      const ox = (hash2(i, 17, seed ^ 0x7f4a) - 0.5) * 40000;
      const oz = (hash2(i, 91, seed ^ 0x7f4a) - 0.5) * 40000;
      const s = scoreOffset(ox, oz);
      if (s < best) {
        best = s;
        noiseOX = ox;
        noiseOZ = oz;
      }
    }
  }

  /** Height before reservations: the relief, cut into an island. */
  function baseLand(x: number, z: number): number {
    // Island falloff, with a coastline warped by low-frequency noise so it is bays and
    // headlands rather than a dinner plate.
    const r = Math.hypot(x, z) / half;
    const warp = (fbm((x + noiseOX) * 0.0042 + 11.3, (z + noiseOZ) * 0.0042 - 5.1, seed ^ 0x51ed, 3) - 0.5) * 0.34;
    const continent = smoothstep(1.02, 0.56, r + warp);
    return relief(x, z, noiseOX, noiseOZ) * continent - (1 - continent) * 34;
  }

  /** The village's own datum: what `baseLand` says at the origin, so the flatten can cancel it. */
  const villageDatum = baseLand(0, 0);

  /**
   * Height with the village floor, but before roads and plots.
   *
   * Inside `VILLAGE_FLAT` this is the surrounding relief scaled down to a seventh and re-zeroed
   * on the origin, which puts the village at y ≈ 0 whatever the island does underneath it, and
   * ramps into the real land over `VILLAGE_RAMP`. Everything the reservations do afterwards is
   * measured against THIS, so a plot's datum is a real ground height and not a guess.
   */
  function villaged(x: number, z: number): number {
    const h = baseLand(x, z);
    const rv = Math.hypot(x, z);
    if (rv >= VILLAGE_FLAT + VILLAGE_RAMP) return h;
    const t = smoothstep(VILLAGE_FLAT, VILLAGE_FLAT + VILLAGE_RAMP, rv);
    const flat = (h - villageDatum) * VILLAGE_RELIEF;
    return flat + (h - flat) * t;
  }

  /* ---- reservations ---- */

  const reservations: Reservation[] = [];

  function flatRect(x: number, z: number, w: number, d: number, feather: number, noProps: boolean, priority: number): void {
    reservations.push({ kind: "flat", x, z, w, d, feather, datum: villaged(x, z), noProps, priority });
  }

  if (!bare) {
    // The village square itself, plus a margin: held level and never built on.
    flatRect(0, 0, VILLAGE_SIZE + 6, VILLAGE_SIZE + 6, 14, true, PRIORITY.village);
    // The castle and the eight building sites. Each gets its own plot, generously padded, so a
    // site is level even if the village's own flatten ever changes.
    const castle = CASTLE_FOOTPRINTS.citadel; // the largest tier: a plot must fit the castle it may become
    flatRect(CASTLE_POSITION.x, CASTLE_POSITION.z, castle.w + 6, castle.d + 6, 6, true, PRIORITY.site);
    for (const [id, slot] of Object.entries(BUILDING_SLOTS)) {
      const f = buildingFootprint(id);
      flatRect(slot.x, slot.z, f.w + 4, f.d + 4, 4, true, PRIORITY.site);
    }
    // The spawn point: a child must not appear on a slope.
    flatRect(SPAWN.x, SPAWN.z, 8, 8, 5, true, PRIORITY.site);
    // The five authored places, each on a level pad with its landmark's clearing kept open.
    for (const place of PLACES) {
      flatRect(place.position.x, place.position.z, 16, 16, 12, false, PRIORITY.place);
      reservations.push({ kind: "clear", x: place.position.x, z: place.position.z, r: place.radius, priority: PRIORITY.place });
    }
    /**
     * Longwater, the millstream and the mill pool, dug into the ground they stand in.
     *
     * Two things here, and the second one was a bug before it was a rule.
     *
     * The authored world is flat, so its lake is a blue rectangle painted on the floor. Put
     * that on real terrain and it is a blue rectangle floating on a hillside, so the
     * rectangles the scene already draws are dug out. But dug RELATIVE to the ground they sit
     * in, not down to the waterline: Longwater and the mill pool are inland water a few units
     * from the village, and sinking them to sea level puts a seven-unit cliff round each of
     * them — walked, a hole a child falls into on the way to the mill.
     *
     * And one lake gets one surface. Longwater is three overlapping rectangles, and giving
     * each of them its own level made the water a staircase: every rectangle dragged the
     * ground towards a different number, and where two feathers overlapped with two different
     * targets the bank came out at sixty degrees. Overlapping patches are therefore joined
     * into a body of water first, and the body gets a single level — the lowest of its parts,
     * because water finds the bottom.
     */
    {
      const wet = TERRAIN.filter((t) => t.kind === "water" || t.kind === "shallow");
      const parent = wet.map((_, i) => i);
      const find = (a: number): number => {
        let r = a;
        while (parent[r] !== r) r = parent[r];
        return r;
      };
      const overlaps = (a: (typeof wet)[number], b: (typeof wet)[number]) =>
        Math.abs(a.position.x - b.position.x) < (a.size.w + b.size.w) / 2 && Math.abs(a.position.z - b.position.z) < (a.size.d + b.size.d) / 2;
      for (let i = 0; i < wet.length; i++) {
        for (let j = i + 1; j < wet.length; j++) if (overlaps(wet[i], wet[j])) parent[find(j)] = find(i);
      }
      const level = new Map<number, number>();
      for (let i = 0; i < wet.length; i++) {
        const root = find(i);
        const h = villaged(wet[i].position.x, wet[i].position.z);
        const held = level.get(root);
        if (held === undefined || h < held) level.set(root, h);
      }
      for (let i = 0; i < wet.length; i++) {
        const patch = wet[i];
        // Deep water sits lower than the shallows it runs into, which is what makes a ford
        // a ford. Two and a half units is a bank you can stand on and a surface plainly lower
        // than the field, which is all a pool has to be.
        const dig = patch.kind === "water" ? 2.6 : 1.1;
        const datum = (level.get(find(i)) as number) - dig;
        // The bank is as wide as the cut is deep. A fixed feather is a fixed drop over a fixed
        // distance, so the far end of a lake whose ground falls four units across it gets a
        // bank four units steeper than the near end — which is how the north shore of Longwater
        // came out at sixty degrees. Three and a half to one holds every bank to about a
        // one-in-two slope whatever the lake is sitting on.
        reservations.push({
          kind: "flat",
          x: patch.position.x,
          z: patch.position.z,
          w: patch.size.w,
          d: patch.size.d,
          feather: Math.max(7, (villaged(patch.position.x, patch.position.z) - datum) * 3.6),
          datum,
          noProps: false,
          priority: PRIORITY.water,
        });
      }
    }
    // The five authored tracks, read from the ribbon the scene actually draws. Each tile
    // becomes a short graded corridor, so a track is never cut in half by a new hillside.
    for (const patch of TERRAIN) {
      if (patch.kind !== "trail") continue;
      reservations.push({
        kind: "road",
        priority: PRIORITY.track,
        ax: patch.position.x,
        az: patch.position.z,
        bx: patch.position.x,
        bz: patch.position.z,
        halfWidth: Math.max(patch.size.w, patch.size.d) / 2 + 1,
        aY: villaged(patch.position.x, patch.position.z),
        bY: villaged(patch.position.x, patch.position.z),
      });
    }
  }

  /**
   * A uniform grid over the reservations, so a height query does not walk a list that grows
   * every time somebody adds a road.
   *
   * Without it the authored tracks alone are ~180 corridors and every height query would test
   * all of them — and a height query runs per hero per frame and per vertex of every terrain
   * chunk. With it, a query looks up one cell and almost always finds nothing.
   */
  const RES_CELL = 24;
  const resGrid = new Map<number, number[]>();
  const touched = new Set<number>();
  const resKey = (cx: number, cz: number) => (cx + 4096) * 16384 + (cz + 4096);
  function indexReservations(from: number): void {
    for (let i = from; i < reservations.length; i++) {
      const r = reservations[i];
      const reach = reservationReach(r);
      const minX = (r.kind === "road" ? Math.min(r.ax, r.bx) : r.x) - reach;
      const maxX = (r.kind === "road" ? Math.max(r.ax, r.bx) : r.x) + reach;
      const minZ = (r.kind === "road" ? Math.min(r.az, r.bz) : r.z) - reach;
      const maxZ = (r.kind === "road" ? Math.max(r.az, r.bz) : r.z) + reach;
      for (let cx = Math.floor(minX / RES_CELL); cx <= Math.floor(maxX / RES_CELL); cx++) {
        for (let cz = Math.floor(minZ / RES_CELL); cz <= Math.floor(maxZ / RES_CELL); cz++) {
          touched.add(resKey(cx, cz));
          const k = resKey(cx, cz);
          const list = resGrid.get(k);
          if (list) {
            list.push(i);
            touched.add(k);
          } else resGrid.set(k, [i]);
        }
      }
    }
    // Stable by index within a priority, so the result never depends on push order.
    for (const k of touched) (resGrid.get(k) as number[]).sort((a, b) => reservations[a].priority - reservations[b].priority || a - b);
    touched.clear();
  }
  indexReservations(0);

  /**
   * Ground height at a world point.
   *
   * ## What it costs, honestly
   *
   * A fixed amount of arithmetic and not one allocation. Every value is a local number; there
   * are no objects, no arrays and no closures created per call, so this can run in a frame loop
   * forever without giving the collector anything to do.
   *
   * The arithmetic: four fbm evaluations (4 + 3 + 2 octaves of value noise plus 3 for the
   * coastline warp = 12 lattice samples of 4 hashes each = 48 integer hashes), one ridged fbm
   * (4 octaves = 16 hashes), two `Math.exp`, one `Math.hypot`, plus the village blend. Then one
   * `Map.get` on the reservation grid, which returns `undefined` for the overwhelming majority
   * of the world; where it does not, it is typically one to three corridors to test.
   *
   * Measured: 451ns a call, about 2.2 million a second. `biomeAt` is 2.4µs, because it is
   * five of these plus the moisture field — so it is a thing to call when the hero crosses
   * into a new patch of ground, not a thing to call per prop per frame.
   *
   * What that buys and what it does not: the hero's feet, the companion's and the camera's
   * are five calls a frame, which is two microseconds and free. A terrain mesh is not free —
   * one 128-unit chunk at one-unit resolution is 16k vertices and 12ms, and the whole 640-unit
   * world at that resolution would be 410k vertices and about a fifth of a second. That is why
   * `sampleHeights` exists, why it fills an array the caller owns, and why the scene should
   * build its ground a chunk at a time rather than as one mesh.
   */
  function heightAt(x: number, z: number): number {
    let h = villaged(x, z);
    const list = resGrid.get(resKey(Math.floor(x / RES_CELL), Math.floor(z / RES_CELL)));
    if (list === undefined) return h;
    for (let i = 0; i < list.length; i++) {
      const r = reservations[list[i]];
      if (r.kind === "clear") continue;
      if (r.kind === "flat") {
        // Distance outside the rectangle. Rounded at the corners rather than `max(dx, dz)`:
        // a square falloff meets itself on the diagonal, and two of them overlapping at a
        // corner stacked into a sixty-degree cliff on the north shore of Longwater. Taking
        // the true distance to the rectangle costs one hypot and the corner comes out round.
        const dx = Math.abs(x - r.x) - r.w / 2;
        const dz = Math.abs(z - r.z) - r.d / 2;
        const out = dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz);
        if (out >= r.feather) continue;
        const w = 1 - smoothstep(0, r.feather, Math.max(0, out));
        h += (r.datum - h) * w;
      } else {
        const t = segmentT(x, z, r.ax, r.az, r.bx, r.bz);
        const cxp = r.ax + (r.bx - r.ax) * t;
        const czp = r.az + (r.bz - r.az) * t;
        const d = Math.hypot(x - cxp, z - czp);
        const feather = r.halfWidth * 1.4;
        if (d >= r.halfWidth + feather) continue;
        // Full weight on the running surface, easing out over the verge, so a road is a
        // graded shelf with a bank either side rather than a trench with two walls.
        const w = 1 - smoothstep(r.halfWidth, r.halfWidth + feather, d);
        const datum = r.aY + (r.bY - r.aY) * t;
        h += (datum - h) * w;
      }
    }
    return h;
  }

  function moistureAt(x: number, z: number): number {
    // Wetness is mostly its own field, but the west is the Old Wood's side of the realm, so
    // the forest that starts in the authored core keeps going that way.
    const m = fbm((x + noiseOX) * 0.0091 + 31.7, (z + noiseOZ) * 0.0091 - 17.3, seed ^ 0x6b2d, 4);
    const west = smoothstep(0.3 * half, -0.55 * half, x) * 0.14;
    return Math.min(1, Math.max(0, (m - 0.5) * 1.55 + 0.5 + west));
  }

  function slopeAt(x: number, z: number, eps = 1.3): number {
    const dx = heightAt(x + eps, z) - heightAt(x - eps, z);
    const dz = heightAt(x, z + eps) - heightAt(x, z - eps);
    return Math.hypot(dx, dz) / (2 * eps);
  }

  function biomeAt(x: number, z: number): Biome {
    return classify(heightAt(x, z), moistureAt(x, z), slopeAt(x, z));
  }

  function waterLevelAt(): number {
    return SEA_LEVEL;
  }

  function isWater(x: number, z: number): boolean {
    return heightAt(x, z) < SEA_LEVEL;
  }

  function sampleHeights(x0: number, z0: number, step: number, nx: number, nz: number, out: Float32Array): Float32Array {
    let i = 0;
    for (let j = 0; j < nz; j++) {
      const z = z0 + j * step;
      for (let k = 0; k < nx; k++) out[i++] = heightAt(x0 + k * step, z);
    }
    return out;
  }

  /* ---- landmarks, found in the land ---- */

  /**
   * Nothing below is a coordinate somebody chose. The generator scans its own terrain on a
   * coarse grid and asks it questions — where is the highest ground, where is the wood deepest,
   * where is there water with no way out to the sea — and the answers become the places worth
   * walking to.
   *
   * That is the difference between a procedural world with landmarks and a procedural world
   * with scenery. A summit that is genuinely the highest point in the realm is worth climbing
   * once and remembering forever; a summit dropped at a plausible-looking coordinate is not,
   * and a child works out which one they are standing on faster than an adult does.
   */
  const SCAN = 8;
  const gridN = Math.floor((half * 2) / SCAN) + 1;
  const gh = new Float32Array(gridN * gridN);
  const gb = new Uint8Array(gridN * gridN);
  const BIOME_INDEX: Biome[] = ["ocean", "shore", "marsh", "meadow", "wood", "forest", "heath", "moor", "crag"];
  const gx = (i: number) => -half + (i % gridN) * SCAN;
  const gz = (i: number) => -half + Math.floor(i / gridN) * SCAN;

  for (let j = 0; j < gridN; j++) {
    for (let k = 0; k < gridN; k++) gh[j * gridN + k] = villaged(-half + k * SCAN, -half + j * SCAN);
  }
  // Slope from the scan grid itself rather than four more height queries per cell.
  for (let j = 0; j < gridN; j++) {
    for (let k = 0; k < gridN; k++) {
      const i = j * gridN + k;
      const hx = gh[j * gridN + Math.min(gridN - 1, k + 1)] - gh[j * gridN + Math.max(0, k - 1)];
      const hz = gh[Math.min(gridN - 1, j + 1) * gridN + k] - gh[Math.max(0, j - 1) * gridN + k];
      const slope = Math.hypot(hx, hz) / (2 * SCAN);
      gb[i] = BIOME_INDEX.indexOf(classify(gh[i], moistureAt(gx(i), gz(i)), slope));
    }
  }

  /**
   * How far every cell of a set is from the edge of that set, by two chamfer passes.
   *
   * "The deepest part of the wood" is a real thing you can compute, and it is a much better
   * landmark than "a cell that happens to be forest": it is the spot a child has to actually
   * go INTO the forest to reach, which is the only kind of clearing worth putting anything in.
   */
  function depthOf(match: (b: number, i: number) => boolean): Float32Array {
    const d = new Float32Array(gridN * gridN);
    const BIG = 1e9;
    for (let i = 0; i < d.length; i++) d[i] = match(gb[i], i) ? BIG : 0;
    const relax = (i: number, n: number, cost: number) => {
      if (d[n] + cost < d[i]) d[i] = d[n] + cost;
    };
    for (let j = 0; j < gridN; j++) {
      for (let k = 0; k < gridN; k++) {
        const i = j * gridN + k;
        if (d[i] === 0) continue;
        if (k > 0) relax(i, i - 1, SCAN);
        if (j > 0) relax(i, i - gridN, SCAN);
        if (k > 0 && j > 0) relax(i, i - gridN - 1, SCAN * 1.414);
        if (k < gridN - 1 && j > 0) relax(i, i - gridN + 1, SCAN * 1.414);
      }
    }
    for (let j = gridN - 1; j >= 0; j--) {
      for (let k = gridN - 1; k >= 0; k--) {
        const i = j * gridN + k;
        if (d[i] === 0) continue;
        if (k < gridN - 1) relax(i, i + 1, SCAN);
        if (j < gridN - 1) relax(i, i + gridN, SCAN);
        if (k < gridN - 1 && j < gridN - 1) relax(i, i + gridN + 1, SCAN * 1.414);
        if (k > 0 && j < gridN - 1) relax(i, i + gridN - 1, SCAN * 1.414);
      }
    }
    for (let i = 0; i < d.length; i++) if (d[i] > 1e8) d[i] = 0;
    return d;
  }

  const forestDepth = depthOf((b) => BIOME_INDEX[b] === "forest" || BIOME_INDEX[b] === "wood");
  const marshDepth = depthOf((b) => BIOME_INDEX[b] === "marsh");
  const landDepth = depthOf((b) => BIOME_INDEX[b] !== "ocean");

  /**
   * Which water is the sea, by flooding inward from the rim.
   *
   * The first pass at this asked for "water a long way from land" and got the middle of the
   * Atlantic, because that is a perfectly good answer to the question as asked. A tarn is not
   * water far from land; it is water with NO WAY OUT, and connectivity is the only thing that
   * knows the difference. Everything the flood does not reach is a lake.
   */
  const isSea = new Uint8Array(gridN * gridN);
  {
    const stack: number[] = [];
    const pushIf = (i: number) => {
      if (isSea[i] === 0 && BIOME_INDEX[gb[i]] === "ocean") {
        isSea[i] = 1;
        stack.push(i);
      }
    };
    for (let k = 0; k < gridN; k++) {
      pushIf(k);
      pushIf((gridN - 1) * gridN + k);
      pushIf(k * gridN);
      pushIf(k * gridN + gridN - 1);
    }
    while (stack.length > 0) {
      const i = stack.pop() as number;
      const k = i % gridN;
      const j = (i / gridN) | 0;
      if (k > 0) pushIf(i - 1);
      if (k < gridN - 1) pushIf(i + 1);
      if (j > 0) pushIf(i - gridN);
      if (j < gridN - 1) pushIf(i + gridN);
    }
  }

  /**
   * What fraction of the ground within about fifty units of each cell is dry, by a separable
   * box blur.
   *
   * This is how a cove is told from a headland. Both are beach with the sea on one side; the
   * difference is entirely whether the LAND wraps round you or you wrap round the sea, and that
   * is a neighbourhood question, not a local one.
   */
  const BLUR = 6;
  const landFrac = new Float32Array(gridN * gridN);
  {
    const tmp = new Float32Array(gridN * gridN);
    for (let j = 0; j < gridN; j++) {
      for (let k = 0; k < gridN; k++) {
        let sum = 0;
        let n = 0;
        for (let d = -BLUR; d <= BLUR; d++) {
          const kk = k + d;
          if (kk < 0 || kk >= gridN) continue;
          sum += BIOME_INDEX[gb[j * gridN + kk]] === "ocean" ? 0 : 1;
          n += 1;
        }
        tmp[j * gridN + k] = sum / n;
      }
    }
    for (let j = 0; j < gridN; j++) {
      for (let k = 0; k < gridN; k++) {
        let sum = 0;
        let n = 0;
        for (let d = -BLUR; d <= BLUR; d++) {
          const jj = j + d;
          if (jj < 0 || jj >= gridN) continue;
          sum += tmp[jj * gridN + k];
          n += 1;
        }
        landFrac[j * gridN + k] = sum / n;
      }
    }
  }

  /** How big the lake this cell belongs to is, in cells. Only inland water is counted. */
  const lakeSize = new Float32Array(gridN * gridN);
  {
    const seen = new Uint8Array(gridN * gridN);
    const stack: number[] = [];
    for (let i0 = 0; i0 < gridN * gridN; i0++) {
      if (seen[i0] || isSea[i0] || BIOME_INDEX[gb[i0]] !== "ocean") continue;
      const body: number[] = [];
      seen[i0] = 1;
      stack.push(i0);
      while (stack.length > 0) {
        const i = stack.pop() as number;
        body.push(i);
        const k = i % gridN;
        const j = (i / gridN) | 0;
        const step = (n: number) => {
          if (!seen[n] && !isSea[n] && BIOME_INDEX[gb[n]] === "ocean") {
            seen[n] = 1;
            stack.push(n);
          }
        };
        if (k > 0) step(i - 1);
        if (k < gridN - 1) step(i + 1);
        if (j > 0) step(i - gridN);
        if (j < gridN - 1) step(i + gridN);
      }
      for (const i of body) lakeSize[i] = body.length;
    }
  }

  const landmarks: Landmark[] = [];
  // The five authored places first, unmoved and un-renamed. They are the spine of the map a
  // child already knows, and everything the generator adds hangs off them.
  if (!bare) {
    for (const place of PLACES) {
      landmarks.push({
        id: place.id,
        name: place.name,
        line: place.line,
        position: place.position,
        y: heightAt(place.position.x, place.position.z),
        radius: place.radius,
        biome: biomeAt(place.position.x, place.position.z),
        kind: "place",
      });
    }
  }

  /** Nothing new is allowed this close to something that already exists. */
  const LANDMARK_SPACING = 78;
  function farFromLandmarks(x: number, z: number): boolean {
    if (Math.hypot(x, z) < CORE_HALF * 0.75) return false; // the authored core has its own five
    for (const l of landmarks) if (Math.hypot(x - l.position.x, z - l.position.z) < LANDMARK_SPACING) return false;
    return true;
  }

  const usedNames = new Set<string>(PLACES.map((p) => p.name));

  /** Take the best `count` cells by `score`, refusing any that crowds one already taken. */
  function claim(kind: Landmark["kind"], count: number, radius: number, score: (i: number) => number): void {
    const ranked: number[] = [];
    for (let i = 0; i < gh.length; i++) if (score(i) > 0) ranked.push(i);
    ranked.sort((a, b) => score(b) - score(a) || a - b); // `|| a - b` so ties never depend on sort stability
    let taken = 0;
    for (const i of ranked) {
      if (taken >= count) break;
      const x = gx(i);
      const z = gz(i);
      if (Math.abs(x) > half - 24 || Math.abs(z) > half - 24) continue;
      if (!farFromLandmarks(x, z)) continue;
      const pool = NAME_PARTS[kind];
      // Walk the pool from the hashed start until an unused name turns up. Two places called
      // Gullbay is not a world, it is a bug a child finds in about ninety seconds.
      let pick = Math.floor(hash2(i, taken, seed ^ 0x9e37) * pool.names.length) % pool.names.length;
      for (let n = 0; n < pool.names.length && usedNames.has(pool.names[pick]); n++) pick = (pick + 1) % pool.names.length;
      usedNames.add(pool.names[pick]);
      const lineAt = Math.floor(hash2(i + 91, taken, seed ^ 0xbf58) * pool.lines.length);
      landmarks.push({
        id: `${kind}-${landmarks.length + 1}`,
        name: pool.names[pick],
        line: pool.lines[lineAt % pool.lines.length],
        position: { x, z },
        y: heightAt(x, z),
        radius,
        biome: BIOME_INDEX[gb[i]],
        kind,
      });
      taken += 1;
    }
  }

  // The highest ground in the realm, and the next two: summits far enough apart that the view
  // from one shows you the others and there is somewhere to go next.
  claim("summit", 3, 15, (i) => (gh[i] > 34 ? gh[i] : 0));
  // The deepest wood: the clearing you can only get to by going in.
  claim("deepwood", 3, 12, (i) => forestDepth[i]);
  // Inland water with no way out to the sea, and big enough to be a lake rather than a puddle.
  // Scored on the shore of it, not in it, so a child arrives at the water rather than in it.
  claim("tarn", 2, 12, (i) => {
    if (BIOME_INDEX[gb[i]] !== "shore") return 0;
    const k = i % gridN;
    const j = (i / gridN) | 0;
    let best = 0;
    for (const n of [k > 0 ? i - 1 : i, k < gridN - 1 ? i + 1 : i, j > 0 ? i - gridN : i, j < gridN - 1 ? i + gridN : i]) {
      if (lakeSize[n] > best) best = lakeSize[n];
    }
    return best >= 6 ? best : 0;
  });
  // A beach on the open sea with the land wrapped round it: an inlet, not a headland.
  claim("cove", 3, 12, (i) => {
    if (BIOME_INDEX[gb[i]] !== "shore" || landFrac[i] <= 0.42) return 0;
    const k = i % gridN;
    const j = (i / gridN) | 0;
    const touchesSea =
      (k > 0 && isSea[i - 1] === 1) || (k < gridN - 1 && isSea[i + 1] === 1) || (j > 0 && isSea[i - gridN] === 1) || (j < gridN - 1 && isSea[i + gridN] === 1);
    return touchesSea ? landFrac[i] * 100 : 0;
  });
  // Dry ground in the middle of the reeds.
  claim("mire", 2, 12, (i) => marshDepth[i]);
  // A crag standing well clear of the rest of the high ground.
  claim("outcrop", 3, 11, (i) => (BIOME_INDEX[gb[i]] === "crag" ? gh[i] * 0.4 + landDepth[i] * 0.1 : 0));

  /* ---- roads ---- */

  /**
   * Ways between landmarks, routed rather than ruled.
   *
   * A straight line from the village to a summit goes through a lake and up a cliff. So each
   * leg is subdivided, and every interior point is allowed to slide sideways to whichever offset
   * costs least — where cost is height changed, plus a heavy penalty for water and for steep
   * ground. It is one greedy pass, not a search: cheap, deterministic, and enough to make a road
   * that goes round a hill instead of over it and finds the pass rather than the crest.
   *
   * These are not decoration. Five tracks are what made the authored world navigable for a child
   * who cannot read a map — you walk a track inward and you are home. A world five times the
   * size needs that more, not less.
   */
  const ROAD_HALF_WIDTH = 1.9;
  const roads: Road[] = [];

  function routeCost(x: number, z: number, fromY: number): number {
    const h = villaged(x, z);
    if (h < SEA_LEVEL + 0.8) return 1e6 + (SEA_LEVEL - h) * 100;
    if (Math.abs(x) > half - 12 || Math.abs(z) > half - 12) return 1e6;
    return Math.abs(h - fromY) * 4 + slopeAt(x, z, 3) * 120;
  }

  function route(a: Vec2, b: Vec2): Vec2[] {
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(3, Math.round(span / 26));
    const nx = -(b.z - a.z) / span;
    const nz = (b.x - a.x) / span;
    const points: Vec2[] = [a];
    let prev = a;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const mx = a.x + (b.x - a.x) * t;
      const mz = a.z + (b.z - a.z) * t;
      const prevY = villaged(prev.x, prev.z);
      let best = { x: mx, z: mz };
      let bestCost = Infinity;
      // Nine offsets out to a third of the leg either side: enough to walk round a tarn.
      for (let o = -4; o <= 4; o++) {
        const off = (o / 4) * span * 0.22;
        const px = mx + nx * off;
        const pz = mz + nz * off;
        const cost = routeCost(px, pz, prevY) + Math.abs(off) * 0.6;
        if (cost < bestCost) {
          bestCost = cost;
          best = { x: px, z: pz };
        }
      }
      points.push(best);
      prev = best;
    }
    points.push(b);
    // Two smoothing passes. A greedy router picks each vertex on its own, so it will happily
    // take a big offset one way and the opposite one next — which costs almost nothing in its
    // own terms and reads on the map as a zigzag no cart ever made. A point only keeps its
    // smoothed position if the smoothed position is still dry land.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < points.length - 1; i++) {
        const sx = points[i - 1].x * 0.25 + points[i].x * 0.5 + points[i + 1].x * 0.25;
        const sz = points[i - 1].z * 0.25 + points[i].z * 0.5 + points[i + 1].z * 0.25;
        if (villaged(sx, sz) > SEA_LEVEL + 0.8) points[i] = { x: sx, z: sz };
      }
    }
    return points;
  }

  function addRoad(from: Landmark, to: Landmark): void {
    const points = route(from.position, to.position);
    roads.push({ id: `road-${roads.length + 1}`, from: from.id, to: to.id, points, halfWidth: ROAD_HALF_WIDTH });
    const before = reservations.length;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      // A leg is cut into short corridors so the grade follows the ground instead of a chord
      // across it — the difference between a road and a viaduct.
      const legs = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 12));
      for (let s = 0; s < legs; s++) {
        const t0 = s / legs;
        const t1 = (s + 1) / legs;
        const ax = a.x + (b.x - a.x) * t0;
        const az = a.z + (b.z - a.z) * t0;
        const bx = a.x + (b.x - a.x) * t1;
        const bz = a.z + (b.z - a.z) * t1;
        reservations.push({ kind: "road", priority: PRIORITY.road, ax, az, bx, bz, halfWidth: ROAD_HALF_WIDTH, aY: villaged(ax, az), bY: villaged(bx, bz) });
      }
    }
    indexReservations(before);
  }

  if (!bare) {
    // Every new landmark is joined to the nearest thing that is already connected, so the whole
    // realm hangs off the five authored places and every one of them is reachable from the
    // village by following tracks. A child who is lost walks a track inward and is home.
    const connected = landmarks.filter((l) => l.kind === "place");
    for (const l of landmarks) {
      if (l.kind === "place") continue;
      let nearest = connected[0];
      let bestD = Infinity;
      for (const c of connected) {
        const d = Math.hypot(c.position.x - l.position.x, c.position.z - l.position.z);
        if (d < bestD) {
          bestD = d;
          nearest = c;
        }
      }
      addRoad(nearest, l);
      connected.push(l);
    }
    // ...and a clearing at the heart of each, so the thing worth walking to is not buried in
    // the scatter that happens to grow there. The fells taught this lesson the hard way.
    const clearFrom = reservations.length;
    for (const l of landmarks) {
      if (l.kind === "place") continue;
      reservations.push({ kind: "clear", x: l.position.x, z: l.position.z, r: l.radius * 0.8, priority: PRIORITY.landmark });
      reservations.push({ kind: "flat", x: l.position.x, z: l.position.z, w: 9, d: 9, feather: 9, datum: villaged(l.position.x, l.position.z), noProps: false, priority: PRIORITY.landmark });
    }
    indexReservations(clearFrom);
    // Landmark heights move once the roads and pads are in. Re-read them.
    for (const l of landmarks) l.y = heightAt(l.position.x, l.position.z);
  }

  /* ---- props ---- */

  /** True if this point is inside something that forbids props. */
  function propBlocked(x: number, z: number): boolean {
    const list = resGrid.get(resKey(Math.floor(x / RES_CELL), Math.floor(z / RES_CELL)));
    if (list === undefined) return false;
    for (let i = 0; i < list.length; i++) {
      const r = reservations[list[i]];
      if (r.kind === "clear") {
        if (Math.hypot(x - r.x, z - r.z) < r.r) return true;
      } else if (r.kind === "road") {
        const t = segmentT(x, z, r.ax, r.az, r.bx, r.bz);
        const cxp = r.ax + (r.bx - r.ax) * t;
        const czp = r.az + (r.bz - r.az) * t;
        // A verge and a half: a trunk on the very edge of a track still hides the track.
        if (Math.hypot(x - cxp, z - czp) < r.halfWidth + 1.5) return true;
      } else if (r.noProps) {
        if (Math.abs(x - r.x) < r.w / 2 + 1 && Math.abs(z - r.z) < r.d / 2 + 1) return true;
      }
    }
    return false;
  }

  /**
   * How much of the generator's own scatter survives here.
   *
   * Zero inside the authored square — those two thousand props are already there and a second
   * wood growing through the first one is not a bigger wood, it is a mess. Feathered in over
   * the next twenty-two units so the authored wood's edge and the generated wood's edge are the
   * same edge. This is the whole join, and it is one number.
   */
  function coreFade(x: number, z: number): number {
    if (bare) return 1;
    const out = Math.max(Math.abs(x), Math.abs(z)) - CORE_HALF;
    if (out >= CORE_FEATHER) return 1;
    if (out <= -2) return 0;
    return smoothstep(-2, CORE_FEATHER, out);
  }

  const chunks = new Map<number, WorldProp[]>();
  const chunkKey = (cx: number, cz: number) => (cx + 2048) * 8192 + (cz + 2048);
  const chunkSpan = Math.ceil(half / CHUNK);

  /** A 9x9 sample of the ground over one chunk plus a margin, reused for every candidate in it. */
  const SUB = 4;
  const SUBN = CHUNK / SUB + 3; // 11: one cell of margin either side, so edge slopes are real
  const subH = new Float32Array(SUBN * SUBN);
  const subM = new Float32Array(SUBN * SUBN);
  const subB = new Uint8Array(SUBN * SUBN);

  function generateChunk(cx: number, cz: number): WorldProp[] {
    const out: WorldProp[] = [];
    const ox = cx * CHUNK;
    const oz = cz * CHUNK;
    // Biome is evaluated on a 4-unit grid, not per candidate: a chunk holds about five hundred
    // candidates and a per-candidate biome would be three thousand height queries for sixty
    // props. Slope comes out of the same grid by difference, so it is free.
    for (let j = 0; j < SUBN; j++) {
      for (let k = 0; k < SUBN; k++) {
        const x = ox + (k - 1) * SUB;
        const z = oz + (j - 1) * SUB;
        subH[j * SUBN + k] = heightAt(x, z);
        subM[j * SUBN + k] = moistureAt(x, z);
      }
    }
    for (let j = 0; j < SUBN; j++) {
      for (let k = 0; k < SUBN; k++) {
        const i = j * SUBN + k;
        const hx = subH[j * SUBN + Math.min(SUBN - 1, k + 1)] - subH[j * SUBN + Math.max(0, k - 1)];
        const hz = subH[Math.min(SUBN - 1, j + 1) * SUBN + k] - subH[Math.max(0, j - 1) * SUBN + k];
        subB[i] = BIOME_INDEX.indexOf(classify(subH[i], subM[i], Math.hypot(hx, hz) / (2 * SUB)));
      }
    }
    const sampleAt = (x: number, z: number): number => {
      const k = Math.min(SUBN - 1, Math.max(0, Math.round((x - ox) / SUB) + 1));
      const j = Math.min(SUBN - 1, Math.max(0, Math.round((z - oz) / SUB) + 1));
      return j * SUBN + k;
    };

    for (let li = 0; li < LAYER_KEYS.length; li++) {
      const key = LAYER_KEYS[li];
      const layer = LAYERS[key];
      const c0x = Math.ceil(ox / layer.cell);
      const c1x = Math.ceil((ox + CHUNK) / layer.cell) - 1;
      const c0z = Math.ceil(oz / layer.cell);
      const c1z = Math.ceil((oz + CHUNK) / layer.cell) - 1;
      for (let ix = c0x; ix <= c1x; ix++) {
        for (let iz = c0z; iz <= c1z; iz++) {
          // Four independent draws from the cell's hash: keep, jitter x, jitter z, and choice.
          const rKeep = hash2(ix, iz, layer.salt ^ seed);
          const rx = hash2(ix + 8191, iz, layer.salt ^ seed);
          const rz = hash2(ix, iz + 8191, layer.salt ^ seed);
          const rPick = hash2(ix + 4093, iz + 4093, layer.salt ^ seed);

          const x = (ix + 0.5 + (rx - 0.5) * layer.jitter) * layer.cell;
          const z = (iz + 0.5 + (rz - 0.5) * layer.jitter) * layer.cell;
          if (Math.abs(x) > half - 3 || Math.abs(z) > half - 3) continue;

          const fade = coreFade(x, z);
          if (fade <= 0) continue;
          const si = sampleAt(x, z);
          const biome = BIOME_INDEX[subB[si]];
          if (biome === "ocean") continue;

          // Clumping: the same density spread evenly is a plantation. A slow field over it
          // gives a forest glades and a moor bare shoulders, which is what makes a walk have
          // anything in it — you come out of the trees, and then you go back into them.
          const clump = fbm(x * 0.026 + 5.5, z * 0.026 - 8.8, seed ^ 0xc0de, 3);
          const density = DENSITY[biome][key] * (0.35 + 1.45 * clump) * fade;
          if (rKeep >= density) continue;

          if (propBlocked(x, z)) continue;

          const picks = PALETTE[biome][key];
          if (picks.length === 0) continue;
          const pick = picks[Math.min(picks.length - 1, Math.floor(rPick * picks.length))];

          // Trees do not grow on cliffs. The slope is already in hand from the sub-grid.
          const isTree = pick.variant === "oak" || pick.variant === "pine";
          if (isTree) {
            const j2 = Math.floor(si / SUBN);
            const k2 = si % SUBN;
            const hx = subH[j2 * SUBN + Math.min(SUBN - 1, k2 + 1)] - subH[j2 * SUBN + Math.max(0, k2 - 1)];
            const hz = subH[Math.min(SUBN - 1, j2 + 1) * SUBN + k2] - subH[Math.max(0, j2 - 1) * SUBN + k2];
            if (Math.hypot(hx, hz) / (2 * SUB) > TREE_MAX_SLOPE) continue;
          }

          const rScale = hash2(ix + 2053, iz + 6151, layer.salt ^ seed);
          const scale = pick.lo + rScale * (pick.hi - pick.lo);
          const y = heightAt(x, z);
          if (y < SEA_LEVEL - 0.2) continue; // the sub-grid can be a metre out at a waterline
          out.push({
            id: `w-${key}-${ix}-${iz}`,
            variant: pick.variant,
            role: pick.role,
            layer: key,
            x,
            z,
            y,
            scale,
            // Only the `feature` lattice makes colliders, and only for big trunks and stones.
            // Its cell is 17 units with 55% jitter, so two solids can never be closer than
            // 7.6 units — a wood you walk through, not a fence with no gate.
            solid: key === "feature" && scale >= SOLID_MIN_SCALE && SOLID_VARIANTS.has(pick.variant),
            biome,
          });
        }
      }
    }
    return out;
  }

  function chunkProps(cx: number, cz: number): readonly WorldProp[] {
    const k = chunkKey(cx, cz);
    let list = chunks.get(k);
    if (list === undefined) {
      list = generateChunk(cx, cz);
      chunks.set(k, list);
    }
    return list;
  }

  function forEachPropNear(x: number, z: number, radius: number, visit: (p: WorldProp) => void): void {
    const reach = radius + CHUNK_OVERHANG;
    const c0x = Math.floor((x - reach) / CHUNK);
    const c1x = Math.floor((x + reach) / CHUNK);
    const c0z = Math.floor((z - reach) / CHUNK);
    const c1z = Math.floor((z + reach) / CHUNK);
    const r2 = radius * radius;
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const list = chunkProps(cx, cz);
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          const dx = p.x - x;
          const dz = p.z - z;
          if (dx * dx + dz * dz <= r2) visit(p);
        }
      }
    }
  }

  function propsNear(x: number, z: number, radius: number, out: WorldProp[]): WorldProp[] {
    out.length = 0;
    forEachPropNear(x, z, radius, (p) => out.push(p));
    return out;
  }

  function warmAround(x: number, z: number, radius: number): void {
    const c0x = Math.floor((x - radius) / CHUNK);
    const c1x = Math.floor((x + radius) / CHUNK);
    const c0z = Math.floor((z - radius) / CHUNK);
    const c1z = Math.floor((z + radius) / CHUNK);
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) chunkProps(cx, cz);
  }

  function allProps(): WorldProp[] {
    const out: WorldProp[] = [];
    for (let cx = -chunkSpan; cx <= chunkSpan; cx++) {
      for (let cz = -chunkSpan; cz <= chunkSpan; cz++) {
        const list = chunkProps(cx, cz);
        for (let i = 0; i < list.length; i++) out.push(list[i]);
      }
    }
    return out;
  }

  function landmarkAt(x: number, z: number): Landmark | null {
    let best: Landmark | null = null;
    let bestReach = Infinity;
    for (const l of landmarks) {
      const reach = Math.hypot(x - l.position.x, z - l.position.z) / l.radius;
      if (reach <= 1 && reach < bestReach) {
        best = l;
        bestReach = reach;
      }
    }
    return best;
  }

  return {
    seed,
    half,
    sea: SEA_LEVEL,
    heightAt,
    slopeAt,
    moistureAt,
    biomeAt,
    isWater,
    waterLevelAt,
    sampleHeights,
    chunkProps,
    forEachPropNear,
    propsNear,
    warmAround,
    allProps,
    landmarks,
    roads,
    landmarkAt,
    chunkSpan,
  };
}

/**
 * The realm, built once and shared.
 *
 * Lazy, not eager: `layout.ts` builds its world at module load and pays about twenty
 * milliseconds for it, which is fine for a module every realm page imports. This one scans a
 * grid and routes a road network, so it is built on first ask instead — a test that only wants
 * `classify()` should not pay for a continent.
 */
let cached: RealmWorld | null = null;
export function realmWorld(): RealmWorld {
  if (cached === null) cached = createWorld();
  return cached;
}
