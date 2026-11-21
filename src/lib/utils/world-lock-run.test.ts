import { describe, it, expect } from "vitest";
import { worldLockSkill } from "./world-lock-run";
import { lockRun } from "./practice-run";
import { findSkill, type Skill, type SkillArea } from "./skills";
import type { Grade } from "./grade-levels";
import type { ProfileLike } from "./deed-engine";
import { kindOf } from "@/lib/tasks/registry";
import type { TaskKind } from "@/lib/tasks/types";

const PLAIN: ProfileLike = { fewerChoices: false, predictableRoutine: false, untimed: false, readAloud: false };
const LOCKS_ON = new Set<TaskKind>(["measure", "lock"]);

/** Every strand spelled out (RG-d): the strands a lock must not draw from sit far from the ones it should. */
const grades = (over: Partial<Record<SkillArea, Grade>>): Record<SkillArea, Grade> => ({
  math: "8", reading: "8", language: "8", science: "8", logic: "8", ...over,
});
const picked = (draws: "logic" | "language" | "science", g: Record<SkillArea, Grade>, focus: readonly string[] = []) => {
  const p = worldLockSkill({ draws }, g, focus);
  return p ? { skill: p.skill.id, grade: p.grade } : null;
};

describe("worldLockSkill (RG-o, PC-G4)", () => {
  it("a logic lock draws the hero's own logic skill, as Puzzle practice would", () => {
    expect(picked("logic", grades({ logic: "5" }))).toEqual({ skill: "logic-g45", grade: "5" });
    expect(picked("logic", grades({ logic: "2" }))).toEqual({ skill: "logic-g23", grade: "2" });
  });

  it("follows the grown-up's logic focus pick when the hero is within its window", () => {
    expect(picked("logic", grades({ logic: "5" }), ["mul-facts", "logic-g68"])).toEqual({ skill: "logic-g68", grade: "5" });
    // Out of the window (grade 9 is far from 5): the hero's own skill stands.
    expect(picked("logic", grades({ logic: "5" }), ["logic-g912"])?.skill).toBe("logic-g45");
  });

  it("a kindergarten hero's library chest falls back to logic-k1, never a choice skill", () => {
    expect(picked("language", grades({ language: "K", logic: "K" }))).toEqual({ skill: "logic-k1", grade: "K" });
  });

  it("the library chest reaches a vocabulary sort within the hero's own band, through the catalog", () => {
    expect(picked("language", grades({ language: "4", logic: "4" }))).toEqual({ skill: "vocab-g45", grade: "5" });
    expect(picked("language", grades({ language: "6", logic: "6" }))?.skill).toBe("vocab-g68");
    expect(picked("language", grades({ language: "9", logic: "9" }))?.skill).toBe("vocab-g912");
  });

  it("a language grade with no sort in its band draws the logic lock at the logic grade", () => {
    expect(picked("language", grades({ language: "2", logic: "2" }))).toEqual({ skill: "logic-g23", grade: "2" });
    expect(picked("language", grades({ language: "2", logic: "5" }))).toEqual({ skill: "logic-g45", grade: "5" });
    // Grade 3 is in the band 2-3, which has no vocabulary pool: never vocab-g45 a band up.
    expect(picked("language", grades({ language: "3", logic: "3" }))?.skill).toBe("logic-g23");
  });

  it("the garden chest draws the science sort of the hero's science band", () => {
    expect(picked("science", grades({ science: "6" }))).toEqual({ skill: "science-g68", grade: "6" });
    expect(picked("science", grades({ science: "3" }))).toEqual({ skill: "science-g23", grade: "2" });
    expect(picked("science", grades({ science: "K" }))?.skill).toBe("science-k1");
  });
});

describe("lockRun (RG-j)", () => {
  const skill = findSkill("logic-g45") as Skill;
  const input = (over: Partial<Parameters<typeof lockRun>[0]> = {}) => ({
    skill, level: 0, count: 1, seed: 7, enabledKinds: LOCKS_ON, profile: PLAIN, ...over,
  });

  it("draws the count asked for, every one a lock of the skill", () => {
    const r = lockRun(input({ count: 1 }));
    expect(r.skillIds).toEqual(["logic-g45"]);
    expect(r.questions).toHaveLength(1);
    expect(kindOf(r.questions[0])).toBe("lock");
    expect(r.questions[0].skillId).toBe("logic-g45");
  });

  it("draws a sort for a vocabulary skill", () => {
    const r = lockRun(input({ skill: findSkill("vocab-g45") as Skill }));
    expect(r.questions).toHaveLength(1);
    expect(kindOf(r.questions[0])).toBe("lock");
  });

  it("with locks disabled gives an empty run, for a logic skill and a sort skill alike (never a choice question)", () => {
    for (const id of ["logic-g45", "vocab-g45", "science-g68"]) {
      expect(lockRun(input({ skill: findSkill(id) as Skill, enabledKinds: new Set<TaskKind>(["measure"]) })), id).toEqual({ skillIds: [], questions: [] });
    }
  });

  it("the same seed gives the same task id", () => {
    const id = (seed: number) => lockRun(input({ seed })).questions[0].id;
    expect(id(5)).toBe(id(5));
  });
});
