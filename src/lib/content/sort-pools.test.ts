// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fixtureSortPool } from "@/test/sort-pool-fixture";
import { SORT_POOL_RULES as R, validateSortPool, type SortPool } from "./sort-pools";

const clone = (): SortPool => JSON.parse(JSON.stringify(fixtureSortPool())) as SortPool;
const rulesOf = (pool: unknown): string[] => [...new Set(validateSortPool(pool).map((p) => p.rule))];

describe("validateSortPool", () => {
  it("passes the fixture pool", () => {
    expect(validateSortPool(fixtureSortPool())).toEqual([]);
  });

  describe("shape", () => {
    it("refuses a non-object", () => {
      expect(rulesOf(null)).toEqual([R.shape]);
      expect(rulesOf("pool")).toEqual([R.shape]);
      expect(rulesOf([])).toEqual([R.shape]);
    });

    it("refuses extra keys at the pool, set and item level", () => {
      const a = clone() as Record<string, unknown>;
      a.extra = 1;
      expect(rulesOf(a)).toContain(R.shape);
      const b = clone();
      (b.sets[0] as Record<string, unknown>).note = "x";
      expect(rulesOf(b)).toContain(R.shape);
      const c = clone();
      (c.sets[0].items[0] as Record<string, unknown>).hint = "x";
      expect(rulesOf(c)).toContain(R.shape);
    });

    it("refuses a missing field, a wrong type, a bad category index and a level out of range", () => {
      const a = clone() as Record<string, unknown>;
      delete a.skillId;
      expect(rulesOf(a)).toContain(R.shape);
      const b = clone();
      (b.sets[0].items[0] as { label: unknown }).label = 7;
      expect(rulesOf(b)).toContain(R.shape);
      const c = clone();
      (c.sets[0].items[0] as { category: unknown }).category = 2;
      expect(rulesOf(c)).toContain(R.shape);
      const d = clone();
      (d.sets[0].items[0] as { level: unknown }).level = 5;
      expect(rulesOf(d)).toContain(R.shape);
      const e = clone();
      (e.sets[0] as { categories: unknown }).categories = ["One"];
      expect(rulesOf(e)).toContain(R.shape);
    });

    it("allows readAloud as a string, and only as a string", () => {
      const a = clone();
      a.sets[0].items[0].readAloud = "dog";
      expect(validateSortPool(a)).toEqual([]);
      (a.sets[0].items[0] as { readAloud: unknown }).readAloud = 3;
      expect(rulesOf(a)).toContain(R.shape);
    });
  });

  describe("sizes and balance", () => {
    it("wants at least 16 items in every set", () => {
      const p = clone();
      // 7 and 7: balanced, but only 14 items.
      p.sets[0].items = [...p.sets[0].items.filter((i) => i.category === 0).slice(0, 7), ...p.sets[0].items.filter((i) => i.category === 1).slice(0, 7)];
      expect(rulesOf(p)).toContain(R.setSize);
    });

    it("wants each category 40-60% of its set", () => {
      const p = clone();
      p.sets[0].items[12].category = 0; // 13 / 11 of 24: fine
      expect(rulesOf(p)).not.toContain(R.balance);
      const q = clone();
      q.sets[1].items = q.sets[1].items.map((i, n) => ({ ...i, category: n < 14 ? 0 : 1 }) as typeof i); // 14 / 6 of 20: 70 / 30
      expect(rulesOf(q)).toContain(R.balance);
    });

    it("wants at least 40 items across the pool", () => {
      const p = clone();
      p.sets = [p.sets[0]]; // 24 items
      expect(rulesOf(p)).toContain(R.poolSize);
    });

    it("wants every level 0-4 somewhere in the pool", () => {
      const p = clone();
      for (const s of p.sets) for (const i of s.items) if (i.level === 4) i.level = 3;
      const problems = validateSortPool(p).filter((x) => x.rule === R.levelSpread);
      expect(problems).toHaveLength(1);
      expect(problems[0].detail).toContain("4");
    });

    it("reports a pool with no sets as too small, not a crash", () => {
      const p = clone();
      p.sets = [];
      expect(rulesOf(p)).toContain(R.poolSize);
    });
  });

  describe("ids and labels", () => {
    it("wants item ids unique across the whole pool", () => {
      const p = clone();
      p.sets[1].items[0].id = p.sets[0].items[0].id;
      expect(rulesOf(p)).toContain(R.duplicateId);
    });

    it("wants set ids unique", () => {
      const p = clone();
      p.sets[1].id = p.sets[0].id;
      expect(rulesOf(p)).toContain(R.duplicateId);
    });

    it("wants ids made of letters, digits, dots, dashes and underscores (they sit inside a task id)", () => {
      const p = clone();
      p.sets[0].items[0].id = "has:colon";
      expect(rulesOf(p)).toContain(R.idFormat);
    });

    it("wants labels unique within a set, trimmed and case-insensitive", () => {
      const p = clone();
      p.sets[0].items[1].label = "  DOG ";
      expect(rulesOf(p)).toContain(R.duplicateLabel);
    });

    it("lets two sets share a label", () => {
      const p = clone();
      p.sets[1].items[0].label = p.sets[0].items[0].label;
      expect(rulesOf(p)).not.toContain(R.duplicateLabel);
    });

    it("wants labels of at most 4 words and 32 characters, and not empty", () => {
      const a = clone();
      a.sets[0].items[0].label = "a very old oak tree";
      expect(rulesOf(a)).toContain(R.labelLength);
      const b = clone();
      b.sets[0].items[0].label = "abcdefghijklmnopqrstuvwxyzabcdefg";
      expect(rulesOf(b)).toContain(R.labelLength);
      const c = clone();
      c.sets[0].items[0].label = "   ";
      expect(rulesOf(c)).toContain(R.labelLength);
      const ok = clone();
      ok.sets[0].items[0].label = "a very old oak"; // 4 words
      expect(validateSortPool(ok)).toEqual([]);
    });

    it("keeps a category word out of a label, whole word, case-insensitive", () => {
      const a = clone();
      a.sets[0].items[0].label = "Living thing";
      expect(rulesOf(a)).toContain(R.categoryWord);
      const b = clone();
      b.sets[0].items[0].label = "non-living rock"; // a hyphen is a word boundary, so "living" is a whole word here
      expect(rulesOf(b)).toContain(R.categoryWord);
      const c = clone();
      c.sets[0].items[0].label = "livingston"; // not a whole word
      expect(rulesOf(c)).not.toContain(R.categoryWord);
    });

    it("keeps a category word out of an item id too (the id is sent with the lock)", () => {
      const p = clone();
      p.sets[0].items[0].id = "living-dog";
      expect(rulesOf(p)).toContain(R.categoryWord);
    });

    it("refuses ids numbered bin by bin, which would give the answer away in the browser", () => {
      const p = clone();
      p.sets[0].items.forEach((item, n) => (item.id = `liv-${n + 1}`)); // 1-12 living, 13-24 non-living
      const found = validateSortPool(p).filter((x) => x.rule === R.idTellsCategory);
      expect(found).toHaveLength(1);
      expect(found[0].detail).toContain("living");
      // Ids named after the item are fine: the fixture passes.
      expect(rulesOf(fixtureSortPool())).toEqual([]);
    });

    it("checks each set against its own categories only", () => {
      const p = clone();
      p.sets[1].items[0].label = "living water"; // "living" is not a category of the state set
      expect(rulesOf(p)).not.toContain(R.categoryWord);
    });

    it("wants two different, short categories", () => {
      const a = clone();
      a.sets[0].categories = ["Living", " living "];
      expect(rulesOf(a)).toContain(R.categories);
      const b = clone();
      b.sets[0].categories = ["Living", "A very long category name indeed"];
      expect(rulesOf(b)).toContain(R.categories);
    });
  });

  describe("the credited skill", () => {
    it("wants a skill that exists", () => {
      const p = clone();
      p.skillId = "no-such-skill";
      expect(rulesOf(p)).toContain(R.skill);
    });

    it("wants a science or language skill, not math or logic", () => {
      const a = clone();
      a.skillId = "add-10";
      expect(rulesOf(a)).toContain(R.skill);
      const b = clone();
      b.skillId = "logic-k1";
      expect(rulesOf(b)).toContain(R.skill);
    });

    it("accepts a vocabulary skill (it lives in language) at its own grade", () => {
      const p = clone();
      p.skillId = "vocab-g45";
      p.grade = "5";
      expect(validateSortPool(p)).toEqual([]);
    });

    it("wants the pool's grade to be the skill's grade", () => {
      const p = clone();
      p.grade = "5";
      expect(rulesOf(p)).toContain(R.grade);
      const q = clone();
      (q as { grade: unknown }).grade = "13";
      expect(rulesOf(q)).toContain(R.shape);
    });
  });

  describe("the pool id", () => {
    it("starts with sort-, which keeps it clear of every drill pool id", () => {
      const p = clone();
      p.poolId = "science-g23"; // a drill pool's id: its sheet would collide in src/content/review
      expect(rulesOf(p)).toContain(R.poolId);
    });
  });

  it("explains each problem with the item it is about", () => {
    const p = clone();
    p.sets[0].items[0].label = "Living thing";
    const found = validateSortPool(p).find((x) => x.rule === R.categoryWord)!;
    expect(found.itemId).toBe(p.sets[0].items[0].id);
    expect(found.detail.length).toBeGreaterThan(10);
  });
});
