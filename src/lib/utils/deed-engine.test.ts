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
  return { deed: deedReading, band: "g23", masteryBySkill: {}, profile, seed: 1, poolItems: poolItems("sight-g23", 30), recentMisses: [], ...over };
}

describe("chooseSkills", () => {
  it("picks the band's skills for the area, at most one generator and one pool", () => {
    expect(chooseSkills(deedMath, "g23").map((s) => s.id)).toHaveLength(1);
    expect(chooseSkills(deedReading, "g23").map((s) => s.id)).toEqual(["sight-g23"]);
  });
  it("falls back to the nearest band when the area has no skill there", () => {
    expect(chooseSkills(deedLanguage, "k1").map((s) => s.id)).toEqual(["spell-g23"]);
    expect(chooseSkills(deedReading, "g912").map((s) => s.id)).toEqual(["sight-g23"]);
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
