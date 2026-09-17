import { seededRng } from "@/lib/utils/drill-generators";

/** A tile is rows of colours; the adapter in tile-texture.ts paints it. Pure, so the grids are testable. */
export type Tile = string[][];

/* ---------------------------------------------------------------------------
 * Structure that still tiles.
 *
 * Per-PIXEL noise is the thing a child cannot see. At the realm's zoom a grass pixel is about
 * three screen pixels, so salt-and-pepper over a whole world averages out to one flat colour —
 * which is exactly what "a green carpet with stickers on it" means. Ground needs CLUMPS: patches
 * several pixels across that the eye can resolve as shape.
 *
 * A clump is a low-frequency field, and a low-frequency field laid on a repeating texture has to
 * wrap or the seam becomes the structure. `lattice`/`sample` is a coarse grid of values sampled
 * with smoothstep and WRAPPING indices, so the left edge always meets the right.
 * ------------------------------------------------------------------------ */

function lattice(rng: () => number, cells: number): number[][] {
  return Array.from({ length: cells }, () => Array.from({ length: cells }, () => rng()));
}

/** Samples a wrapping lattice at (u, v) in 0..1. Smoothstep between cells, so clumps are round. */
function sample(grid: number[][], u: number, v: number): number {
  const cells = grid.length;
  const fx = u * cells;
  const fy = v * cells;
  const x0 = ((Math.floor(fx) % cells) + cells) % cells;
  const y0 = ((Math.floor(fy) % cells) + cells) % cells;
  const x1 = (x0 + 1) % cells;
  const y1 = (y0 + 1) % cells;
  const tx = fx - Math.floor(fx);
  const ty = fy - Math.floor(fy);
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = grid[y0][x0] + (grid[y0][x1] - grid[y0][x0]) * sx;
  const b = grid[y1][x0] + (grid[y1][x1] - grid[y1][x0]) * sx;
  return a + (b - a) * sy;
}

/** Picks from a ramp by a 0..1 value. The ramp is dark-to-light, so `v` reads as brightness. */
function step(ramp: string[], v: number): string {
  return ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(v * ramp.length)))];
}

/* --- grass ---------------------------------------------------------------- */

/**
 * Five greens dark to light, a deep blade shadow, and two flower colours.
 *
 * The flowers used to be single pixels at 1.2% — one screen pixel each, which is not a flower,
 * it is static. They are painted as small clumps now, and there are far fewer of them.
 */
export const GRASS_COLORS = ["#20452a", "#275031", "#2d5a37", "#34653d", "#3c7145", "#173720", "#e8dc92", "#d894b8"];
const [, , , , , G_BLADE, F_GOLD, F_PINK] = GRASS_COLORS;
const GRASS_RAMP = GRASS_COLORS.slice(0, 5);

/**
 * Grass in clumps, not confetti: two wrapping noise fields pick the green, a scatter of blade
 * shadows gives it grain, and a handful of two-pixel flowers per tile are the only bright thing.
 *
 * The default is 64 now, not 32. The tile is painted over FOUR world units rather than two, which
 * halves how often the pattern repeats across a field while keeping a grass pixel the same size on
 * screen — a tile with structure in it needs a longer repeat than a tile of noise did.
 */
export function grassTile(seed: number, size = 64): Tile {
  const rng = seededRng(seed);
  const coarse = lattice(rng, 4);
  const fine = lattice(rng, 8);
  const grid: Tile = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n = sample(coarse, u, v) * 0.68 + sample(fine, u, v) * 0.32;
      const r = rng();
      // A blade shadow, not a lone dark pixel: two stacked, so it reads as a tuft leaning over.
      row.push(r < 0.055 ? G_BLADE : step(GRASS_RAMP, n));
    }
    grid.push(row);
  }
  // Flowers last, in twos and threes, so a child sees a flower rather than a speck of dust.
  const clumps = Math.max(1, Math.round((size * size) / 1400));
  for (let i = 0; i < clumps; i++) {
    const cx = Math.floor(rng() * size);
    const cy = Math.floor(rng() * size);
    const color = rng() < 0.55 ? F_GOLD : F_PINK;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 0]]) {
      if (rng() < 0.35) continue;
      grid[(cy + dy) % size][(cx + dx) % size] = color;
    }
  }
  return grid;
}

