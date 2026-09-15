import { describe, it, expect } from "vitest";
import { buildDeedRun, chooseSkills, gradeAnswer, toClientQuestion, type BuildRunInput, type PoolItem } from "./deed-engine";
import { findDeed } from "./deeds";
import type { Question } from "./drill-generators";

const deedMath = findDeed("well-stones")!;      // math
const deedReading = findDeed("well-signs")!;    // reading
const deedLanguage = findDeed("mill-ledger")!;  // language

function poolItems(skillId: string, n: number, level = 2): PoolItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${skillId}-item-${i}`, skillId, prompt: `Prompt ${i}`, answer: `A${i}`, distractors: [`B${i}`, `C${i}`, `D${i}`], readAloud: null, level,
  }));
}

const profile = { fewerChoices: false, predictableRoutine: false, untimed: false, readAloud: false };

function input(over: Partial<BuildRunInput> = {}): BuildRunInput {
  return { deed: deedReading, grade: "3", masteryBySkill: {}, profile, seed: 1, poolItems: poolItems("sight-g23", 30), recentMisses: [], ...over };
}

describe("chooseSkills", () => {
  it("picks the grade's skills for the area, at most one generator and one pool", () => {
    expect(chooseSkills(deedMath, "3").map((s) => s.id)).toHaveLength(1);
    expect(chooseSkills(deedReading, "3").map((s) => s.id)).toEqual(["sight-g23"]);
  });
  it("falls back to the nearest grade when the area has no skill there", () => {
    expect(chooseSkills(deedLanguage, "K").map((s) => s.id)).toEqual(["spell-g23"]);
    expect(chooseSkills(deedReading, "9").map((s) => s.id)).toEqual(["sight-g23"]);
  });
});

describe("buildDeedRun", () => {
  it("returns the deed's question count with four distinct choices each", () => {
    const run = buildDeedRun(input());
    expect(run.questions).toHaveLength(8);
    for (const q of run.questions) { expect(q.choices).toHaveLength(4); expect(q.choices).toContain(q.answer); }
    expect(run.skillIds).toEqual(["sight-g23"]);
  });
  it("is deterministic for a seed", () => {
    expect(buildDeedRun(input({ seed: 9 }))).toEqual(buildDeedRun(input({ seed: 9 })));
  });
  it("never repeats a pool item and draws near the mastery level, widening when needed", () => {
    const items = [...poolItems("sight-g23", 5, 0), ...poolItems("sight-g23", 3, 4).map((i) => ({ ...i, id: `${i.id}-hi` }))];
    const run = buildDeedRun(input({ poolItems: items, masteryBySkill: { "sight-g23": 4 } }));
    expect(new Set(run.questions.map((q) => q.id)).size).toBe(run.questions.length);
    expect(run.questions.length).toBe(8);
  });
  it("mixes in at most two recent misses for the chosen skills", () => {
    const misses: Question[] = [0, 1, 2].map((i) => ({ id: `miss-${i}`, skillId: "sight-g23", prompt: `Miss ${i}`, choices: ["x", "y", "z", "w"], answer: "x" }));
    const run = buildDeedRun(input({ recentMisses: misses }));
    expect(run.questions.filter((q) => q.id.startsWith("miss-"))).toHaveLength(2);
    expect(run.questions).toHaveLength(8);
  });
  it("dedupes recent misses with the same id into a single review question", () => {
    const misses: Question[] = [
      { id: "miss-dup", skillId: "sight-g23", prompt: "Miss", choices: ["x", "y", "z", "w"], answer: "x" },
      { id: "miss-dup", skillId: "sight-g23", prompt: "Miss", choices: ["x", "y", "z", "w"], answer: "x" },
    ];
    const run = buildDeedRun(input({ recentMisses: misses }));
    expect(run.questions.filter((q) => q.id === "miss-dup")).toHaveLength(1);
    expect(run.questions).toHaveLength(8);
    expect(new Set(run.questions.map((q) => q.id)).size).toBe(8);
  });
  it("ignores misses from other skills", () => {
    const misses: Question[] = [{ id: "miss-other", skillId: "mul-facts", prompt: "6 × 7", choices: ["42", "41", "43", "40"], answer: "42" }];
    expect(buildDeedRun(input({ recentMisses: misses })).questions.some((q) => q.id === "miss-other")).toBe(false);
  });
  it("trims to two choices that include the answer under fewerChoices", () => {
    const run = buildDeedRun(input({ profile: { ...profile, fewerChoices: true } }));
    for (const q of run.questions) { expect(q.choices).toHaveLength(2); expect(q.choices).toContain(q.answer); }
  });
  it("groups by skill with review last under predictableRoutine", () => {
    const misses: Question[] = [{ id: "miss-0", skillId: "add-20", prompt: "1 + 1", choices: ["2", "3", "4", "5"], answer: "2" }];
    const run = buildDeedRun(input({ deed: deedMath, poolItems: [], recentMisses: misses, profile: { ...profile, predictableRoutine: true } }));
    expect(run.questions[run.questions.length - 1].id).toBe("miss-0");
  });
  it("uses generators for math deeds", () => {
    const run = buildDeedRun(input({ deed: deedMath, poolItems: [] }));
    expect(run.questions).toHaveLength(8);
    expect(run.questions.every((q) => q.skillId === run.skillIds[0])).toBe(true);
  });
  it("returns no questions when no skill or items exist", () => {
    expect(buildDeedRun(input({ poolItems: [] })).questions).toHaveLength(0);
  });
  it("never re-draws a review question from a generator skill", () => {
    const misses: Question[] = [
      { id: "add-10:1+1", skillId: "add-10", prompt: "What is 1 + 1?", choices: ["2", "3", "4", "5"], answer: "2" },
      { id: "add-10:2+2", skillId: "add-10", prompt: "What is 2 + 2?", choices: ["4", "3", "5", "6"], answer: "4" },
    ];
    for (let seed = 1; seed <= 50; seed++) {
      const run = buildDeedRun(input({ deed: deedMath, grade: "K", poolItems: [], masteryBySkill: {}, recentMisses: misses, seed }));
      const ids = run.questions.map((q) => q.id);
      expect(run.questions).toHaveLength(8);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.filter((id) => id === "add-10:1+1")).toHaveLength(1);
      expect(ids.filter((id) => id === "add-10:2+2")).toHaveLength(1);
    }
  });
});

describe("grading and client shape", () => {
  it("grades by exact match after trimming", () => {
    const q: Question = { id: "q", skillId: "s", prompt: "p", choices: ["a", "b", "c", "d"], answer: "b" };
    expect(gradeAnswer(q, " b ")).toBe(true);
    expect(gradeAnswer(q, "B")).toBe(false);
  });
  it("strips the answer for the client", () => {
    const q: Question = { id: "q", skillId: "s", prompt: "p", choices: ["a", "b", "c", "d"], answer: "b", readAloud: "pee" };
    expect(toClientQuestion(q)).toEqual({ id: "q", skillId: "s", prompt: "p", choices: ["a", "b", "c", "d"], readAloud: "pee" });
  });
});

const mathDeed = findDeed("well-stones")!;   // area: "math"
const readingDeed = findDeed("well-signs")!; // area: "reading"

describe("chooseSkills by grade", () => {
  it("gives a grade-3 hero the skills their grade's content is authored for", () => {
    const ids = chooseSkills(mathDeed, "3").map((s) => s.id);
    expect(ids).toContain("add-20");
  });

  it("reaches multiplication when a grown-up moves a grade-3 hero's math up a year", () => {
    // The whole point of the setting: this is unreachable for grade 3 today.
    const ids = chooseSkills(mathDeed, "4").map((s) => s.id);
    expect(ids).toContain("mul-facts");
  });

  it("walks to easier grades, never harder, when a grade has nothing", () => {
    // Reading is authored no higher than grade 3 right now, so a grade-6 hero falls back
    // rather than being handed nothing. Plan 3 removes the need for this.
    const ids = chooseSkills(readingDeed, "6").map((s) => s.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toContain("sight-g23");
  });

  it("returns nothing rather than throwing when an area has no content at all", () => {
    expect(() => chooseSkills(mathDeed, "K")).not.toThrow();
  });
});
