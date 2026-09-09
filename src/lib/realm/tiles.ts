import { seededRng } from "@/lib/utils/drill-generators";

/** A tile is rows of colours; the adapter in tile-texture.ts paints it. Pure, so the grids are testable. */
export type Tile = string[][];

export const GRASS_COLORS = ["#2e5a3a", "#33633f", "#24492e", "#fde68a", "#f9a8d4", "#ffffff"];
const [GRASS_A, GRASS_B, TUFT, ...FLOWERS] = GRASS_COLORS;

/** Two greens in a soft checker, darker tufts, a few flowers. Same seed, same grass. */
export function grassTile(seed: number, size = 32): Tile {
  const rng = seededRng(seed);
  const grid: Tile = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      const r = rng();
      if (r < 0.06) row.push(TUFT);
      else if (r < 0.072) row.push(FLOWERS[Math.floor(rng() * FLOWERS.length)]);
      else row.push((x + y) % 2 === 0 && r < 0.55 ? GRASS_A : GRASS_B);
    }
    grid.push(row);
  }
  return grid;
}

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
