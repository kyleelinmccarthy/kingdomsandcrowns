// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RUNE_EFFECT_IDS } from "@/lib/realm/rune-objects";
import { RUNE_MAX_TILES } from "@/lib/tasks/codecs";
import { hasSpelledRun } from "@/lib/tasks/rune-tiles";
import { CONTENT_BANDS, type ContentBand } from "@/lib/utils/content-bands";
import { findSkill } from "@/lib/utils/skills";
import { cloneRunePool } from "@/test/rune-pool-fixture";
import { mapRows } from "@/test/skill-map";
import { NON_DRILL_SHEET_PREFIXES } from "./blind-pass";
import { hash32, hex8 } from "./hash32";
import {
  LISTEN_BANDS,
  RUNE_MAX_TILES_BY_BAND,
  RUNE_MIN_DECOYS,
  RUNE_MIN_PER_EFFECT,
  RUNE_MIN_PER_EFFECT_LEVEL,
  RUNE_POOL_PREFIX,
  RUNE_POOL_RULES,
  RUNE_SKILLS,
  RUNE_TILE_FORM,
  decoyCount,
  effectKey,
  fallbackTiles,
  formatRuneProblems,
  opaqueRuneId,
  runeKey,
  validateRunePool,
  type RuneEntry,
  type RunePool,
} from "./rune-pools";

const R = RUNE_POOL_RULES;

/** The rules a pool breaks, as a set. */
const rulesOf = (pool: unknown): Set<string> => new Set(validateRunePool(pool).map((p) => p.rule));
/** The rules one entry breaks. */
const rulesAt = (pool: RunePool, entryId: string): Set<string> =>
  new Set(validateRunePool(pool).filter((p) => p.itemId === entryId).map((p) => p.rule));

/** A pool at `band` whose first entry of `effect` is replaced by `over` (the rest of the pool is untouched). */
function withEntry(band: ContentBand, over: Partial<RuneEntry>, effect: RuneEntry["effect"] = "mend"): { pool: RunePool; id: string } {
  const pool = cloneRunePool(band);
  const at = pool.entries.findIndex((e) => e.effect === effect);
  pool.entries[at] = { ...pool.entries[at], ...over };
  return { pool, id: pool.entries[at].id };
}

describe("the fixture", () => {
  it.each(CONTENT_BANDS)("passes the validator unchanged at %s", (band) => {
    const pool = cloneRunePool(band);
    expect(validateRunePool(pool), formatRuneProblems(validateRunePool(pool))).toEqual([]);
    expect(pool.entries).toHaveLength(80);
  });
});

describe("validateRunePool: shape and identity", () => {
  it("refuses a pool that is not the right shape, before anything else", () => {
    expect(rulesOf(null)).toEqual(new Set([R.shape]));
    expect(rulesOf({ ...cloneRunePool(), extra: 1 })).toEqual(new Set([R.shape]));
    const pool = cloneRunePool() as unknown as { entries: Record<string, unknown>[] };
    delete pool.entries[0].hint;
    expect(rulesOf(pool)).toEqual(new Set([R.shape]));
    const bad = cloneRunePool() as unknown as { entries: Record<string, unknown>[] };
    bad.entries[0].words = "mend";
    expect(rulesOf(bad)).toEqual(new Set([R.shape]));
    const level = cloneRunePool() as unknown as { entries: Record<string, unknown>[] };
    level.entries[0].level = 5;
    expect(rulesOf(level)).toEqual(new Set([R.shape]));
    const effect = cloneRunePool() as unknown as { entries: Record<string, unknown>[] };
    effect.entries[0].effect = "burn";
    expect(rulesOf(effect)).toEqual(new Set([R.shape]));
  });

  it("names the pool after its band, and credits the band's skills, in order", () => {
    expect(rulesOf({ ...cloneRunePool("g23"), poolId: "rune-g45" })).toContain(R.poolId);
    expect(rulesOf({ ...cloneRunePool("k1"), skillIds: ["spell-g1", "lang-gk"] })).toContain(R.skill);
    expect(rulesOf({ ...cloneRunePool("k1"), skillIds: ["lang-gk"] })).toContain(R.skill);
  });

  it("credits only language skills of the catalog", () => {
    for (const ids of Object.values(RUNE_SKILLS)) for (const id of ids) expect(findSkill(id)?.area, id).toBe("language");
  });

  it("wants unique entry ids of 3-40 lower-case letters, digits and dashes", () => {
    const pool = cloneRunePool();
    pool.entries[1].id = pool.entries[0].id;
    expect(rulesOf(pool)).toContain(R.duplicateEntry);
    expect(rulesAt(withEntry("k1", { id: "Bad_Id" }).pool, "Bad_Id")).toContain(R.entryId);
  });

  it("wants every prompt different from a meaning's (g45 up)", () => {
    const pool = cloneRunePool("g45");
    pool.entries[1].prompt = ` ${pool.entries[0].prompt.toUpperCase()} `;
    expect(rulesAt(pool, pool.entries[1].id)).toContain(R.duplicatePrompt);
  });

  it("lets two dictations share a shown line when what is heard differs, but not both (k1, g23)", () => {
    const pool = cloneRunePool("k1");
    pool.entries[1].prompt = pool.entries[0].prompt;
    expect(rulesAt(pool, pool.entries[1].id)).not.toContain(R.duplicatePrompt);
    pool.entries[1].readAloud = pool.entries[0].readAloud;
    pool.entries[1].words = [...pool.entries[0].words];
    expect(rulesAt(pool, pool.entries[1].id)).toContain(R.duplicatePrompt);
  });
});

