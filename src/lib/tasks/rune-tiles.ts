/**
 * How a rune word is built from a tray of tiles (slice 6, R-I5). Pure and client-safe: the stone
 * spells what is placed with `spelled`, the server grades with it, and the drawer and validator (I4)
 * ask `runeTiling` whether a word can be built and `hasSpelledRun` whether a tray's order gives it
 * away (R-I17). Letters are compared in lower case.
 */

const lower = (s: string): string => s.toLowerCase();

/**
 * The tiling of `word` that uses the fewest tiles, each tile index at most once, as the indices in
 * the order placed; `null` when the tray cannot build it. Found by depth-first search over the
 * indices in ascending order, so among tilings of the same size the one that is lowest index by
 * index (the lower first index) is kept. An empty tile builds nothing and is passed over.
 */
export function runeTiling(word: string, tiles: readonly string[]): number[] | null {
  const target = lower(word);
  if (target.length === 0) return null;
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

/** Whether some run of adjacent tiles, read left to right, spells one of `words` (a single tile counts). */
export function hasSpelledRun(tiles: readonly string[], words: readonly string[]): boolean {
  const wanted = new Set(words.map(lower));
  for (let i = 0; i < tiles.length; i++) {
    let run = "";
    for (let j = i; j < tiles.length; j++) {
      run += lower(tiles[j]);
      if (wanted.has(run)) return true;
    }
  }
  return false;
}
