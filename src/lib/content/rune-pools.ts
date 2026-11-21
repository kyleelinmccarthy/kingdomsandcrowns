/**
 * Rune pools: the content behind rune spellcraft (slice 6, R-I6), the spec's `RUNE_WORDS`. A language
 * side quest can be played as runes: the hero walks to something that needs a rune and builds a word
 * from tiles at the rune stone. Each band has one pool in `src/content/runes/rune-<band>.json`,
 * crediting the band's language skills (`RUNE_SKILLS`).
 *
 * A pool is `{ poolId, band, skillIds, entries }`. An entry is one word to build: its effect (`mend`,
 * `light`, `water`, `open`, `grow`), a mastery level 0-4, the line shown (`prompt`), the accepted
 * `words`, the `tiles` (every word's tiles plus decoys) and a `hint` (the second-chance line). Optional:
 * `readAloud` (required at k1 and g23, where the word is dictated) and `why` (said after a miss;
 * required from g45 up).
 *
 * This module is pure (no filesystem, no `three`, nothing server-only), so the content test, the
 * blind-pass tooling and the drawer share one definition of a good pool. `validateRunePool` is the
 * machine's half of the review; the blind pass (`rune-blind-pass.ts`) is the other half. It is the
 * rune-shaped twin of `trail-pools.ts`.
 *
 * The leak rule (R-I17). The tiles must contain the word, so the rule is that nothing around them
 * gives it away: no prompt or hint holds a word (inflections included, `containsWord`); from g45 up no
 * narration holds one and no word is, holds or sits inside its effect id (the stone shows the effect,
 * I2 review); the decoy count is no tell (`count-tell`); and the tiles can always be shown in an
 * order that spells nothing (`unshufflable`, `shuffleTiles`). At k1 and g23 the word is dictated, so
 * it is in `readAloud` by design (R-I18).
 */
import { RUNE_EFFECT_IDS, type RuneEffect } from "../realm/rune-objects";
import { RUNE_MAX_TILES } from "../tasks/codecs";
import { RUNE_MAX_WORD, hasSpelledRun, runeTiling } from "../tasks/rune-tiles";
import { CONTENT_BANDS, type ContentBand } from "../utils/content-bands";
import { seededRng, shuffle, type Rng } from "../utils/drill-generators";
import { bandTopGrade, gradeIndex } from "../utils/grade-levels";
import { findSkill } from "../utils/skills";
import { hash32, hex8 } from "./hash32";
import { LENGTH_TELL_MAX_SHARE, READABILITY_MAX_ABOVE, READABILITY_MIN_WORDS, containsWord, countWords, fleschKincaidGrade, type Problem } from "./pool-validate";
import { normLabel } from "./sort-pools";

export type { Problem } from "./pool-validate";

export type RuneLevel = 0 | 1 | 2 | 3 | 4;

export type RuneEntry = {
  id: string;
  effect: RuneEffect;
  level: RuneLevel;
  /** The line shown: a dictation's scene ("The lantern is dark. Build the word you hear.") or a meaning. */
  prompt: string;
  /** Spoken. At k1 and g23 it says the word (dictation); from g45 up it never does. */
  readAloud?: string;
  /** Every word that fits and can be built; any of them counts. The first is the one revealed. */
  words: string[];
  /** Every accepted word's tiles, plus decoys. Shuffled at draw time. */
  tiles: string[];
  /** The second-chance line. Never holds a word. */
  hint: string;
  /** Said after a miss. Required from g45 up. */
  why?: string;
};

export type RunePool = { poolId: string; band: ContentBand; skillIds: string[]; entries: RuneEntry[] };

/** Every pool id starts with this. A drill pool id never does, so a sheet in `src/content/review` cannot collide. */
export const RUNE_POOL_PREFIX = "rune-";

/** The language skills each band's pool credits (R-I6, R-I7). */
export const RUNE_SKILLS: Readonly<Record<ContentBand, readonly string[]>> = {
  k1: ["lang-gk", "spell-g1"],
  g23: ["spell-g23", "lang-g3"],
  g45: ["spell-g45", "vocab-g45"],
  g68: ["vocab-g68"],
  g912: ["vocab-g912"],
};