describe("validateRunePool: size (R-I19, RI-a / S18)", () => {
  it("wants 16 entries of every effect", () => {
    expect(RUNE_MIN_PER_EFFECT).toBe(16);
    const pool = cloneRunePool();
    const drop = pool.entries.findIndex((e) => e.effect === "water" && e.level === 0);
    pool.entries.splice(drop, 1);
    expect(pool.entries.filter((e) => e.effect === "water")).toHaveLength(15);
    expect(rulesOf(pool)).toContain(R.poolSize);
  });

  it("wants 3 of every effect at every level", () => {
    expect(RUNE_MIN_PER_EFFECT_LEVEL).toBe(3);
    const pool = cloneRunePool();
    // Move one level-2 grow entry to level 0: still 16 grow entries, but only 2 at level 2.
    const moved = pool.entries.find((e) => e.effect === "grow" && e.level === 2)!;
    moved.level = 0;
    expect(pool.entries.filter((e) => e.effect === "grow")).toHaveLength(16);
    const problems = validateRunePool(pool).filter((p) => p.rule === R.levelSize);
    expect(problems).toHaveLength(1);
    expect(problems[0].detail).toMatch(/grow.*level 2/);
  });
});

describe("validateRunePool: words", () => {
  it("takes exactly one word at k1 and g23, and 1-3 from g45 up", () => {
    expect(rulesAt(withEntry("k1", { words: ["zyx", "zyw"] }).pool, "fx-mend-01")).toContain(R.wordCount);
    expect(rulesAt(withEntry("g23", { words: [] }).pool, "fx-mend-01")).toContain(R.wordCount);
    const pool = cloneRunePool("g45");
    const e = pool.entries[0];
    e.words = [e.words[0], "vqzy"];
    e.tiles = [...e.tiles, "vq", "zy"];
    expect(rulesAt(pool, e.id)).not.toContain(R.wordCount);
    e.words = [...e.words, "a", "b"];
    expect(rulesAt(pool, e.id)).toContain(R.wordCount);
  });

  it("wants each word 2-16 lower-case letters, with no repeats", () => {
    for (const w of ["Mend", "m", "me nd", "x".repeat(17)]) expect(rulesAt(withEntry("g45", { words: [w] }).pool, "fx-mend-01"), w).toContain(R.wordForm);
    expect(rulesAt(withEntry("g45", { words: ["zyxwvt", "zyxwvt"] }).pool, "fx-mend-01")).toContain(R.duplicateWord);
  });
});

