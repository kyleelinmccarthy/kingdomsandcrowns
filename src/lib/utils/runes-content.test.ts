// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { containsWord } from "@/lib/content/pool-validate";
import { LISTEN_BANDS, RUNE_SKILLS, formatRuneProblems, validateRunePool, type RunePool } from "@/lib/content/rune-pools";
import { RUNE_EFFECT_IDS, RUNE_OBJECTS, VILLAGE_RUNE_OBJECTS } from "@/lib/realm/rune-objects";
import {
  RUNE_CAST,
  RUNE_CLEAR,
  RUNE_DEMO_COPY,
  RUNE_DEMO_STEPS,
  RUNE_EMPTY_ROW,
  RUNE_ROW_LABEL,
  RUNE_TRAY_LABEL,
  runeTakeBack,
  RUNE_HEAR,
  RUNE_HEAR_MEANING,
  RUNE_HELP,
  RUNE_LOOK_VERB,
  RUNE_NO_SOUND_LEAD,
  RUNE_SAME_WORD,
  RUNE_STORY,
  RUNE_TITLE,
  RUNE_VERB,
  runeSetOffLine,
} from "@/lib/tasks/rune-copy";
import { runeTiling } from "@/lib/tasks/rune-tiles";
import { RUNE_POOL_FILES } from "@/lib/tasks/runes/rune-pool-files";
import { loadRunePools } from "@/lib/tasks/runes";
import { runePoolsWithSheets } from "@/lib/content/rune-blind-pass";
import { simulateRuneWeek } from "@/test/rune-week";
import { CONTENT_BANDS } from "./content-bands";
import { skillForPool } from "./skills";

const DIR = path.join(__dirname, "../../content/runes");

/**
 * THE ONE PLACE I5 EDITS: the rune pools that ship, by id, one per band (rune-k1, rune-g23, rune-g45,
 * rune-g68, rune-g912). A pool file that is not listed here, or a listed pool with no file, fails the
 * suite. Each pool also needs one import and one entry in `src/lib/tasks/runes/rune-pool-files.ts`,
 * which a test below checks against this list.
 *
 * (The check that every pool has a blind-pass sheet is I6's (F-15): it is added once the pools exist,
 * so this gate is never red between I5 and I6.)
 */
const EXPECTED_RUNE_POOLS: string[] = ["rune-k1", "rune-g23", "rune-g45", "rune-g68", "rune-g912"];

function loadAll(): { file: string; parsed: RunePool }[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, parsed: JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as RunePool }));
}