/** The bands where the word is dictated: always spoken, so it reaches the browser in `readAloud` (R-I18). */
export const LISTEN_BANDS: readonly ContentBand[] = ["k1", "g23"];

/** R-I19, RI-a / S18: a week of 21 rune runs of 3 words (63 draws) meets no entry twice. */
export const RUNE_MIN_PER_EFFECT = 16;
export const RUNE_MIN_PER_EFFECT_LEVEL = 3;
/** R-I17: every entry has at least this many decoys. */
export const RUNE_MIN_DECOYS = 3;
/** R-I17: and at least this share of its word's tiles, rounded up. */
const DECOY_SHARE = 0.4;
/** R-I17 (N17): across a pool the decoy counts take at least this many values. */
const MIN_DECOY_VALUES = 3;

/** The most tiles an entry's tray may hold, by band. Each is within `RUNE_MAX_TILES`, what one cast can place. */
export const RUNE_MAX_TILES_BY_BAND: Readonly<Record<ContentBand, number>> = { k1: 8, g23: 9, g45: 12, g68: 8, g912: 8 };

/** What a tile may be, by band: single letters at k1, phonograms at g23, chunks at g45, morphemes and roots above. */
export const RUNE_TILE_FORM: Readonly<Record<ContentBand, RegExp>> = {
  k1: /^[a-z]$/,
  g23: /^[a-z]{1,4}$/,
  g45: /^[a-z]{1,3}$/,
  g68: /^[a-z]{1,8}$/,
  g912: /^[a-z]{1,8}$/,
};

export const RUNE_POOL_RULES = {
  shape: "shape",
  poolId: "pool-id",
  skill: "credited-skill",
  entryId: "entry-id",
  idNamesWord: "id-names-word",
  duplicateEntry: "duplicate-entry",
  opaqueCollision: "opaque-id-collision",
  duplicatePrompt: "duplicate-prompt",
  poolSize: "pool-size",
  levelSize: "level-size",
  wordCount: "word-count",
  wordForm: "word-form",
  duplicateWord: "duplicate-word",
  tileForm: "tile-form",
  tileCount: "tile-count",
  notBuildable: "not-buildable",
  singleTile: "single-tile",
  wholeWordTile: "whole-word-tile",
  fewDecoys: "few-decoys",
  vowelDecoy: "vowel-decoy",
  unshufflable: "unshufflable",
  countTell: "count-tell",
  promptLength: "prompt-length",
  readability: "readability",
  hint: "hint",
  why: "why",
  listenWord: "listen-word",
  showsWord: "shows-word",
  effectWord: "effect-word",
  childWords: "child-words",
  characters: "unsafe-characters",
} as const;
const R = RUNE_POOL_RULES;

const LEVELS: readonly RuneLevel[] = [0, 1, 2, 3, 4];
/** A prompt is at most this many characters, by band. */
const PROMPT_MAX: Readonly<Record<ContentBand, number>> = { k1: 80, g23: 100, g45: 140, g68: 160, g912: 180 };
const HINT_MAX = 140;
const WHY_MAX = 200;
const ENTRY_ID = /^[a-z0-9-]{3,40}$/;
/** A word: lower-case letters, 2 to `RUNE_MAX_WORD` (16) of them, the cap `runeTiling` also holds. */
const WORD_FORM = new RegExp(`^[a-z]{2,${RUNE_MAX_WORD}}$`);
const MAX_WORDS = 3;
const VOWEL = /[aeiou]/;
/** The validator's proof that every entry can be shown: these seeds never spell a word (RI-a / S16). */
const SHUFFLE_PROOF_SEEDS = 50;