describe("validateRunePool: tiles (R-I17)", () => {
  it("holds each tile to its band's form: a g23 tile may be four letters, a k1 tile only one", () => {
    expect(RUNE_TILE_FORM.g23.test("tion")).toBe(true);
    expect(RUNE_TILE_FORM.k1.test("sh")).toBe(false);
    const { pool, id } = withEntry("g23", { tiles: ["zy", "xw", "vt", "tion", "a", "e"], words: ["zyxwvt"] });
    expect(rulesAt(pool, id)).not.toContain(R.tileForm);
    const k1 = cloneRunePool("k1");
    k1.entries[0].tiles = [...k1.entries[0].tiles, "sh"];
    expect(rulesAt(k1, k1.entries[0].id)).toContain(R.tileForm);
  });

  it("caps the tray by band, and never past what a cast can hold (RUNE_MAX_TILES)", () => {
    expect(RUNE_MAX_TILES_BY_BAND).toEqual({ k1: 8, g23: 9, g45: 12, g68: 8, g912: 8 });
    for (const band of CONTENT_BANDS) expect(RUNE_MAX_TILES_BY_BAND[band]).toBeLessThanOrEqual(RUNE_MAX_TILES);
    const k1 = cloneRunePool("k1");
    const e = k1.entries.find((x) => x.tiles.length === 8)!;
    e.tiles = [...e.tiles, "y"];
    expect(rulesAt(k1, e.id)).toContain(R.tileCount);
  });

  it("fails a word the tiles cannot build: tiles m, e, n for mend", () => {
    const { pool, id } = withEntry("k1", { words: ["mend"], readAloud: "Mend. Build mend.", tiles: ["m", "e", "n", "a", "i", "o"] });
    expect(rulesAt(pool, id)).toContain(R.notBuildable);
  });

  it("fails a tile that is a whole word, and a word built from one tile", () => {
    const { pool, id } = withEntry("g45", { words: ["zyxwvt"], tiles: ["zyx", "wvt", "zyxwvt", "a", "e", "i"] });
    expect(rulesAt(pool, id)).toContain(R.wholeWordTile);
    const one = withEntry("g68", { words: ["zyxwvt"], tiles: ["zyxwvt", "a", "e", "i"] });
    expect(rulesAt(one.pool, one.id)).toContain(R.singleTile);
  });

  it("fails two decoys, and fewer than 0.4 of the word's tiles", () => {
    expect(RUNE_MIN_DECOYS).toBe(3);
    const { pool, id } = withEntry("k1", { tiles: ["z", "y", "x", "a", "e"], words: ["zyx"], readAloud: "zyx. Build zyx." });
    expect(rulesAt(pool, id)).toContain(R.fewDecoys);
    // Nine tiles in the word want four decoys (⌈0.4 × 9⌉); three are too few.
    const long = withEntry("g45", { words: ["zyxwvtsrq"], tiles: [..."zyxwvtsrq".split(""), "a", "e", "i"] });
    expect(rulesAt(long.pool, long.id)).toContain(R.fewDecoys);
    const enough = withEntry("g45", { words: ["zyxwvtsrq"], tiles: [..."zyxwvtsrq".split(""), "a", "e", "i", "o"] });
    expect(rulesAt(enough.pool, enough.id)).not.toContain(R.fewDecoys);
  });

  it("wants a vowel among a k1 or g23 entry's decoys, so the tray's vowels are not all the word's", () => {
    const { pool, id } = withEntry("k1", { tiles: ["z", "y", "x", "p", "q", "r"] });
    expect(rulesAt(pool, id)).toContain(R.vowelDecoy);
    const g45 = withEntry("g45", { tiles: ["zy", "xw", "vt", "p", "q", "r"] });
    expect(rulesAt(g45.pool, g45.id)).not.toContain(R.vowelDecoy);
  });

  it("fails an entry whose tiles sorted A-Z spell its word (unshufflable, RI-a / S16)", () => {
    const { pool, id } = withEntry("k1", { words: ["abc"], readAloud: "abc. Build abc.", tiles: ["c", "b", "a", "o", "u", "y"] });
    expect(fallbackTiles(["c", "b", "a", "o", "u", "y"])).toEqual(["a", "b", "c", "o", "u", "y"]);
    expect(rulesAt(pool, id)).toContain(R.unshufflable);
    // A decoy that sorts between two of the word's tiles breaks the run.
    const between = withEntry("k1", { words: ["ace"], readAloud: "ace. Build ace.", tiles: ["e", "c", "a", "b", "u", "y"] });
    expect(hasSpelledRun(fallbackTiles(["e", "c", "a", "b", "u", "y"]), ["ace"])).toBe(false);
    expect(rulesAt(between.pool, between.id)).not.toContain(R.unshufflable);
  });
});

