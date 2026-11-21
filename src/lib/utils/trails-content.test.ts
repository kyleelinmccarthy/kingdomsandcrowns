// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TRAIL_SKILLS, formatTrailProblems, validateTrailPool, type TrailPool } from "@/lib/content/trail-pools";
import { ANCHOR_IDS } from "@/lib/realm/anchors";
import { simulateTrailWeek } from "@/test/trail-week";
import { TRAIL_POOL_FILES } from "@/lib/tasks/trails/trail-pool-files";
import { loadTrailPools } from "@/lib/tasks/trails";
import { skillForPool } from "./skills";

const DIR = path.join(__dirname, "../../content/trails");

/**
 * THE ONE PLACE H5 EDITS: the trail pools that ship, by id, one per band (k1, g23, g45, g68, g912). A pool file that is not listed here, or a listed pool with no file, fails the suite.
 * Each pool also needs one import and one entry in `src/lib/tasks/trails/trail-pool-files.ts`, which a
 * test below checks against this list.
 *
 * (The check that every pool has a blind-pass sheet is H6's: it is added once the pools exist, so this
 * gate is never red between H5 and H6.)
 */
const EXPECTED_TRAIL_POOLS: string[] = ["trail-k1", "trail-g23", "trail-g45", "trail-g68"];

/** No place answers more than this share of a pool's clues, so a trail's answers are spread over the whole village. */
const MAX_ANCHOR_SHARE = 0.15;

function loadAll(): { file: string; parsed: TrailPool }[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, parsed: JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as TrailPool }));
}

describe("trail pool content", () => {
  const pools = loadAll();

  it("ships every expected pool and nothing unexpected", () => {
    expect(pools.map((p) => p.parsed.poolId).sort()).toEqual([...EXPECTED_TRAIL_POOLS].sort());
  });

  it("names each file after its pool", () => {
    for (const { file, parsed } of pools) expect(parsed.poolId, file).toBe(file.replace(/\.json$/, ""));
  });

  it("validates every pool", () => {
    for (const { file, parsed } of pools) expect(validateTrailPool(parsed), `${file}\n${formatTrailProblems(validateTrailPool(parsed))}`).toEqual([]);
  });

  it("never collides a pool id with a drill pool's", () => {
    for (const { parsed } of pools) expect(skillForPool(parsed.poolId), parsed.poolId).toBeNull();
  });

  it("credits each band's one skill, once", () => {
    const skills = pools.map((p) => p.parsed.skillId);
    expect(new Set(skills).size).toBe(skills.length);
    for (const { parsed } of pools) expect(parsed.skillId, parsed.poolId).toBe(TRAIL_SKILLS[parsed.band]);
  });

  it("has unique trail ids within a pool", () => {
    for (const { parsed } of pools) {
      const ids = parsed.trails.map((t) => t.id);
      expect(new Set(ids).size, parsed.poolId).toBe(ids.length);
    }
  });

  it("is loaded by the drawer's index: the same pools, and every one passes", () => {
    const listed = TRAIL_POOL_FILES.map((f) => (f as { poolId: string }).poolId).sort();
    expect(listed).toEqual(pools.map((p) => p.parsed.poolId).sort());
    expect(loadTrailPools(TRAIL_POOL_FILES).map((p) => p.poolId).sort()).toEqual(listed);
  });

  it("never repeats a trail in a week of reading side quests (21 runs of 4 clues, every level, seeds 1-20)", () => {
    for (const { parsed } of pools) {
      for (let level = 0; level <= 4; level++) {
        for (let seed = 1; seed <= 20; seed++) {
          const keys = simulateTrailWeek(parsed, level, seed, 4).flat();
          expect(new Set(keys).size, `${parsed.poolId} level ${level} seed ${seed}`).toBe(keys.length);
        }
      }
    }
  });

  it("spreads the answers over every place in the village, none more than 15% of a pool's clues", () => {
    for (const { parsed } of pools) {
      const answers = parsed.trails.flatMap((t) => t.clues.map((c) => c.answer));
      const counts = new Map<string, number>();
      for (const a of answers) counts.set(a, (counts.get(a) ?? 0) + 1);
      for (const id of ANCHOR_IDS) {
        const n = counts.get(id) ?? 0;
        expect(n, `${parsed.poolId}: ${id} answers no clue`).toBeGreaterThan(0);
        expect(n / answers.length, `${parsed.poolId}: ${id} answers ${n} of ${answers.length} clues`).toBeLessThanOrEqual(MAX_ANCHOR_SHARE);
      }
    }
  });
});
