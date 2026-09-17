import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GRADES } from "./grade-levels";
import { skillForPool } from "./skills";

const DIR = path.join(__dirname, "../../content/drills");
const EXPECTED_POOLS = [
  "sight-words-k1", "sight-words-g23", "spelling-g23", "spelling-g45",
  "vocab-g45", "vocab-g68", "vocab-g912",
  "science-k1", "science-g23", "science-g45", "science-g68", "science-g912",
  "lang-gk", "lang-g1", "lang-g3",
  "read-g1", "read-g3", "read-g4",
];

type PoolFile = { poolId: string; grade: string; items: { id: string; prompt: string; answer: string; distractors: string[]; readAloud?: string; level?: number }[] };

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

  it("has a valid grade and at least 40 items per pool", () => {
    for (const p of pools) {
      expect(GRADES, `pool ${p.poolId}`).toContain(p.grade);
      expect(p.items.length, `pool ${p.poolId}`).toBeGreaterThanOrEqual(40);
    }
  });

  /**
   * The pool file and the skill table both name a grade, and they are edited separately. If
   * they drift, `seed-drills.ts` writes a `band` column derived from one of them while the
   * engine serves content by the other — so pin them together here rather than finding out
   * from a child being handed the wrong year's questions.
   */
  it("gives each pool the same grade its skill is offered at", () => {
    for (const p of pools) {
      const skill = skillForPool(p.poolId);
      expect(skill, `pool ${p.poolId} has no skill`).not.toBeNull();
      expect(skill!.grades, `pool ${p.poolId} says grade ${p.grade}`).toEqual([p.grade]);
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
      /**
       * A sight-word item's spoken form has to SAY the word the child is being asked to find:
       * for a listener that word is the whole question. What it no longer has to be is the bare
       * word and nothing else — that was exactly the defect the blind pass turned up. Eleven
       * items sat beside a homophone ("right" against `write`, "for" against `four`) and spoke
       * only the answer, so a child on read-aloud support heard a sound that fitted two of the
       * four choices. Those now speak a sense phrase around the word. So what is pinned here is
       * that the word is spoken; `pool-validate`'s rule 9 is what checks the sense phrase is
       * there whenever a homophone makes one necessary.
       */
      if (p.poolId.startsWith("sight-words")) {
        expect(i.readAloud, `item ${i.id}`).toBeDefined();
        const spoken = i.readAloud!.toLowerCase();
        const word = i.answer.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        expect(spoken, `item ${i.id} must speak "${i.answer}"`).toMatch(new RegExp(`(^|[^a-z'])${word}([^a-z']|$)`));
      }
    }
  });
});