describe("validateRunePool: count tells (R-I17, RI-a / N17)", () => {
  /** Sets the decoy count of the first `n` entries that have `from` decoys to `to`. */
  function recount(pool: RunePool, from: number, to: number, n: number): void {
    let left = n;
    for (const e of pool.entries) {
      if (left === 0) break;
      if (decoyCount(e) !== from) continue;
      const word = e.tiles.slice(0, e.tiles.length - from);
      e.tiles = [...word, ...["a", "e", "i", "o", "u"].slice(0, to)];
      left -= 1;
    }
  }

  it("fails a pool where every entry has 3 decoys", () => {
    const pool = cloneRunePool();
    recount(pool, 4, 3, 80);
    recount(pool, 5, 3, 80);
    expect(new Set(pool.entries.map(decoyCount))).toEqual(new Set([3]));
    expect(rulesOf(pool)).toContain(R.countTell);
  });

  it("fails a pool whose decoy counts take only two values", () => {
    const pool = cloneRunePool();
    recount(pool, 5, 4, 80);
    expect(rulesOf(pool)).toContain(R.countTell);
  });

  it("fails 46% of entries sharing a count, and passes 45%", () => {
    const pool = cloneRunePool();
    const three = pool.entries.filter((e) => decoyCount(e) === 3).length;
    recount(pool, 4, 3, 36 - three);
    expect(pool.entries.filter((e) => decoyCount(e) === 3)).toHaveLength(36);
    expect(rulesOf(pool)).not.toContain(R.countTell);
    recount(pool, 4, 3, 1);
    expect(pool.entries.filter((e) => decoyCount(e) === 3).length / 80).toBeCloseTo(0.4625);
    expect(rulesOf(pool)).toContain(R.countTell);
  });
});

describe("validateRunePool: prompts, hints and why", () => {
  it("caps a prompt's length by band", () => {
    expect(rulesAt(withEntry("k1", { prompt: "a".repeat(81) }).pool, "fx-mend-01")).toContain(R.promptLength);
    expect(rulesAt(withEntry("k1", { prompt: "a".repeat(80) }).pool, "fx-mend-01")).not.toContain(R.promptLength);
    expect(rulesAt(withEntry("g912", { prompt: "a".repeat(181) }).pool, "fx-mend-01")).toContain(R.promptLength);
    expect(rulesAt(withEntry("g45", { prompt: "   " }).pool, "fx-mend-01")).toContain(R.promptLength);
  });

  it("holds a prompt of 12 words or more to its band's reading level", () => {
    const hard = "Considerable institutional responsibility necessitates extraordinary administrative documentation regarding organisational accountability.";
    expect(rulesAt(withEntry("g23", { prompt: hard.slice(0, 100) }).pool, "fx-mend-01")).not.toContain(R.readability);
    const twelve = "Considerable institutional responsibility necessitates extraordinary administrative care in every single area of life.";
    expect(rulesAt(withEntry("g45", { prompt: twelve }).pool, "fx-mend-01")).toContain(R.readability);
  });

  it("wants a hint of at most 140 characters", () => {
    expect(rulesAt(withEntry("k1", { hint: "" }).pool, "fx-mend-01")).toContain(R.hint);
    expect(rulesAt(withEntry("k1", { hint: "a".repeat(141) }).pool, "fx-mend-01")).toContain(R.hint);
  });

  it("wants a why from g45 up, of at most 200 characters", () => {
    const pool = cloneRunePool("g45");
    delete pool.entries[0].why;
    expect(rulesAt(pool, pool.entries[0].id)).toContain(R.why);
    expect(rulesAt(withEntry("g68", { why: "a".repeat(201) }).pool, "fx-mend-01")).toContain(R.why);
    const k1 = cloneRunePool("k1");
    expect(k1.entries[0].why).toBeUndefined();
    expect(rulesAt(k1, k1.entries[0].id)).not.toContain(R.why);
  });
});

