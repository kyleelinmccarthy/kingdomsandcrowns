import { describe, it, expect } from "vitest";
import { PRACTICE_RUN, buildPracticeRun } from "./practice-run";
import { GRADES, type Grade } from "./grade-levels";
import type { ProfileLike } from "./deed-engine";
import { kindOf } from "@/lib/tasks/registry";
import type { TaskKind } from "@/lib/tasks/types";

const PLAIN: ProfileLike = { fewerChoices: false, predictableRoutine: false, untimed: false, readAloud: false };
const LOCKS = new Set<TaskKind>(["measure", "lock"]);
const input = (over: Partial<Parameters<typeof buildPracticeRun>[0]> = {}) => ({
  grade: "3" as Grade, masteryBySkill: {}, seed: 11, enabledKinds: LOCKS, profile: PLAIN, ...over,
});

/** The logic row each grade reaches: one per band at its lowest grade, others by the easier-first walk. */
const LOGIC_AT: Record<Grade, string> = {
  K: "logic-k1", 1: "logic-k1", 2: "logic-g23", 3: "logic-g23", 4: "logic-g45", 5: "logic-g45",
  6: "logic-g68", 7: "logic-g68", 8: "logic-g68", 9: "logic-g912", 10: "logic-g912", 11: "logic-g912", 12: "logic-g912",
};

describe("PRACTICE_RUN", () => {
  it("is three locks", () => expect(PRACTICE_RUN.tasks).toBe(3));
});

describe("buildPracticeRun", () => {
  it.each(GRADES)("gives a grade %s hero three different locks from their own grade's logic skill", (grade) => {
    const r = buildPracticeRun(input({ grade }));
    expect(r.questions).toHaveLength(3);
    expect(r.skillIds).toEqual([LOGIC_AT[grade]]);
    for (const t of r.questions) {
      expect(kindOf(t)).toBe("lock");
      expect(t.skillId).toBe(LOGIC_AT[grade]);
    }
    expect(new Set(r.questions.map((t) => t.id)).size).toBe(3);
  });

  it("is deterministic by seed", () => {
    const ids = (seed: number) => buildPracticeRun(input({ seed })).questions.map((t) => t.id);
    expect(ids(5)).toEqual(ids(5));
  });

  it("prefers the grown-up's logic focus skill when the hero is within its window", () => {
    // A grade-3 hero: logic-g45 (grade 4) is a step away, so it can be their focus.
    const r = buildPracticeRun(input({ grade: "3", focusSkillIds: ["mul-facts", "logic-g45"] }));
    expect(r.skillIds).toEqual(["logic-g45"]);
    expect(r.questions).toHaveLength(3);
    for (const t of r.questions) expect(t.skillId).toBe("logic-g45");
  });

  it("keeps the hero's own logic skill when the focus is out of reach, in another strand, or not set", () => {
    for (const focusSkillIds of [["logic-g912"], ["mul-facts"], [], undefined]) {
      expect(buildPracticeRun(input({ grade: "3", focusSkillIds })).skillIds, String(focusSkillIds)).toEqual(["logic-g23"]);
    }
  });

  it("with locks off draws nothing, and never throws (a logic skill has no choice questions)", () => {
    for (const grade of GRADES) {
      const r = buildPracticeRun(input({ grade, enabledKinds: new Set<TaskKind>(["measure"]) }));
      expect(r).toEqual({ skillIds: [], questions: [] });
    }
  });
});