/** A grade word and the two comparatives are never said to a child (F-16): on word boundaries, so "gradually" and "upgrade" pass. */
const GRADE_WORDS = /\bgrades?\b|\bkindergarten\b/i;
const COMPARISON_WORDS = /\b(behind|ahead)\b/i;
/** Control characters (a newline would break the sheet's one-line-per-entry format), markup and backticks. */
const UNSAFE_CHARS = /[\u0000-\u001f\u007f`<]/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

// ---------------------------------------------------------------------------
// Identity: keys, ids and sheet codes
// ---------------------------------------------------------------------------

/** `<poolId>/<entryId>`: how a run remembers which entry a word came from (`avoid`, R-I19). Server only. */
export const runeKey = (poolId: string, entryId: string): string => `${poolId}/${entryId}`;

/** The pass-over key for an effect with no broken object to bind to (`runePassOver`, R-I22). */
export const effectKey = (e: RuneEffect): string => `effect:${e}`;

/**
 * What the browser sees of an entry in a task id: 8 lower-case hex characters, from the pool and the
 * author's entry id. A hash of a guessable id can be matched by guessing, so the validator holds every
 * entry id clear of its own words (`id-names-word`): `fx-light-07`, never `lit-lantern`. For task ids
 * ONLY: a sheet's per-entry code is `runeCode`, which follows what is shown, not this.
 */
export const opaqueRuneId = (poolId: string, entryId: string): string => hex8(hash32(runeKey(poolId, entryId)));

/**
 * A short fingerprint of exactly what the blind reader is shown for an entry (F-2): the pool, the
 * effect (its picture), the normalised prompt and readAloud, and the tiles as a set (the sheet shows
 * them sorted, so the authored order is no part of it). It does NOT cover the words (so correcting a
 * key leaves a finished sheet valid; resolutions pin the key through `keyAt`) or the entry id.
 */
export function runeCode(poolId: string, entry: Pick<RuneEntry, "effect" | "prompt" | "readAloud" | "tiles">): string {
  return hex8(hash32([poolId, entry.effect, normLabel(entry.prompt), normLabel(entry.readAloud ?? ""), [...entry.tiles].sort().join(" ")].join("\u0000")));
}

/**
 * How many tiles of the tray the first word does not use: its fewest-tile tiling's leftovers. Null,
 * never a throw, when the entry has no first word or the tiles cannot build it (`not-buildable` says so).
 */
export function decoyCount(entry: Pick<RuneEntry, "words" | "tiles">): number | null {
  const word = entry.words[0];
  const tiling = typeof word === "string" ? runeTiling(word, entry.tiles) : null;
  return tiling ? entry.tiles.length - tiling.length : null;
}

// ---------------------------------------------------------------------------
// Showing the tiles (R-I17, RI-a / S16)
// ---------------------------------------------------------------------------

/** The order of last resort: the tiles sorted A-Z, ties by authored index. A new array. */
export function fallbackTiles(tiles: readonly string[]): string[] {
  return tiles
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.i - b.i))
    .map((x) => x.t);
}

/** How many seeded shuffles `shuffleTiles` tries before it rotates the last. */
export const RUNE_SHUFFLE_TRIES = 8;

/**
 * The tiles in an order where no run of adjacent tiles spells an accepted word (R-I17), from the run's
 * seeded `Rng`. It tries, in order, and returns the first that spells nothing:
 *   1. up to `RUNE_SHUFFLE_TRIES` (8) seeded shuffles;
 *   2. up to `tiles.length` one-place rotations of the last shuffle;
 *   3. `fallbackTiles`.
 * It never loops further. The validator's `unshufflable` rule holds every pool to a clean step 3, so a
 * drawn tray never spells its word. Pure: the `Rng` only.
 */
export function shuffleTiles(tiles: readonly string[], words: readonly string[], rng: Rng): string[] {
  let last = [...tiles];
  for (let i = 0; i < RUNE_SHUFFLE_TRIES; i++) {
    last = shuffle([...tiles], rng);
    if (!hasSpelledRun(last, words)) return last;
  }
  for (let r = 1; r <= last.length; r++) {
    const turned = [...last.slice(r), ...last.slice(0, r)];
    if (!hasSpelledRun(turned, words)) return turned;
  }
  return fallbackTiles(tiles);
}

// ---------------------------------------------------------------------------
// 1. Shape: exact, no extra keys. Everything after this assumes it holds.
// ---------------------------------------------------------------------------

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
/** Every index read, so a hole in a sparse array (`new Array(3)`) is a problem here, not a throw later (`every` skips holes). */
function isStringList(x: unknown): x is string[] {
  if (!Array.isArray(x)) return false;
  for (let i = 0; i < x.length; i++) if (typeof x[i] !== "string") return false;
  return true;
}

function exactKeys(x: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): string | null {
  const extra = Object.keys(x).filter((k) => !required.includes(k) && !optional.includes(k));
  if (extra.length > 0) return `unexpected key ${extra.map((k) => `"${k}"`).join(", ")}`;
  const missing = required.filter((k) => !(k in x));
  return missing.length > 0 ? `missing key ${missing.map((k) => `"${k}"`).join(", ")}` : null;
}

function checkShape(raw: unknown): Problem[] {
  const problems: Problem[] = [];
  const bad = (itemId: string | null, detail: string): void => void problems.push({ itemId, rule: R.shape, detail });
  if (!isRecord(raw)) {
    bad(null, "a pool is an object { poolId, band, skillIds, entries }");
    return problems;
  }
  const keyProblem = exactKeys(raw, ["poolId", "band", "skillIds", "entries"]);
  if (keyProblem) bad(null, `pool: ${keyProblem}`);
  if (typeof raw.poolId !== "string") bad(null, "poolId is a string");
  if (typeof raw.band !== "string" || !(CONTENT_BANDS as readonly string[]).includes(raw.band)) bad(null, `band is one of ${CONTENT_BANDS.join(", ")}`);
  if (!isStringList(raw.skillIds)) bad(null, "skillIds is a list of skill ids");
  if (!Array.isArray(raw.entries)) {
    bad(null, "entries is an array");
    return problems;
  }
  // An indexed loop, not `forEach`: a hole in a sparse array is an entry that is not an object.
  for (let n = 0; n < raw.entries.length; n++) {
    const entry: unknown = raw.entries[n];
    const at = isRecord(entry) && typeof entry.id === "string" ? entry.id : `entry ${n + 1}`;
    if (!isRecord(entry)) {
      bad(null, `${at} is an object`);
      continue;
    }
    const keys = exactKeys(entry, ["id", "effect", "level", "prompt", "words", "tiles", "hint"], ["readAloud", "why"]);
    if (keys) bad(at, keys);
    if (typeof entry.id !== "string") bad(at, "id is a string");
    if (!(RUNE_EFFECT_IDS as readonly unknown[]).includes(entry.effect)) bad(at, `effect is one of ${RUNE_EFFECT_IDS.join(", ")}`);
    if (!(LEVELS as readonly unknown[]).includes(entry.level)) bad(at, "level is 0, 1, 2, 3 or 4");
    for (const k of ["prompt", "hint"]) if (typeof entry[k] !== "string") bad(at, `${k} is a string`);
    for (const k of ["readAloud", "why"]) if (k in entry && typeof entry[k] !== "string") bad(at, `${k} is a string`);
    if (!isStringList(entry.words)) bad(at, "words is a list of strings");
    if (!isStringList(entry.tiles)) bad(at, "tiles is a list of strings");
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 2. Everything else, on a pool whose shape is known to be right
// ---------------------------------------------------------------------------

function checkIdentity(pool: RunePool): Problem[] {
  const problems: Problem[] = [];
  const bad = (rule: string, detail: string): void => void problems.push({ itemId: null, rule, detail });
  if (pool.poolId !== `${RUNE_POOL_PREFIX}${pool.band}`) bad(R.poolId, `poolId "${pool.poolId}" must be "${RUNE_POOL_PREFIX}${pool.band}"`);
  const want = RUNE_SKILLS[pool.band];
  if (pool.skillIds.length !== want.length || pool.skillIds.some((id, i) => id !== want[i])) {
    bad(R.skill, `skillIds [${pool.skillIds.join(", ")}] must be [${want.join(", ")}], the skills band ${pool.band}'s pool credits`);
  }
  for (const id of pool.skillIds) if (findSkill(id)?.area !== "language") bad(R.skill, `skillIds holds "${id}", which is not a language skill`);
  return problems;
}