describe("validateRunePool: the word stays out of sight (R-I17, R-I18, RI-a / S15)", () => {
  it("fails a g45 prompt that holds the word, and a hint that holds its plural", () => {
    const p = withEntry("g45", { words: ["water"], tiles: ["w", "a", "t", "er", "or", "ar", "d"], prompt: "To water the plants." }, "grow");
    expect(rulesAt(p.pool, p.id)).toContain(R.showsWord);
    const h = withEntry("g45", { words: ["water"], tiles: ["w", "a", "t", "er", "or", "ar", "d"], hint: "Think of waters." }, "grow");
    expect(rulesAt(h.pool, h.id)).toContain(R.showsWord);
  });

  it("counts inflections: restored, mending and watering give the word away", () => {
    const restore = withEntry("g68", { words: ["restore"], tiles: ["re", "store", "de", "pre", "scrib"], hint: "It means the thing is restored." });
    expect(rulesAt(restore.pool, restore.id)).toContain(R.showsWord);
    const mend = withEntry("g45", { words: ["mend"], tiles: ["m", "e", "nd", "a", "i", "ck"], hint: "Mending is what it needs." }, "grow");
    expect(rulesAt(mend.pool, mend.id)).toContain(R.showsWord);
    const water = withEntry("g45", { words: ["water"], tiles: ["w", "a", "t", "er", "or", "ar", "d"], prompt: "What the gardener was watering." }, "grow");
    expect(rulesAt(water.pool, water.id)).toContain(R.showsWord);
  });

  it("matches only the forms the rule names: tower is not tow (under 4 letters, plurals only)", () => {
    const { pool, id } = withEntry("g45", { words: ["tow"], tiles: ["t", "o", "w", "a", "e", "i"], prompt: "To pull a cart to the tower." });
    expect(rulesAt(pool, id)).not.toContain(R.showsWord);
  });

  it("fails a g23 prompt that shows the word, while its readAloud may say it (dictation)", () => {
    const shown = withEntry("g23", { words: ["mend"], tiles: ["m", "e", "nd", "a", "i", "ck", "sh"], prompt: "Build the word mend.", readAloud: "Mend. Mend the wagon." });
    expect(rulesAt(shown.pool, shown.id)).toContain(R.showsWord);
    const heard = withEntry("g23", { words: ["mend"], tiles: ["m", "e", "nd", "a", "i", "ck", "sh"], prompt: "The wagon is broken. Build the word you hear.", readAloud: "Mend. Mend the wagon." });
    expect(rulesAt(heard.pool, heard.id)).toEqual(new Set());
  });

  it("fails a g68 readAloud that holds the word", () => {
    const { pool, id } = withEntry("g68", { words: ["restore"], tiles: ["re", "store", "de", "pre", "scrib"], readAloud: "To restore a thing." });
    expect(rulesAt(pool, id)).toContain(R.showsWord);
  });

  it("wants a k1 or g23 readAloud that says the word, and fails a g23 entry with none (R-I18)", () => {
    expect(rulesAt(withEntry("k1", { readAloud: "Build the word you hear." }).pool, "fx-mend-01")).toContain(R.listenWord);
    const pool = cloneRunePool("g23");
    delete pool.entries[0].readAloud;
    expect(rulesAt(pool, pool.entries[0].id)).toContain(R.listenWord);
    // A meaning needs none.
    expect(cloneRunePool("g45").entries[0].readAloud).toBeUndefined();
  });

  it("from g45 up, fails a word that is, holds or sits inside its effect, or a tile of it that holds the effect (I2 review)", () => {
    const cases: [ContentBand, RuneEntry["effect"], string, string[]][] = [
      ["g45", "water", "water", ["w", "a", "t", "er", "or", "ar", "d"]],
      ["g45", "water", "waters", ["w", "a", "t", "ers", "or", "ar", "d"]],
      ["g68", "grow", "regrow", ["re", "grow", "de", "pre", "un"]],
      ["g68", "open", "reopen", ["re", "open", "de", "pre", "un"]],
      ["g912", "light", "enlighten", ["en", "light", "en", "de", "pre", "un"]],
      ["g45", "mend", "men", ["m", "en", "a", "i", "o"]],
    ];
    for (const [band, effect, word, tiles] of cases) {
      const { pool, id } = withEntry(band, { words: [word], tiles }, effect);
      expect(rulesAt(pool, id), `${band} ${effect} ${word}`).toContain(R.effectWord);
    }
    // A dictation is spoken by design, so k1 and g23 are exempt.
    const k1 = withEntry("k1", { words: ["mend"], readAloud: "Mend. Build mend.", tiles: ["m", "e", "n", "d", "a", "i", "o"] }, "mend");
    expect(rulesAt(k1.pool, k1.id)).not.toContain(R.effectWord);
    // Another effect's word is no tell.
    const other = withEntry("g45", { words: ["water"], tiles: ["w", "a", "t", "er", "or", "ar", "d"] }, "grow");
    expect(rulesAt(other.pool, other.id)).not.toContain(R.effectWord);
  });

  it("never says a grade, kindergarten, behind or ahead (F-16): a gradual climb is fine", () => {
    expect(rulesAt(withEntry("g45", { hint: "A gradual climb." }).pool, "fx-mend-01")).not.toContain(R.childWords);
    expect(rulesAt(withEntry("g45", { hint: "Like a grade on a test." }).pool, "fx-mend-01")).toContain(R.childWords);
    expect(rulesAt(withEntry("g45", { why: "Kindergarten words." }).pool, "fx-mend-01")).toContain(R.childWords);
    expect(rulesAt(withEntry("g45", { prompt: "What you do when you fall behind." }).pool, "fx-mend-01")).toContain(R.childWords);
  });

  it("refuses markup, backticks and control characters in any field", () => {
    expect(rulesAt(withEntry("g45", { hint: "<b>bold</b>" }).pool, "fx-mend-01")).toContain(R.characters);
    expect(rulesAt(withEntry("g45", { prompt: "a `code` word" }).pool, "fx-mend-01")).toContain(R.characters);
    expect(rulesAt(withEntry("k1", { readAloud: "zyx.\nBuild zyx." }).pool, "fx-mend-01")).toContain(R.characters);
  });
});