describe("rune pool content", () => {
  const pools = loadAll();

  it("ships every expected pool and nothing unexpected", () => {
    expect(pools.map((p) => p.parsed.poolId).sort()).toEqual([...EXPECTED_RUNE_POOLS].sort());
  });

  it("has a blind-pass sheet for every pool, so no pool ships unread (F-15)", () => {
    // The sheet gate (`rune-blind-pass.test.ts`) settles each sheet that exists; this makes sure one exists.
    expect(runePoolsWithSheets().sort()).toEqual([...EXPECTED_RUNE_POOLS].sort());
  });

  it("names each file after its pool", () => {
    for (const { file, parsed } of pools) expect(parsed.poolId, file).toBe(file.replace(/\.json$/, ""));
  });

  it("validates every pool", () => {
    for (const { file, parsed } of pools) expect(validateRunePool(parsed), `${file}\n${formatRuneProblems(validateRunePool(parsed))}`).toEqual([]);
  });

  it("never collides a pool id with a drill pool's", () => {
    for (const { parsed } of pools) expect(skillForPool(parsed.poolId), parsed.poolId).toBeNull();
  });

  it("credits each band's skills, and no skill twice", () => {
    const skills = pools.flatMap((p) => p.parsed.skillIds);
    expect(new Set(skills).size).toBe(skills.length);
    for (const { parsed } of pools) expect(parsed.skillIds, parsed.poolId).toEqual(RUNE_SKILLS[parsed.band]);
  });

  it("is loaded by the drawer's index: the same pools as the folder, and every one passes", () => {
    const listed = RUNE_POOL_FILES.map((f) => (f as { poolId: string }).poolId).sort();
    expect(listed).toEqual(pools.map((p) => p.parsed.poolId).sort());
    expect(loadRunePools(RUNE_POOL_FILES).map((p) => p.poolId).sort()).toEqual(listed);
  });

  it("from g45 up, no accepted word is, holds or sits inside its effect, nor does a tile of its tiling hold it (the stone shows the effect; I2 review)", () => {
    for (const { parsed } of pools) {
      if (LISTEN_BANDS.includes(parsed.band)) continue; // a dictation's word is spoken by design
      for (const e of parsed.entries) {
        for (const w of e.words) {
          const where = `${parsed.poolId} ${e.id} "${w}" (${e.effect})`;
          expect(w.includes(e.effect) || e.effect.includes(w), where).toBe(false);
          for (const i of runeTiling(w, e.tiles) ?? []) expect(e.tiles[i].includes(e.effect), where).toBe(false);
        }
      }
    }
  });

  it("ships a pool for every band, and every pool has words for all five effects", () => {
    expect(pools.map((p) => p.parsed.band).sort()).toEqual([...CONTENT_BANDS].sort());
    for (const { parsed } of pools) {
      for (const effect of RUNE_EFFECT_IDS) expect(parsed.entries.some((e) => e.effect === effect && e.words.length > 0), `${parsed.poolId} ${effect}`).toBe(true);
    }
  });

  it("meets no entry twice in a week of rune runs (21 runs of 3 words), at every level and seed (R-I19)", () => {
    for (const { parsed } of pools) {
      for (let level = 0; level <= 4; level++) {
        for (let seed = 1; seed <= 20; seed++) {
          const keys = simulateRuneWeek(parsed, level, seed).flat();
          expect(keys.length, `${parsed.poolId} level ${level} seed ${seed}`).toBe(63);
          expect(new Set(keys).size, `${parsed.poolId} level ${level} seed ${seed}`).toBe(63);
        }
      }
    }
  });

  it("hides no accepted word in plain sight: not in an object's label, the rune copy or a Set off line (R-I17)", () => {
    const labels = RUNE_OBJECTS.flatMap((o) => [o.label, o.fixedLabel]);
    const village = VILLAGE_RUNE_OBJECTS.map((o) => o.label);
    const setOff: string[] = [];
    for (let a = 0; a < village.length; a++) {
      setOff.push(runeSetOffLine([village[a]]));
      for (let b = a + 1; b < village.length; b++) {
        setOff.push(runeSetOffLine([village[a], village[b]]));
        for (let c = b + 1; c < village.length; c++) setOff.push(runeSetOffLine([village[a], village[b], village[c]]));
      }
    }
    const copy = [
      RUNE_VERB, RUNE_LOOK_VERB, RUNE_STORY, RUNE_TITLE, RUNE_HELP, RUNE_HEAR, RUNE_HEAR_MEANING, RUNE_NO_SOUND_LEAD, RUNE_EMPTY_ROW, RUNE_SAME_WORD, RUNE_DEMO_COPY,
      // The stone's own words (I8): its buttons, its labels, and the demo's steps.
      RUNE_CAST, RUNE_CLEAR, RUNE_ROW_LABEL, RUNE_TRAY_LABEL, runeTakeBack(""), ...RUNE_DEMO_STEPS,
    ];
    const texts = [...labels, ...copy, ...setOff];
    for (const { parsed } of pools) {
      for (const e of parsed.entries) {
        for (const w of e.words) {
          const hit = texts.find((t) => containsWord(t, w, { inflections: true }));
          expect(hit, `${parsed.poolId} ${e.id} "${w}"`).toBeUndefined();
        }
      }
    }
  });
});
