/**
 * Valid rune pools for tests (the validator, the sheet round-trip, the drawer, the week harness, the
 * dev page). They are NOT content: they live here so `src/content/runes/` stays exactly what I5 ships.
 *
 * `fixtureRunePool(band)` passes `validateRunePool` unchanged at every band; the validator tests break
 * it one rule at a time. 80 entries: 16 per effect, at least 3 per effect at every level (R-I19,
 * RI-a / S18). Its words are made, not chosen: runs of consonants from g to z only, each in falling
 * order, so
 *   - no word is English, and none can turn up by chance in a sheet's header or a hex code;
 *   - no word holds or sits inside an effect id (`effect-word`);
 *   - the tiles sorted A–Z read the word backwards, never forwards (`unshufflable`).
 * The decoys are vowels (so k1 and g23 pass `vowel-decoy`), 3, 4 or 5 of them in turn (`count-tell`).
 */
import { LISTEN_BANDS, RUNE_SKILLS, type RuneEntry, type RuneLevel, type RunePool } from "@/lib/content/rune-pools";
import { RUNE_EFFECT_IDS } from "@/lib/realm/rune-objects";
import type { ContentBand } from "@/lib/utils/content-bands";

/** Consonants that are not hex digits, so a word never reads inside an id or a code. */
const LETTERS = "zyxwvtsrqpnmlkjhg";
const DECOYS = ["a", "e", "i", "o", "u"];

/** The first `count` falling runs of `size` letters from `LETTERS`, in a fixed order. */
function fallingRuns(size: number, count: number): string[] {
  const out: string[] = [];
  const walk = (from: number, run: string): void => {
    if (out.length >= count) return;
    if (run.length === size) {
      out.push(run);
      return;
    }
    for (let i = from; i < LETTERS.length; i++) walk(i + 1, run + LETTERS[i]);
  };
  walk(0, "");
  return out;
}

const ENTRIES = 80;

/** The word's tiles: single letters at k1, pairs of letters above. */
const wordTiles = (band: ContentBand, word: string): string[] => (band === "k1" ? word.split("") : [word.slice(0, 2), word.slice(2, 4), word.slice(4, 6)]);

/** One entry, the `i`th of the pool. */
export function fixtureRuneEntry(band: ContentBand, i: number, word: string): RuneEntry {
  const effect = RUNE_EFFECT_IDS[i % RUNE_EFFECT_IDS.length];
  const level = (Math.floor(i / RUNE_EFFECT_IDS.length) % 5) as RuneLevel;
  const n = i + 1;
  const listen = LISTEN_BANDS.includes(band);
  const entry: RuneEntry = {
    id: `fx-${effect}-${String(n).padStart(2, "0")}`,
    effect,
    level,
    prompt: listen ? `Rune ${n}: something needs a word. Build the word you hear.` : `Meaning ${n}: what the thing needs most of all.`,
    words: [word],
    tiles: [...wordTiles(band, word), ...DECOYS.slice(0, 3 + (i % 3))],
    hint: `Listen for each part of it, one by one, number ${n}.`,
  };
  if (listen) entry.readAloud = `${word}. Build ${word}.`;
  if (!listen) entry.why = `It is what the thing needed, number ${n}.`;
  return entry;
}

export function fixtureRunePool(band: ContentBand = "k1"): RunePool {
  const words = fallingRuns(band === "k1" ? 3 : 6, ENTRIES);
  return {
    poolId: `rune-${band}`,
    band,
    skillIds: [...RUNE_SKILLS[band]],
    entries: words.map((word, i) => fixtureRuneEntry(band, i, word)),
  };
}

/** The same pool as JSON text, deep-copied, so a test can mutate it freely. */
export const cloneRunePool = (band: ContentBand = "k1"): RunePool => JSON.parse(JSON.stringify(fixtureRunePool(band))) as RunePool;
