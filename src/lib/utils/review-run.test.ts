import { describe, it, expect } from "vitest";
import { REVIEW_RUN, buildReviewRun, reviewDue } from "./review-run";
import { findSkill } from "./skills";
import { MASTERY_MAX } from "./mastery";
import type { PoolItem } from "./deed-engine";
import type { Question } from "./drill-generators";
import type { Task } from "@/lib/tasks/types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1000 * DAY;
const row = (skillId: string, level: number, daysAgo: number | null) => ({
  skillId, level, lastPracticedAt: daysAgo === null ? null : NOW - daysAgo * DAY,
});
const item = (skillId: string, n: number): PoolItem => ({
  id: `${skillId}-${n}`, skillId, prompt: `${skillId} prompt ${n}`, answer: "yes", distractors: ["a", "b", "c"], readAloud: null, level: 1,
});
const poolFor = (...skillIds: string[]): PoolItem[] => skillIds.flatMap((s) => [1, 2, 3, 4].map((n) => item(s, n)));
const miss = (skillId: string, id: string): Question => ({ id, skillId, prompt: `miss ${id}`, choices: ["1", "2", "3", "4"], answer: "1" });
const areaOf = (id: string) => findSkill(id)!.area;
/** A hero taught every strand at the top grade: nothing is above them, so only the other rules filter. */
const TOP = { math: "12", reading: "12", language: "12", science: "12" } as const;
const ANY = { grades: TOP };
const run = (over: Partial<Parameters<typeof buildReviewRun>[0]> = {}) =>
  buildReviewRun({ mastery: [], recentMisses: [], poolItems: [], grades: TOP, now: NOW, seed: 7, ...over });

describe("REVIEW_RUN", () => {
  it("is three tasks", () => expect(REVIEW_RUN.tasks).toBe(3));
});

describe("nothing learned yet", () => {
  it("builds nothing and is never due", () => {
    expect(run().questions).toHaveLength(0);
    expect(run().skillIds).toEqual([]);
    expect(reviewDue([], NOW, ANY)).toBe(false);
  });
  it("ignores level-0 rows for the fill, and they are never due", () => {
    const mastery = [row("add-10", 0, 50), row("sub-10", 0, 50)];
    expect(run({ mastery }).questions).toHaveLength(0);
    expect(reviewDue(mastery, NOW, ANY)).toBe(false);
  });
});

describe("reviewDue", () => {
  it("is true once a learned skill is past its interval", () => {
    expect(reviewDue([row("add-10", 1, 3)], NOW, ANY)).toBe(true);
    expect(reviewDue([row("add-10", 1, 1)], NOW, ANY)).toBe(false);
  });
  it("ignores a logic skill: it is played on locks, so a review run could draw nothing for it", () => {
    expect(reviewDue([row("logic-g23", 2, 300)], NOW, ANY)).toBe(false);
    expect(reviewDue([row("logic-g23", 2, 300), row("science-g23", 1, 3)], NOW, ANY)).toBe(true);
  });
  it("reviews only the science when overdue logic and science rows are mixed", () => {
    const mastery = [row("logic-g23", 2, 300), row("logic-k1", 1, null), row("science-g23", 1, 9)];
    const r = run({ mastery, poolItems: poolFor("science-g23") });
    expect(r.skillIds).toEqual(["science-g23"]);
    expect(r.questions.length).toBeGreaterThan(0);
    expect(r.questions.every((q) => q.skillId === "science-g23")).toBe(true);
  });
  it("ignores a trail skill: a review run is choice only, and read-g6 has no choice questions", () => {
    expect(reviewDue([row("read-g6", 2, 300), row("read-g9", 1, null)], NOW, ANY)).toBe(false);
    expect(reviewDue([row("read-g6", 2, 300), row("science-g23", 1, 3)], NOW, ANY)).toBe(true);
    expect(run({ mastery: [row("read-g6", 2, 300), row("read-g9", 2, 300)], poolItems: poolFor("read-g6", "read-g9") }))
      .toEqual({ skillIds: [], questions: [] });
  });
  it("is never offered a trail skill as review, even with a miss stored for it", () => {
    const r = run({ mastery: [row("read-g6", 2, 300), row("science-g23", 1, 9)], recentMisses: [miss("read-g6", "t1")], poolItems: poolFor("science-g23") });
    expect(r.skillIds).toEqual(["science-g23"]);
    expect(r.questions.map((q) => q.id)).not.toContain("t1");
  });
  it("builds nothing for a hero with only logic rows", () => {
    expect(run({ mastery: [row("logic-g23", 2, 300)] })).toEqual({ skillIds: [], questions: [] });
  });
  it("ignores unknown skill ids", () => {
    expect(reviewDue([row("not-a-skill", 1, 300)], NOW, ANY)).toBe(false);
  });
});

