import { describe, it, expect } from "vitest";
import { PRACTICE_RUN, lockLevel, lockRun, practiceSkill } from "./practice-run";
import { GRADES, type Grade } from "./grade-levels";
import type { ProfileLike } from "./deed-engine";
import { MASTERY_MAX } from "./mastery";
import type { Skill } from "./skills";
import { kindOf } from "@/lib/tasks/registry";
import type { TaskKind } from "@/lib/tasks/types";

const PLAIN: ProfileLike = { fewerChoices: false, predictableRoutine: false, untimed: false, readAloud: false };
const LOCKS = new Set<TaskKind>(["measure", "lock"]);

/**
 * Puzzle practice's draw, as `startPracticeRun` makes it through `startLockRun`: `practiceSkill`
 * picks the skill, `lockLevel` the rung, and `lockRun` draws `PRACTICE_RUN.tasks` locks of it.
 */
function practice(grade: Grade, over: { focusSkillIds?: readonly string[]; mastery?: number; seed?: number; enabledKinds?: ReadonlySet<TaskKind> } = {}) {
  const skill = practiceSkill(grade, over.focusSkillIds ?? []) as Skill;
  const level = lockLevel(over.mastery ?? 0, 0);
  return lockRun({ skill, level, count: PRACTICE_RUN.tasks, seed: over.seed ?? 11, enabledKinds: over.enabledKinds ?? LOCKS, profile: PLAIN });
}

/** The logic row each grade reaches: one per band at its lowest grade, others by the easier-first walk. */
const LOGIC_AT: Record<Grade, string> = {
  K: "logic-k1", 1: "logic-k1", 2: "logic-g23", 3: "logic-g23", 4: "logic-g45", 5: "logic-g45",
  6: "logic-g68", 7: "logic-g68", 8: "logic-g68", 9: "logic-g912", 10: "logic-g912", 11: "logic-g912", 12: "logic-g912",
};

describe("PRACTICE_RUN", () => {
  it("is three locks", () => expect(PRACTICE_RUN.tasks).toBe(3));
});

describe("Puzzle practice's draw (practiceSkill, lockLevel, lockRun)", () => {
  it.each(GRADES)("gives a grade %s hero three different locks from their own grade's logic skill", (grade) => {
    expect(practiceSkill(grade, [])?.id).toBe(LOGIC_AT[grade]);
    const r = practice(grade);
    expect(r.questions).toHaveLength(3);
    expect(r.skillIds).toEqual([LOGIC_AT[grade]]);
    for (const t of r.questions) {
      expect(kindOf(t)).toBe("lock");
      expect(t.skillId).toBe(LOGIC_AT[grade]);
    }
    expect(new Set(r.questions.map((t) => t.id)).size).toBe(3);
  });

  it("is deterministic by seed", () => {
    const ids = (seed: number) => practice("3", { seed }).questions.map((t) => t.id);
    expect(ids(5)).toEqual(ids(5));
  });

  it("prefers the grown-up's logic focus skill when the hero is within its window", () => {
    // A grade-3 hero: logic-g45 (grade 4) is a step away, so it can be their focus.
    expect(practiceSkill("3", ["mul-facts", "logic-g45"])?.id).toBe("logic-g45");
    const r = practice("3", { focusSkillIds: ["mul-facts", "logic-g45"] });
    expect(r.skillIds).toEqual(["logic-g45"]);
    expect(r.questions).toHaveLength(3);
    for (const t of r.questions) expect(t.skillId).toBe("logic-g45");
  });

  it("keeps the hero's own logic skill when the focus is out of reach, in another strand, or not set", () => {
    for (const focusSkillIds of [["logic-g912"], ["mul-facts"], []]) {
      expect(practiceSkill("3", focusSkillIds)?.id, String(focusSkillIds)).toBe("logic-g23");
    }
  });

  it("draws at the hero's mastery of the skill: a higher rung is a different draw", () => {
    const ids = (mastery: number) => practice("3", { mastery }).questions.map((t) => t.id);
    expect(ids(0)).toEqual(ids(0));
    expect(ids(3)).not.toEqual(ids(0));
    // Mastery past the top is the top.
    expect(ids(MASTERY_MAX + 3)).toEqual(ids(MASTERY_MAX));
  });

  it("with locks off draws nothing, and never throws (a logic skill has no choice questions)", () => {
    for (const grade of GRADES) {
      expect(practice(grade, { enabledKinds: new Set<TaskKind>(["measure"]) })).toEqual({ skillIds: [], questions: [] });
    }
  });
});

describe("lockLevel: the rung every lock run is drawn at", () => {
  it("is the hero's mastery with no boost (Puzzle practice, a chest or vault door), never past the top", () => {
    expect(lockLevel(0, 0)).toBe(0);
    expect(lockLevel(3, 0)).toBe(3);
    expect(lockLevel(MASTERY_MAX, 0)).toBe(MASTERY_MAX);
    expect(lockLevel(MASTERY_MAX + 3, 0)).toBe(MASTERY_MAX);
  });

  it("is one rung above it with a boost of 1 (a Tower floor, PC-G12), never past the top", () => {
    expect(lockLevel(0, 1)).toBe(1);
    expect(lockLevel(3, 1)).toBe(4);
    expect(lockLevel(MASTERY_MAX - 1, 1)).toBe(MASTERY_MAX);
    expect(lockLevel(MASTERY_MAX, 1)).toBe(MASTERY_MAX);
    expect(lockLevel(MASTERY_MAX + 3, 1)).toBe(MASTERY_MAX);
  });
});
