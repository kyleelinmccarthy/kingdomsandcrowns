// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { LISTEN_BANDS, RUNE_SKILLS, formatRuneProblems, validateRunePool, type RunePool } from "@/lib/content/rune-pools";
import { runeTiling } from "@/lib/tasks/rune-tiles";
import { RUNE_POOL_FILES } from "@/lib/tasks/runes/rune-pool-files";
import { loadRunePools } from "@/lib/tasks/runes";
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
const EXPECTED_RUNE_POOLS: string[] = [];

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
});