describe("never above the hero's own grade in a strand (RH-c)", () => {
  // With trails on, K walks read-g1's trails and grade 2 read-g3's (`runCandidates`, R-H21): those
  // rows are mastery the hero earned walking, never as multiple choice, and K's are not narrated.
  const K = { math: "K", reading: "K", language: "K", science: "K" } as const;
  const G2 = { math: "2", reading: "2", language: "2", science: "2" } as const;
  const G3 = { math: "3", reading: "3", language: "3", science: "3" } as const;
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1);

  it("a K hero's read-g1 mastery from trails is never reviewed, and never lights the riddle stones", () => {
    const mastery = [row("read-g1", 2, 300)];
    expect(reviewDue(mastery, NOW, { grades: K })).toBe(false);
    expect(run({ mastery, grades: K, poolItems: poolFor("read-g1") })).toEqual({ skillIds: [], questions: [] });
    // Beside the hero's own sight words, only those come back.
    const both = [row("read-g1", 2, 300), row("sight-k1", 1, 9)];
    for (const seed of seeds) {
      expect(run({ mastery: both, grades: K, seed, poolItems: poolFor("read-g1", "sight-k1") }).skillIds).toEqual(["sight-k1"]);
    }
  });

  it("never offers a rune skill: spell-g1 has no choice questions, so its mastery lights no stone and builds no run (R-I7)", () => {
    const mastery = [row("spell-g1", 2, 300), row("lang-g1", 1, 9)];
    const G1 = { math: "1", reading: "1", language: "1", science: "1" } as const;
    // Alone, it is never due, as a hero at its own grade and as a focus pick.
    for (const scope of [{ grades: G1 }, { grades: G1, focusSkillIds: ["spell-g1"] }, ANY, { grades: TOP, focusSkillIds: ["spell-g1"] }]) {
      expect(reviewDue([row("spell-g1", 2, 300)], NOW, scope)).toBe(false);
    }
    // Beside a reviewable skill, only that one comes back, whether or not it is also a miss or a focus.
    const r = run({ mastery, grades: G1, focusSkillIds: ["spell-g1"], recentMisses: [miss("spell-g1", "rm1")], poolItems: poolFor("lang-g1", "spell-g1") });
    expect(r.skillIds).toEqual(["lang-g1"]);
    expect(r.questions.map((q) => q.id)).not.toContain("rm1");
    expect(r.questions.every((q) => q.skillId === "lang-g1")).toBe(true);
    // A hero with only that row has nothing to review.
    expect(run({ mastery: [row("spell-g1", 2, 300)], grades: G1, poolItems: poolFor("spell-g1") })).toEqual({ skillIds: [], questions: [] });
  });

  it("a stored read-g1 miss does not bring it back for a K hero either", () => {
    const r = run({ mastery: [row("read-g1", 2, 300), row("sight-k1", 1, 9)], grades: K, recentMisses: [miss("read-g1", "r1")], poolItems: poolFor("read-g1", "sight-k1") });
    expect(r.questions.map((q) => q.id)).not.toContain("r1");
    expect(r.skillIds).toEqual(["sight-k1"]);
  });

  it("a grade-2 hero's read-g3 mastery from trails is not reviewed", () => {
    expect(reviewDue([row("read-g3", 2, 300)], NOW, { grades: G2 })).toBe(false);
    expect(run({ mastery: [row("read-g3", 2, 300)], grades: G2, poolItems: poolFor("read-g3") }).skillIds).toEqual([]);
  });

  it("a K hero whose grown-up picked read-g1 as a focus still reviews it, and the stones glow for it", () => {
    const mastery = [row("read-g1", 2, 300)];
    expect(reviewDue(mastery, NOW, { grades: K, focusSkillIds: ["read-g1"] })).toBe(true);
    expect(run({ mastery, grades: K, focusSkillIds: ["read-g1"], poolItems: poolFor("read-g1") }).skillIds).toEqual(["read-g1"]);
  });

  it("a grade-3 hero's read-g3 review is unchanged", () => {
    const mastery = [row("read-g3", 2, 300)];
    expect(reviewDue(mastery, NOW, { grades: G3 })).toBe(true);
    expect(run({ mastery, grades: G3, poolItems: poolFor("read-g3") })).toEqual(run({ mastery, poolItems: poolFor("read-g3") }));
    expect(run({ mastery, grades: G3, poolItems: poolFor("read-g3") }).skillIds).toEqual(["read-g3"]);
  });

  it("math, science and language at or below the hero's grade review as before", () => {
    const k = [row("add-10", 1, 9), row("science-k1", 1, 8), row("lang-gk", 1, 7)];
    const g3 = [row("mul-facts", 1, 9), row("science-g23", 1, 8), row("lang-g3", 1, 7), row("add-10", 2, 6)];
    for (const seed of seeds) {
      expect(run({ mastery: k, grades: K, seed, poolItems: poolFor("science-k1", "lang-gk") }))
        .toEqual(run({ mastery: k, seed, poolItems: poolFor("science-k1", "lang-gk") }));
      expect(run({ mastery: g3, grades: G3, seed, poolItems: poolFor("science-g23", "lang-g3") }))
        .toEqual(run({ mastery: g3, seed, poolItems: poolFor("science-g23", "lang-g3") }));
    }
    expect(reviewDue(k, NOW, { grades: K })).toBe(true);
    expect(reviewDue(g3, NOW, { grades: G3 })).toBe(true);
  });

  it("judges each strand on its own grade: a hero taught reading a grade up reviews read-g1", () => {
    const mastery = [row("read-g1", 2, 300)];
    expect(reviewDue(mastery, NOW, { grades: { ...K, reading: "1" } })).toBe(true);
    expect(run({ mastery, grades: { ...K, reading: "1" }, poolItems: poolFor("read-g1") }).skillIds).toEqual(["read-g1"]);
  });
});

