import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(__dirname, "../../content/drills");
const BANDS = ["k1", "g23", "g45", "g68", "g912"];
const EXPECTED_POOLS = [
  "sight-words-k1", "sight-words-g23", "spelling-g23", "spelling-g45",
  "vocab-g45", "vocab-g68", "vocab-g912",
  "science-k1", "science-g23", "science-g45", "science-g68", "science-g912",
];

type PoolFile = { poolId: string; band: string; items: { id: string; prompt: string; answer: string; distractors: string[]; readAloud?: string; level?: number }[] };

function loadAll(): PoolFile[] {
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => {
    const parsed = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as PoolFile;
    expect(parsed.poolId).toBe(f.replace(/\.json$/, ""));
    return parsed;
  });
}

describe("drill pool content", () => {
  const pools = loadAll();

  it("ships every expected pool and nothing unexpected", () => {
    expect(pools.map((p) => p.poolId).sort()).toEqual([...EXPECTED_POOLS].sort());
  });

  it("has a valid band and at least 40 items per pool", () => {
    for (const p of pools) {
      expect(BANDS).toContain(p.band);
      expect(p.items.length).toBeGreaterThanOrEqual(40);
    }
  });

  it("has unique item ids across all pools", () => {
    const ids = pools.flatMap((p) => p.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has well-formed items", () => {
    for (const p of pools) for (const i of p.items) {
      expect(i.prompt.trim().length).toBeGreaterThan(0);
      expect(i.answer.trim().length).toBeGreaterThan(0);
      expect(i.distractors).toHaveLength(3);
      expect(i.distractors).not.toContain(i.answer);
      expect(new Set([i.answer, ...i.distractors]).size).toBe(4);
      if (i.level !== undefined) { expect(i.level).toBeGreaterThanOrEqual(0); expect(i.level).toBeLessThanOrEqual(4); }
      if (p.poolId.startsWith("sight-words")) expect(i.readAloud).toBe(i.answer);
    }
  });
});
