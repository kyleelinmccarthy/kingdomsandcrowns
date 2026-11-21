import { describe, expect, it } from "vitest";
import { RUNE_MAX_TILES } from "./codecs";
import { RUNE_MAX_WORD, hasSpelledRun, runeTiling, spelled } from "./rune-tiles";

describe("runeTiling: how a word is built from a tray", () => {
  it("uses the fewest tiles", () => {
    expect(runeTiling("light", ["t", "l", "igh", "i", "g", "h"])).toEqual([1, 2, 0]);
  });

  it("uses each tile once, so a word that needs two of a tile the tray holds once cannot be built", () => {
    expect(runeTiling("letter", ["l", "e", "t", "e", "r"])).toBeNull();
  });

  it("uses six distinct indices when the tray holds every letter", () => {
    const tiling = runeTiling("letter", ["l", "e", "t", "t", "e", "r"])!;
    expect(tiling).toHaveLength(6);
    expect(new Set(tiling).size).toBe(6);
    expect(spelled(["l", "e", "t", "t", "e", "r"], tiling)).toBe("letter");
  });

  it("breaks ties by the lower first index", () => {
    expect(runeTiling("mend", ["e", "m", "e", "nd"])).toEqual([1, 0, 3]);
    // me + nd and men + d both take two tiles; me is the lower first index.
    expect(runeTiling("mend", ["nd", "me", "men", "d"])).toEqual([1, 0]);
    // Fewest tiles wins over a lower first index.
    expect(runeTiling("mend", ["m", "en", "d", "me", "nd"])).toEqual([3, 4]);
  });

  it("is null for a word no tiles build, an empty word, or an empty tray", () => {
    expect(runeTiling("mend", ["m", "e", "n"])).toBeNull();
    expect(runeTiling("", ["m"])).toBeNull();
    expect(runeTiling("mend", [])).toBeNull();
  });

  it("stays quick on a full tray of repeats, built or not", () => {
    const tray = Array.from({ length: 16 }, () => "e");
    expect(runeTiling("e".repeat(16), tray)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(runeTiling("e".repeat(15) + "x", tray)).toBeNull();
    expect(runeTiling("e".repeat(17), tray)).toBeNull();
  });

  it("passes over an empty tile, and reads letters without regard to case", () => {
    expect(runeTiling("mend", ["", "M", "E", "nd"])).toEqual([1, 2, 3]);
    expect(runeTiling("Mend", ["m", "e", "nd"])).toEqual([0, 1, 2]);
  });
});

describe("spelled: the word the picks build", () => {
  it("joins the picked tiles in order, lower case", () => {
    expect(spelled(["d", "M", "a", "e", "n"], [1, 3, 4, 0])).toBe("mend");
    expect(spelled(["igh", "l", "t"], [1, 0, 2])).toBe("light");
    expect(spelled(["a"], [])).toBe("");
  });
});

describe("hasSpelledRun: whether the tray's order gives a word away", () => {
  it("finds a word in adjacent tiles, read left to right", () => {
    expect(hasSpelledRun(["m", "e", "nd", "a"], ["mend"])).toBe(true);
    expect(hasSpelledRun(["a", "m", "e", "nd"], ["mend"])).toBe(true);
    expect(hasSpelledRun(["l", "igh", "t"], ["mend", "light"])).toBe(true);
  });

  it("finds none when the order is broken", () => {
    expect(hasSpelledRun(["e", "m", "nd", "a"], ["mend"])).toBe(false);
    expect(hasSpelledRun(["d", "n", "e", "m"], ["mend"])).toBe(false);
    expect(hasSpelledRun([], ["mend"])).toBe(false);
  });

  it("counts a tile that is a word on its own", () => {
    expect(hasSpelledRun(["x", "mend"], ["mend"])).toBe(true);
  });

  it("reads without regard to case", () => {
    expect(hasSpelledRun(["M", "e", "ND"], ["mend"])).toBe(true);
  });
});

describe("runeTiling's bounds (I2 review): it runs on the request path, so it refuses what no pool can hold", () => {
  it("returns null for a tray of more than RUNE_MAX_TILES tiles, even when the word could be built", () => {
    const tray = Array.from({ length: RUNE_MAX_TILES + 1 }, (_, i) => (i === 0 ? "m" : i === 1 ? "end" : "x"));
    expect(runeTiling("mend", tray)).toBeNull();
    expect(runeTiling("mend", tray.slice(0, RUNE_MAX_TILES))).toEqual([0, 1]);
  });

  it("returns null for a word longer than RUNE_MAX_WORD letters", () => {
    expect(RUNE_MAX_WORD).toBe(16);
    const word = "ab".repeat(8) + "c";
    expect(word).toHaveLength(RUNE_MAX_WORD + 1);
    expect(runeTiling(word, [word.slice(0, 9), word.slice(9)])).toBeNull();
    expect(runeTiling(word.slice(0, RUNE_MAX_WORD), [word.slice(0, 9), word.slice(9, RUNE_MAX_WORD)])).toEqual([0, 1]);
  });

  it("finishes at once on an adversarial tray within the caps: every tile a different-length run of one letter", () => {
    // Each tile is a prefix of the word at every position, and no two read alike, so de-duplication cannot help.
    const tray = Array.from({ length: RUNE_MAX_TILES }, (_, i) => "a".repeat(i + 1));
    const started = performance.now();
    const tiling = runeTiling("a".repeat(RUNE_MAX_WORD), tray);
    expect(performance.now() - started).toBeLessThan(500);
    expect(tiling).toEqual([15]);
    expect(runeTiling("a".repeat(RUNE_MAX_WORD - 1) + "b", tray)).toBeNull();
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