describe("order of picks", () => {
  it("takes misses first (at most two, deduped), then overdue", () => {
    const mastery = [
      row("add-10", 1, 1), row("sub-10", 2, 1), row("count-seq", 1, 0), // count-seq fresh
      row("sight-k1", 1, 0), row("spell-g23", 1, 9), // spell-g23 overdue
    ];
    const recentMisses = [miss("add-10", "m1"), miss("add-10", "m1"), miss("sub-10", "m2"), miss("sight-k1", "m3")];
    const r = run({ mastery, recentMisses, poolItems: poolFor("sight-k1", "spell-g23") });
    expect(r.questions).toHaveLength(3);
    const ids = r.questions.map((q) => q.id);
    expect(ids).toContain("m1");
    expect(ids).toContain("m2");
    expect(ids).not.toContain("m3");
    expect([...r.skillIds].sort()).toEqual(["add-10", "spell-g23", "sub-10"]);
  });

  it("fills with the least recently practised level>=1 skills, null oldest, never one skill twice", () => {
    const mastery = [row("add-10", 1, 0), row("sub-10", 1, 0.5), row("count-seq", 1, null), row("compare-num", 1, 1.5), row("sight-k1", 0, 90)];
    const r = run({ mastery });
    expect(new Set(r.skillIds).size).toBe(3);
    expect(r.skillIds).not.toContain("sight-k1");
    expect(r.skillIds).not.toContain("add-10");
    expect(r.skillIds).toContain("count-seq");
    expect(r.skillIds).toContain("compare-num");
  });

  it("returns fewer tasks when fewer skills are learned", () => {
    const r = run({ mastery: [row("add-10", 1, 0)] });
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0].skillId).toBe("add-10");
  });
});