/** The decoys a word leaves: the tiles its fewest-tile tiling does not use, or null when it cannot be built. */
function decoysFor(word: string, tiles: readonly string[]): string[] | null {
  const tiling = runeTiling(word, tiles);
  if (!tiling) return null;
  const used = new Set(tiling);
  return tiles.filter((_, i) => !used.has(i));
}

function checkEntry(pool: RunePool, entry: RuneEntry): Problem[] {
  const problems: Problem[] = [];
  const bad = (rule: string, detail: string): void => void problems.push({ itemId: entry.id, rule, detail });
  const band = pool.band;
  const listen = LISTEN_BANDS.includes(band);
  const fields: [string, string | undefined][] = [["prompt", entry.prompt], ["readAloud", entry.readAloud], ["hint", entry.hint], ["why", entry.why]];

  // Words and characters, in every field a child can read or hear.
  for (const [name, value] of fields) {
    if (value === undefined) continue;
    if (UNSAFE_CHARS.test(value)) bad(R.characters, `${name} "${value.replace(CONTROL_CHARS, "?")}" has a control character, a backtick or "<"`);
    if (GRADE_WORDS.test(value)) bad(R.childWords, `${name} "${value}" says a grade or kindergarten: nobody is told a grade`);
    if (COMPARISON_WORDS.test(value)) bad(R.childWords, `${name} "${value}" says "behind" or "ahead": nobody is behind or ahead`);
  }

  // The id.
  if (!ENTRY_ID.test(entry.id)) bad(R.entryId, `entry id "${entry.id}" must be 3-40 lower-case letters, digits and dashes`);
  // A task id is a hash of the entry id, and a hash of a guessable id can be matched by guessing (I4 fix round 1).
  // From g45 up only: a dictation's word is spoken by design (R-I18), so its id gives nothing away, and a
  // k1 word may be an effect's own name ("mend" in `fx-mend-03`).
  if (!listen) for (const w of entry.words) {
    if (w.length > 0 && entry.id.toLowerCase().includes(w.toLowerCase())) bad(R.idNamesWord, `entry id "${entry.id}" holds the word "${w}"; name it by effect and number (fx-light-07)`);
  }

  // The words.
  const wordsWanted = listen ? "exactly 1" : `1-${MAX_WORDS}`;
  if (entry.words.length === 0 || entry.words.length > (listen ? 1 : MAX_WORDS)) bad(R.wordCount, `${entry.words.length} words; a ${band} entry has ${wordsWanted}`);
  const words = entry.words.filter((w) => WORD_FORM.test(w));
  for (const w of entry.words) if (!WORD_FORM.test(w)) bad(R.wordForm, `word "${w}" must be 2-${RUNE_MAX_WORD} lower-case letters`);
  if (new Set(entry.words).size !== entry.words.length) bad(R.duplicateWord, `words [${entry.words.join(", ")}] repeat a word`);

  // The tiles.
  for (const t of entry.tiles) if (!RUNE_TILE_FORM[band].test(t)) bad(R.tileForm, `tile "${t}" is not a ${band} tile (${RUNE_TILE_FORM[band].source})`);
  const maxTiles = Math.min(RUNE_MAX_TILES_BY_BAND[band], RUNE_MAX_TILES);
  if (entry.tiles.length > maxTiles) bad(R.tileCount, `${entry.tiles.length} tiles; a ${band} tray holds at most ${maxTiles}`);
  const tiles = entry.tiles.map((t) => t.toLowerCase());
  const tileCapOk = entry.tiles.length <= RUNE_MAX_TILES;
  for (const w of words) {
    // A tile that holds the word, alone or with more letters ("restores"), shows it wherever it stands.
    for (const t of tiles) if (t.includes(w)) bad(R.wholeWordTile, `tile "${t}" holds the accepted word "${w}"`);
    if (!tileCapOk) continue; // runeTiling refuses a tray past the cap; tile-count has said so
    const tiling = runeTiling(w, entry.tiles);
    if (!tiling) {
      bad(R.notBuildable, `"${w}" cannot be built from the tiles [${entry.tiles.join(", ")}] (each tile once)`);
      continue;
    }
    if (tiling.length < 2) bad(R.singleTile, `"${w}" is built from one tile; every word takes at least 2`);
    const decoys = entry.tiles.length - tiling.length;
    const need = Math.max(RUNE_MIN_DECOYS, Math.ceil(DECOY_SHARE * tiling.length));
    if (decoys < need) bad(R.fewDecoys, `"${w}" leaves ${decoys} decoys; it needs at least ${need} (${RUNE_MIN_DECOYS}, and ${DECOY_SHARE} of its ${tiling.length} tiles)`);
  }
  if (listen && words.length > 0 && tileCapOk) {
    const decoys = decoysFor(words[0], entry.tiles);
    if (decoys && !decoys.some((d) => VOWEL.test(d))) bad(R.vowelDecoy, `no decoy holds a vowel, so the tray's vowels are all the word's`);
  }
  // Past the cap the tray is refused already (tile-count), and shuffling it would cost O(n³) for nothing.
  if (words.length > 0 && tileCapOk) {
    if (hasSpelledRun(fallbackTiles(entry.tiles), words)) {
      bad(R.unshufflable, `the tiles sorted A-Z [${fallbackTiles(entry.tiles).join(", ")}] read a word (or a word and more letters): put a decoy that sorts between two of its tiles`);
    } else {
      // Belt and braces, mandated by the plan (RI-a / S16): with a clean fallback this cannot fail, since
      // `shuffleTiles` returns either an order that spells nothing or the fallback. It guards `shuffleTiles`
      // itself, should it ever change.
      for (let seed = 1; seed <= SHUFFLE_PROOF_SEEDS; seed++) {
        const shown = shuffleTiles(entry.tiles, words, seededRng(seed));
        if (hasSpelledRun(shown, words)) {
          bad(R.unshufflable, `seed ${seed} shows the tiles as [${shown.join(", ")}], which spell a word`);
          break;
        }
      }
    }
  }

  // The prompt, the hint and why.
  if (entry.prompt.trim() === "" || entry.prompt.length > PROMPT_MAX[band]) bad(R.promptLength, `prompt is ${entry.prompt.length} characters; a ${band} prompt is 1-${PROMPT_MAX[band]}`);
  if (countWords(entry.prompt) >= READABILITY_MIN_WORDS) {
    const score = fleschKincaidGrade(entry.prompt);
    const ceiling = gradeIndex(bandTopGrade(band)) + READABILITY_MAX_ABOVE;
    if (score !== null && score > ceiling) bad(R.readability, `prompt reads at level ${score.toFixed(1)}, above the ceiling of ${ceiling} for band ${band}`);
  }
  if (entry.hint.trim() === "" || entry.hint.length > HINT_MAX) bad(R.hint, `hint is ${entry.hint.length} characters; it is 1-${HINT_MAX}`);
  if (!listen && entry.why === undefined) bad(R.why, `a ${band} entry has a why`);
  if (entry.why !== undefined && (entry.why.trim() === "" || entry.why.length > WHY_MAX)) bad(R.why, `why is ${entry.why.length} characters; it is 1-${WHY_MAX}`);

  // Dictation (R-I18): the word is heard at k1 and g23.
  if (listen) {
    if (entry.readAloud === undefined || (words[0] !== undefined && !containsWord(entry.readAloud, words[0]))) {
      bad(R.listenWord, `a ${band} entry is a dictation: its readAloud says "${words[0] ?? "the word"}" as a whole word`);
    }
  }

  // Never showing the word (R-I17, RI-a / S15): inflections count.
  const shown: [string, string | undefined][] = [["prompt", entry.prompt], ["hint", entry.hint], ...(listen ? [] : [["readAloud", entry.readAloud] as [string, string | undefined]])];
  for (const w of words) {
    for (const [name, value] of shown) {
      if (value !== undefined && containsWord(value, w, { inflections: true })) bad(R.showsWord, `${name} "${value}" holds "${w}" (or a form of it)`);
    }
  }

  // The effect rides in the view (I2 review): from g45 up no word is it, holds it or sits inside it.
  if (!listen) {
    const effect = entry.effect;
    for (const w of words) {
      const tiling = tileCapOk ? runeTiling(w, entry.tiles) : null;
      const tileHolds = (tiling ?? []).some((i) => entry.tiles[i].toLowerCase().includes(effect));
      if (w.includes(effect) || effect.includes(w) || tileHolds) bad(R.effectWord, `"${w}" and its effect "${effect}" overlap; the stone shows the effect, so the word would show`);
    }
  }
  return problems;
}