/* --- cobbles -------------------------------------------------------------- */

export const COBBLE_COLORS = ["#8f7d55", "#c9b27a", "#bda56f", "#d4bd85"];
const [MORTAR, ...STONES] = COBBLE_COLORS;
const STONE = 8;

/** Stones eight pixels wide with mortar lines between; each stone keeps one shade. */
export function cobbleTile(seed: number, size = 32): Tile {
  const rng = seededRng(seed);
  const across = Math.ceil(size / STONE);
  const shades = Array.from({ length: across * across }, () => STONES[Math.floor(rng() * STONES.length)]);
  const grid: Tile = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      const mortar = x % STONE === 0 || y % STONE === 0;
      row.push(mortar ? MORTAR : shades[Math.floor(y / STONE) * across + Math.floor(x / STONE)]);
    }
    grid.push(row);
  }
  return grid;
}

/* ---------------------------------------------------------------------------
 * Surface detail tiles.
 *
 * These are NOT coloured: they are near-white VALUE patterns, and the surface's own colour in
 * `TERRAIN_COLORS` is the tint they are multiplied by. That is what lets one set of tiles serve
 * both palettes — lowStimulus swaps the tint and the wood is still a wood floor, just quieter —
 * and it is why a region can stop being a flat fill without anything gaining a draw call: a
 * surface was already one InstancedMesh with one material, and a material with a map on it costs
 * exactly what a material without one costs.
 *
 * They sit near white on purpose. A map multiplies, so it can only darken; a tile averaging 0.5
 * would halve every terrain colour in the world and the fix would be eight brighter hexes.
 * ------------------------------------------------------------------------ */

export const SURFACE_COLORS = ["#ffffff", "#f0f0f0", "#dedede", "#c8c8c8", "#b0b0b0", "#969696", "#7d7d7d", "#f7ecd2", "#dcecf5"];
const [S_WHITE, S_L1, S_L2, S_L3, S_L4, S_L5, S_DARK, S_WARM, S_COOL] = SURFACE_COLORS;
const PALE = [S_L4, S_L3, S_L2, S_L1, S_WHITE];

/** Blotches: a forest floor, a dry meadow, a worked field. Clumps first, flecks on top. */
function mottle(seed: number, size: number, opts: { cells: number; fleck: number; fleckColor: string; dark: number }): Tile {
  const rng = seededRng(seed);
  const coarse = lattice(rng, opts.cells);
  const fine = lattice(rng, opts.cells * 2);
  const grid: Tile = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      const n = sample(coarse, x / size, y / size) * 0.7 + sample(fine, x / size, y / size) * 0.3;
      const r = rng();
      if (r < opts.dark) row.push(S_DARK);
      else if (r < opts.dark + opts.fleck) row.push(opts.fleckColor);
      else row.push(step(PALE, n));
    }
    grid.push(row);
  }
  return grid;
}

/** The floor of the Old Wood: dark leaf mould, blown leaves, the odd root. */
export function groveTile(seed: number, size = 32): Tile {
  const grid = mottle(seed, size, { cells: 3, fleck: 0.06, fleckColor: S_WARM, dark: 0.1 });
  const rng = seededRng(seed + 91);
  // Roots: short runs, so the floor has a direction and is not only speckle.
  for (let i = 0; i < Math.round(size / 5); i++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    const len = 3 + Math.floor(rng() * 5);
    const down = rng() < 0.5;
    for (let s = 0; s < len; s++) grid[(y + (down ? s : 0)) % size][(x + (down ? 0 : s)) % size] = S_L5;
  }
  return grid;
}

/** Dry grass gone to seed: the pale patches that stop one field being every field. */
export function meadowTile(seed: number, size = 32): Tile {
  return mottle(seed, size, { cells: 4, fleck: 0.05, fleckColor: S_WARM, dark: 0.04 });
}

