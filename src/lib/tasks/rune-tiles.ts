/**
 * How a rune word is built from a tray of tiles (slice 6, R-I5). Pure and client-safe: the stone
 * spells what is placed with `spelled`, the server grades with it, and the drawer and validator (I4)
 * ask `runeTiling` whether a word can be built and `hasSpelledRun` whether a tray's order gives it
 * away (R-I17). Letters are compared in lower case.
 */

import { RUNE_MAX_TILES } from "./codecs";

const lower = (s: string): string => s.toLowerCase();

/**
 * The longest word a rune may ask for, in letters. The validator's word form (`/^[a-z]{2,16}$/`, I4)
 * holds every pool to it, and `runeTiling` refuses anything longer. Why 16: the longest word the
 * pools are planned around is 12 letters ("rehabilitate"), and 16 leaves room for a longer root word
 * ("reconstruction" is 14) while keeping the search small. The search places at most one tile per
 * step and never reuses one, so its depth is at most min(word letters, RUNE_MAX_TILES), and each
 * step tries only the distinct tiles that fit at that point of the word.
 */
export const RUNE_MAX_WORD = 16;

/**
 * The tiling of `word` that uses the fewest tiles, each tile index at most once, as the indices in
 * the order placed; `null` when the tray cannot build it, or when the word or the tray is past the caps
 * no pool can reach (`RUNE_MAX_WORD`, `RUNE_MAX_TILES`): the search runs on the request path (`reveal`),
 * so a stored or forged task can never make it slow. Found by depth-first search over the
 * indices in ascending order, so among tilings of the same size the one that is lowest index by
 * index (the lower first index) is kept. An empty tile builds nothing and is passed over.
 */
export function runeTiling(word: string, tiles: readonly string[]): number[] | null {
  const target = lower(word);
  if (target.length === 0 || target.length > RUNE_MAX_WORD || tiles.length > RUNE_MAX_TILES) return null;
  const tray = tiles.map(lower);
  const used = new Array<boolean>(tray.length).fill(false);
  const path: number[] = [];
  let best: number[] | null = null;
  const search = (at: number): void => {
    if (at === target.length) {
      if (best === null || path.length < best.length) best = [...path];
      return;
    }
    // A tiling no shorter than the best one found cannot win.
    if (best !== null && path.length + 1 >= best.length) return;
    // Two unused tiles that read alike lead to the same words, so only the lower index is tried: it
    // keeps the search small on a tray of repeats and still finds the lowest tiling.
    const tried = new Set<string>();
    for (let i = 0; i < tray.length; i++) {
      const tile = tray[i];
      if (used[i] || tile.length === 0 || tried.has(tile) || !target.startsWith(tile, at)) continue;
      tried.add(tile);
      used[i] = true;
      path.push(i);
      search(at + tile.length);
      path.pop();
      used[i] = false;
    }
  };
  search(0);
  return best;
}

/** The word the picks build: the picked tiles joined, in order, lower case. A pick off the tray adds nothing. */
export function spelled(tiles: readonly string[], picks: readonly number[]): string {
  return lower(picks.map((i) => tiles[i] ?? "").join(""));
}

/**
 * Whether some run of adjacent tiles, read left to right, starts with one of `words` (a single tile
 * counts). A run that reads the word and then more letters shows it as plainly as the word alone:
 * "re · stor · ed" reads "restored", and "m · e · nds" reads "mends" (I4 fix round 1). A run is read from
 * a tile's first letter, so a word that begins inside a tile ("p · re · store", from "pre") is not counted.
 */
export function hasSpelledRun(tiles: readonly string[], words: readonly string[]): boolean {
  const wanted = words.map(lower).filter((w) => w.length > 0);
  if (wanted.length === 0) return false;
  const longest = Math.max(...wanted.map((w) => w.length));
  for (let i = 0; i < tiles.length; i++) {
    let run = "";
    // Once a run is as long as the longest word, a longer run shares its start: nothing more can match.
    for (let j = i; j < tiles.length && run.length < longest; j++) {
      run += lower(tiles[j]);
      if (wanted.some((w) => run.startsWith(w))) return true;
    }
  }
  return false;
}