/**
 * Every problem with a rune pool; an empty array means it passes. Takes `unknown` so a hand-edited
 * file can be judged before it is trusted: the shape is checked first, and nothing else runs on a
 * pool whose shape is wrong.
 */
export function validateRunePool(raw: unknown): Problem[] {
  const shape = checkShape(raw);
  if (shape.length > 0) return shape;
  const pool = raw as RunePool;
  const problems: Problem[] = [...checkIdentity(pool)];
  const listen = LISTEN_BANDS.includes(pool.band);

  const seenId = new Set<string>();
  const seenShown = new Map<string, string>();
  const seenCode = new Map<string, string>();
  const seenOpaque = new Map<string, string>();
  for (const entry of pool.entries) {
    problems.push(...checkEntry(pool, entry));
    const bad = (rule: string, detail: string): void => void problems.push({ itemId: entry.id, rule, detail });
    if (seenId.has(entry.id)) bad(R.duplicateEntry, `entry id "${entry.id}" is used twice`);
    seenId.add(entry.id);

    // What the reader is given must differ between entries: the prompt, or, for a dictation, the prompt and what is heard.
    const shown = listen ? `${normLabel(entry.prompt)}\u0000${normLabel(entry.readAloud ?? "")}` : normLabel(entry.prompt);
    const firstShown = seenShown.get(shown);
    if (firstShown !== undefined) bad(R.duplicatePrompt, `it shows the same ${listen ? "prompt and readAloud" : "prompt"} as ${firstShown} (compared without case or spacing)`);
    else seenShown.set(shown, entry.id);
    const code = runeCode(pool.poolId, entry);
    const firstCode = seenCode.get(code);
    if (firstCode !== undefined && firstShown === undefined) bad(R.duplicatePrompt, `it has the same sheet code (#${code}) as ${firstCode}; reword one`);
    else if (firstCode === undefined) seenCode.set(code, entry.id);

    const opaque = opaqueRuneId(pool.poolId, entry.id);
    const firstOpaque = seenOpaque.get(opaque);
    if (firstOpaque !== undefined && firstOpaque !== entry.id) bad(R.opaqueCollision, `its opaque id ${opaque} is also ${firstOpaque}'s; rename one`);
    else seenOpaque.set(opaque, entry.id);
  }

  for (const effect of RUNE_EFFECT_IDS) {
    const of = pool.entries.filter((e) => e.effect === effect);
    if (of.length < RUNE_MIN_PER_EFFECT) problems.push({ itemId: null, rule: R.poolSize, detail: `${effect} has ${of.length} entries; every effect needs at least ${RUNE_MIN_PER_EFFECT}` });
    for (const level of LEVELS) {
      const n = of.filter((e) => e.level === level).length;
      if (n < RUNE_MIN_PER_EFFECT_LEVEL) problems.push({ itemId: null, rule: R.levelSize, detail: `${effect} has ${n} entries at level ${level}; every effect needs at least ${RUNE_MIN_PER_EFFECT_LEVEL} at every level` });
    }
  }

  // The decoy count is no tell (R-I17, N17): spread over at least 3 values, none more than LENGTH_TELL_MAX_SHARE.
  const counts = pool.entries.filter((e) => e.tiles.length <= RUNE_MAX_TILES).map(decoyCount).filter((c): c is number => c !== null);
  if (counts.length > 0) {
    const byCount = new Map<number, number>();
    for (const c of counts) byCount.set(c, (byCount.get(c) ?? 0) + 1);
    if (byCount.size < MIN_DECOY_VALUES) {
      problems.push({ itemId: null, rule: R.countTell, detail: `decoy counts take ${byCount.size} value(s) [${[...byCount.keys()].sort((a, b) => a - b).join(", ")}]; vary them over at least ${MIN_DECOY_VALUES}` });
    }
    for (const [c, n] of byCount) {
      if (n / counts.length > LENGTH_TELL_MAX_SHARE) {
        problems.push({ itemId: null, rule: R.countTell, detail: `${n} of ${counts.length} entries have ${c} decoys (${Math.round((100 * n) / counts.length)}%); no count may hold more than ${LENGTH_TELL_MAX_SHARE * 100}%` });
      }
    }
  }
  return problems;
}

/** The problems as lines, for a failure message. */
export function formatRuneProblems(problems: readonly Problem[]): string {
  return problems.map((p) => `[${p.rule}]${p.itemId ? ` ${p.itemId}:` : ""} ${p.detail}`).join("\n");
}