/** Leaf litter at a wood's edge: warm flecks over bare ground, thinning into the grass. */
export function litterTile(seed: number, size = 32): Tile {
  return mottle(seed, size, { cells: 3, fleck: 0.22, fleckColor: S_WARM, dark: 0.08 });
}

/** A worked plot: clods and rows, with green still standing between them. */
export function fieldTile(seed: number, size = 32): Tile {
  const grid = mottle(seed, size, { cells: 4, fleck: 0.04, fleckColor: S_WARM, dark: 0.05 });
  // Rows. A ploughed field's whole look is that it runs one way.
  for (let y = 0; y < size; y++) {
    if (y % 6 !== 0) continue;
    for (let x = 0; x < size; x++) grid[y][x] = x % 3 === 0 ? S_L5 : S_L4;
  }
  return grid;
}

/** Broken stone on the fells: angular cells with cracks between and lichen on a few. */
export function stoneTile(seed: number, size = 32, cell = 6): Tile {
  const rng = seededRng(seed);
  const across = Math.ceil(size / cell);
  const shades = Array.from({ length: across * across }, () => step(PALE, rng()));
  const grid: Tile = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      // The crack is jittered off the cell edge, so the stones are not a tiled grid.
      const jx = (x + (y % 3)) % size;
      const jy = (y + (x % 3)) % size;
      const crack = jx % cell === 0 || jy % cell === 0;
      row.push(crack ? S_DARK : shades[Math.floor(y / cell) * across + Math.floor(x / cell)]);
    }
    grid.push(row);
  }
  for (let i = 0; i < Math.round(size / 8); i++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) grid[(y + dy) % size][(x + dx) % size] = S_WARM;
  }
  return grid;
}

/** Bare earth: a track, a furrow. Grain the long way, with stones trodden into it. */
export function earthTile(seed: number, size = 32): Tile {
  const rng = seededRng(seed);
  const coarse = lattice(rng, 4);
  const grid: Tile = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      // Stretched across x: ruts run along a track rather than round in circles.
      const n = sample(coarse, x / size, y / size) * 0.6 + sample(coarse, (x * 3) / size, y / size) * 0.4;
      const r = rng();
      row.push(r < 0.05 ? S_DARK : r < 0.09 ? S_WHITE : step(PALE, n));
    }
    grid.push(row);
  }
  return grid;
}

/** Shingle on a bank: pebbles, plainly separate ones. */
export function shingleTile(seed: number, size = 32): Tile {
  const rng = seededRng(seed);
  const grid: Tile = Array.from({ length: size }, () => Array.from({ length: size }, () => S_L2));
  for (let i = 0; i < Math.round(size * size * 0.06); i++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    const shade = step(PALE, rng());
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) grid[(y + dy) % size][(x + dx) % size] = shade;
    grid[(y + 2) % size][(x + 1) % size] = S_L5;
  }
  return grid;
}

/** Water: broad ripple bands and a few glints. Tinted deep for the lake, pale for the shallows. */
export function rippleTile(seed: number, size = 32): Tile {
  const rng = seededRng(seed);
  const coarse = lattice(rng, 3);
  const grid: Tile = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      const n = sample(coarse, x / size, y / size);
      // Bands, not blobs: a lake's surface has a direction the light runs along.
      const band = (Math.sin((y / size) * Math.PI * 4 + n * 3) + 1) / 2;
      row.push(band > 0.86 ? S_COOL : step(PALE, 0.12 + band * 0.86));
    }
    grid.push(row);
  }
  for (let i = 0; i < Math.round(size / 6); i++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    for (const [dx] of [[0], [1], [2]]) grid[y][(x + dx) % size] = S_WHITE;
  }
  return grid;
}