describe("keys, ids and counts", () => {
  it("names an entry as <poolId>/<entryId>, and an effect as effect:<e>", () => {
    expect(runeKey("rune-k1", "lit-lantern")).toBe("rune-k1/lit-lantern");
    expect(effectKey("light")).toBe("effect:light");
  });

  it("gives an opaque id of 8 hex characters from the pool and the entry id", () => {
    expect(opaqueRuneId("rune-k1", "lit-lantern")).toBe(hex8(hash32("rune-k1/lit-lantern")));
    expect(opaqueRuneId("rune-k1", "lit-lantern")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("counts the decoys against the first word's fewest-tile tiling", () => {
    expect(decoyCount({ words: ["light"], tiles: ["l", "igh", "t", "i", "g", "h", "a"] } as RuneEntry)).toBe(4);
  });

  it("sorts the fallback A-Z, ties by authored index, and leaves the input alone", () => {
    const tiles = ["e", "b", "a", "b", "c"];
    expect(fallbackTiles(tiles)).toEqual(["a", "b", "b", "c", "e"]);
    expect(tiles).toEqual(["e", "b", "a", "b", "c"]);
  });

  it("lists the dictation bands", () => {
    expect([...LISTEN_BANDS]).toEqual(["k1", "g23"]);
  });

  it("covers every effect in the fixture at every band", () => {
    for (const band of CONTENT_BANDS) expect(new Set(cloneRunePool(band).entries.map((e) => e.effect))).toEqual(new Set(RUNE_EFFECT_IDS));
  });
});

describe("the skill map and the sheet prefixes", () => {
  it("parses to the eight rows of RUNE_SKILLS, in the shared mapRows", () => {
    const rows = mapRows("rune-skill-map.md");
    expect(rows.map((r) => r.skillId)).toEqual(CONTENT_BANDS.flatMap((b) => RUNE_SKILLS[b]));
    for (const row of rows) {
      expect(row.strand).toBe("language");
      expect(row.grade).toBe(findSkill(row.skillId)!.grades[0]);
    }
  });

  it("keeps the rune sheets out of the drill gate (F-1)", () => {
    expect(RUNE_POOL_PREFIX).toBe("rune-");
    expect(NON_DRILL_SHEET_PREFIXES).toContain(RUNE_POOL_PREFIX);
  });
});