describe("recent misses", () => {
  it("only counts misses for known skills the child has a mastery row for", () => {
    const mastery = [row("add-10", 1, 0)];
    const r = run({ mastery, recentMisses: [miss("nope", "x1"), miss("sub-10", "x2")] });
    expect(r.questions.map((q) => q.id)).not.toContain("x1");
    expect(r.questions.map((q) => q.id)).not.toContain("x2");
    expect(r.questions).toHaveLength(1);
  });
  it("never re-asks a miss of another kind: a review run is choice only (R-C6)", () => {
    const other = { kind: "measure", id: "mm", skillId: "add-10", prompt: "Cut it", answer: "3/4" } as unknown as Task;
    const mastery = [row("add-10", 1, 0), row("sub-10", 1, 0)];
    const r = run({ mastery, recentMisses: [other, miss("sub-10", "m2")] });
    expect(r.questions.map((q) => q.id)).not.toContain("mm");
    expect(r.questions.map((q) => q.id)).toContain("m2");
  });
  it("a miss on a level-0 skill still comes back", () => {
    const r = run({ mastery: [row("add-10", 0, 0)], recentMisses: [miss("add-10", "m1")] });
    expect(r.questions.map((q) => q.id)).toEqual(["m1"]);
  });
});

describe("interleaving", () => {
  it("is not all one area when due skills span two", () => {
    // Three math skills are the most overdue; a reading skill is merely learned.
    const mastery = [row("add-10", 1, 20), row("sub-10", 1, 19), row("count-seq", 1, 18), row("sight-k1", 1, 1)];
    for (let seed = 1; seed <= 12; seed++) {
      const r = run({ mastery, poolItems: poolFor("sight-k1"), seed });
      expect(r.questions).toHaveLength(3);
      expect(new Set(r.skillIds.map(areaOf)).size).toBeGreaterThan(1);
    }
  });
  it("swaps out the last non-miss pick, keeping misses", () => {
    const mastery = [row("add-10", 1, 20), row("sub-10", 1, 19), row("count-seq", 1, 18), row("compare-num", 1, 17), row("sight-k1", 1, 1)];
    const r = run({ mastery, recentMisses: [miss("add-10", "m1")], poolItems: poolFor("sight-k1") });
    expect(r.questions.map((q) => q.id)).toContain("m1");
    expect(r.skillIds).toContain("sight-k1");
    expect(r.skillIds).toContain("add-10");
    expect(new Set(r.skillIds.map(areaOf)).size).toBeGreaterThan(1);
  });
  it("stays one area when only one area is learned", () => {
    const mastery = [row("add-10", 1, 20), row("sub-10", 1, 19), row("count-seq", 1, 18), row("compare-num", 1, 17)];
    const r = run({ mastery });
    expect(r.questions).toHaveLength(3);
    expect(new Set(r.skillIds.map(areaOf))).toEqual(new Set(["math"]));
  });
});

describe("unknown skills and empty pools", () => {
  it("ignores mastery rows for unknown skill ids", () => {
    const r = run({ mastery: [row("gone-skill", 3, 400), row("add-10", 1, 5)] });
    expect(r.skillIds).toEqual(["add-10"]);
  });
  it("skips a pool skill with no items and uses the next candidate", () => {
    const mastery = [row("sight-k1", 1, 30), row("add-10", 1, 2), row("sub-10", 1, 1)];
    const r = run({ mastery, poolItems: [] });
    expect([...r.skillIds].sort()).toEqual(["add-10", "sub-10"]);
    expect(r.questions).toHaveLength(2);
  });
});

describe("determinism", () => {
  const mastery = [row("add-10", 1, 20), row("sub-10", 2, 19), row("sight-k1", 1, 18), row("spell-g23", 1, 2), row("count-seq", 3, 1)];
  const poolItems = poolFor("sight-k1", "spell-g23");
  it("gives the same ids for the same seed", () => {
    const a = run({ mastery, poolItems, seed: 99 });
    const b = run({ mastery, poolItems, seed: 99 });
    expect(a.questions.map((q) => q.id)).toEqual(b.questions.map((q) => q.id));
    expect(a.skillIds).toEqual(b.skillIds);
  });
  it("keeps skillIds aligned with questions", () => {
    const r = run({ mastery, poolItems, seed: 5 });
    expect(r.skillIds).toEqual(r.questions.map((q) => q.skillId));
  });
});