/**
 * Feathers a tile: opaque in the middle, gone at the rim, with a ragged edge.
 *
 * This is what stops a region being a rug. A patch of ground is one quad, and an opaque quad
 * under this camera has four straight edges and a corner the eye finds instantly — a wood floor
 * that ends on a diamond. Painting the falloff into the tile's ALPHA costs nothing anybody can
 * measure and turns every patch into a smudge, so a wood floor now thins out into the grass, a
 * dry patch has no border at all, and a bank fades where the reeds start.
 *
 * The rim is jittered by a wrapping noise field, so the smudges are not four hundred identical
 * circles. A feathered surface is drawn at repeat 1 — the falloff is of the PATCH, not of a tile
 * inside it — which is why these are painted at 64 pixels rather than 32.
 */
export function feather(tile: Tile, seed: number): Tile {
  const size = tile.length;
  const rng = seededRng(seed);
  const wobble = lattice(rng, 6);
  return tile.map((row, y) =>
    row.map((color, x) => {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.hypot(dx, dy) * 2; // 0 at the centre, 1 at the edge of the inscribed circle
      const edge = 0.52 + sample(wobble, x / size, y / size) * 0.4;
      const a = r >= edge ? 0 : Math.min(1, (edge - r) / 0.34);
      const byte = Math.round(a * 255).toString(16).padStart(2, "0");
      return `${color}${byte}`;
    }),
  );
}

/** Surfaces whose edge must dissolve rather than end. Drawn at repeat 1, so one tile is one patch. */
export const SOFT_SURFACES: readonly string[] = ["meadow", "grove", "litter", "scree", "shore"];

/** The one place a terrain kind is turned into a surface. Anything unknown gets quiet mottle. */
export function surfaceTile(kind: string, seed = 1): Tile {
  const soft = SOFT_SURFACES.includes(kind);
  const grid = surfaceGrid(kind, seed, soft ? 64 : 32);
  return soft ? feather(grid, seed + 41) : grid;
}

function surfaceGrid(kind: string, seed: number, size: number): Tile {
  switch (kind) {
    case "grove": return groveTile(seed, size);
    case "litter": return litterTile(seed, size);
    case "meadow": return meadowTile(seed, size);
    case "scree": return stoneTile(seed, size, Math.round(size / 5));
    case "field": return fieldTile(seed);
    case "furrow": return earthTile(seed);
    case "trail": return earthTile(seed + 3);
    case "shore": return shingleTile(seed, size);
    case "shallow": return rippleTile(seed + 5);
    case "water": return rippleTile(seed);
    default: return meadowTile(seed, size);
  }
}

/* ---------------------------------------------------------------------------
 * The broad wash.
 *
 * One tile, however good, is the same tile everywhere: a field fifty units away still looks like
 * this field. The variation a child actually notices is at the scale of a whole screen, and the
 * cheapest place in the world to put it is the ground mesh's own VERTEX COLOURS — no second
 * plane, no second texture, no extra draw call, and it costs the vertex shader a multiply.
 *
 * `meadowShade` is that field, in world units: summed waves, so it is continuous, seamless and
 * needs no table. It returns a MULTIPLIER per channel around 1 — under 1 darkens, over 1 lifts —
 * and `dry` warms a patch towards straw as well as lightening it, which is what makes one stretch
 * of grass read as a different stretch rather than the same grass under a cloud.
 * ------------------------------------------------------------------------ */

export type Shade = { r: number; g: number; b: number };

export function meadowShade(x: number, z: number, strength = 1): Shade {
  const broad = Math.sin(x * 0.042 + 1.7) * Math.cos(z * 0.036 - 0.6);
  const mid = Math.sin((x + z * 0.8) * 0.091 + 2.3);
  const fine = Math.cos(x * 0.147 - z * 0.119 + 4.1);
  const n = broad * 0.55 + mid * 0.3 + fine * 0.15; // about -1..1
  const dry = Math.max(0, Math.sin(x * 0.019 - 2.2) * Math.cos(z * 0.023 + 1.1));
  const v = 1 + n * 0.17 * strength + dry * 0.1 * strength;
  const clamp = (c: number) => Math.max(0.6, Math.min(1.45, c));
  return {
    r: clamp(v * (1 + dry * 0.17 * strength)),
    g: clamp(v),
    b: clamp(v * (1 - dry * 0.14 * strength)),
  };
}
