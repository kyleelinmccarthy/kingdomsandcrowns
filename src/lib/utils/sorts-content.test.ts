// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { formatSortProblems, validateSortPool, type SortPool } from "@/lib/content/sort-pools";
import { SORT_POOL_FILES } from "@/lib/tasks/locks/sort-pool-files";
import { loadSortPools } from "@/lib/tasks/locks/sort";
import { skillForPool } from "./skills";

const DIR = path.join(__dirname, "../../content/sorts");

/**
 * THE ONE PLACE F7 EDITS: the sort pools that ship, by id. Empty until F7 writes the eight
 * (science: k1, g23, g45, g68, g912; vocabulary: g45, g68, g912). A pool file that is not listed here,
 * or a listed pool with no file, fails the suite. Each pool also needs one import and one entry in
 * `src/lib/tasks/locks/sort-pool-files.ts`, which a test below checks against this list.
 */
const EXPECTED_SORT_POOLS: string[] = [
  "sort-science-k1",
  "sort-science-g23",
  "sort-science-g45",
  "sort-science-g68",
  "sort-science-g912",
  "sort-vocab-g45",
  "sort-vocab-g68",
  "sort-vocab-g912",
];

function loadAll(): { file: string; parsed: SortPool }[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, parsed: JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as SortPool }));
}

describe("sort pool content", () => {
  const pools = loadAll();

  it("ships every expected pool and nothing unexpected", () => {
    expect(pools.map((p) => p.parsed.poolId).sort()).toEqual([...EXPECTED_SORT_POOLS].sort());
  });

  it("names each file after its pool", () => {
    for (const { file, parsed } of pools) expect(parsed.poolId, file).toBe(file.replace(/\.json$/, ""));
  });

  it("validates every pool", () => {
    for (const { file, parsed } of pools) expect(validateSortPool(parsed), `${file}\n${formatSortProblems(validateSortPool(parsed))}`).toEqual([]);
  });

  it("never collides a pool id with a drill pool's", () => {
    for (const { parsed } of pools) expect(skillForPool(parsed.poolId), parsed.poolId).toBeNull();
  });

  it("has unique item ids across all sort pools", () => {
    const ids = pools.flatMap((p) => p.parsed.sets.flatMap((s) => s.items.map((i) => i.id)));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is loaded by the drawer's index: the same pools, and every one passes", () => {
    const listed = SORT_POOL_FILES.map((f) => (f as { poolId: string }).poolId).sort();
    expect(listed).toEqual(pools.map((p) => p.parsed.poolId).sort());
    expect(loadSortPools(SORT_POOL_FILES).map((p) => p.poolId).sort()).toEqual(listed);
  });
});