describe("focus skills", () => {
  // Five learned skills, none overdue, the focus one practised most recently: only focus can lift it.
  const mastery = [
    row("add-10", 1, 1.5), row("sub-10", 1, 1.4), row("count-seq", 1, 1.3), row("sight-k1", 1, 1.2), row("spell-g23", 1, 0),
  ];
  const poolItems = poolFor("sight-k1", "spell-g23");

  it("a learned focus skill is preferred over least-recently-practised ones", () => {
    expect(run({ mastery, poolItems }).skillIds).not.toContain("spell-g23");
    for (let seed = 1; seed <= 20; seed++) {
      expect(run({ mastery, poolItems, seed, focusSkillIds: ["spell-g23"] }).skillIds).toContain("spell-g23");
    }
  });

  it("is still behind misses and overdue skills", () => {
    const m = [...mastery, row("mul-facts", 2, 9)]; // overdue
    const r = run({ mastery: m, poolItems, recentMisses: [miss("add-10", "m1")], focusSkillIds: ["spell-g23", "sight-k1"] });
    expect(r.questions).toHaveLength(3);
    expect(r.questions.map((q) => q.id)).toContain("m1");
    expect(r.skillIds).toContain("mul-facts");
    // misses (1) and overdue (1) leave one slot, which one focus skill takes.
    expect(r.skillIds.filter((id) => id === "spell-g23" || id === "sight-k1")).toHaveLength(1);
  });

  it("never picks an unlearned (level 0) focus skill", () => {
    const m = [...mastery, row("mul-facts", 0, null)];
    for (let seed = 1; seed <= 20; seed++) {
      expect(run({ mastery: m, poolItems, seed, focusSkillIds: ["mul-facts"] }).skillIds).not.toContain("mul-facts");
    }
  });

  it("an empty focus list changes nothing", () => {
    expect(run({ mastery, poolItems, focusSkillIds: [] })).toEqual(run({ mastery, poolItems }));
  });
});

describe("the learning profile", () => {
  const mastery = [row("add-10", 1, 20), row("sub-10", 2, 19), row("sight-k1", 1, 18), row("spell-g23", 1, 2)];
  const poolItems = poolFor("sight-k1", "spell-g23");
  const profile = { fewerChoices: false, predictableRoutine: false, untimed: false, readAloud: false };

  it("with fewer choices, every task offers its answer and exactly one other, misses included", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = run({ mastery, poolItems, seed, recentMisses: [miss("add-10", "m1")], profile: { ...profile, fewerChoices: true } });
      expect(r.questions).toHaveLength(3);
      for (const q of r.questions) {
        expect(q.choices).toHaveLength(2);
        expect(q.choices).toContain(q.answer);
      }
    }
  });

  it("asks the same tasks either way: only the options change", () => {
    const plain = run({ mastery, poolItems, seed: 4 });
    const fewer = run({ mastery, poolItems, seed: 4, profile: { ...profile, fewerChoices: true } });
    expect(fewer.questions.map((q) => q.id)).toEqual(plain.questions.map((q) => q.id));
    expect(fewer.skillIds).toEqual(plain.skillIds);
  });

  it("draws a level past the top of the ladder at the top rung", () => {
    const items = [1, 2, 3, 4, 5, 6].flatMap((n) => [
      { ...item("sight-k1", n), id: `lo-${n}`, level: 1 }, { ...item("sight-k1", n), id: `hi-${n}`, level: MASTERY_MAX },
    ]);
    for (let seed = 1; seed <= 10; seed++) {
      const r = run({ mastery: [row("sight-k1", 9, 20)], poolItems: items, seed });
      expect(r.questions.map((q) => q.id.slice(0, 3))).toEqual(["hi-"]);
    }
  });

  it("a profile with fewer choices off is the same run as no profile", () => {
    expect(run({ mastery, poolItems, seed: 4, profile: { ...profile, predictableRoutine: true } })).toEqual(run({ mastery, poolItems, seed: 4 }));
  });
});
