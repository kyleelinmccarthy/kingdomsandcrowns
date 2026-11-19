import { describe, it, expect, vi } from "vitest";
import { BUILD_RUN, buildBuildRun } from "./build-run";
import { skillsFor } from "./skills";
import { GRADES, type Grade } from "./grade-levels";
import type { ProfileLike } from "./deed-engine";
import { benchFor } from "@/lib/tasks/bench";
import { kindOf } from "@/lib/tasks/registry";
import type { TaskKind } from "@/lib/tasks/types";

const PLAIN: ProfileLike = { fewerChoices: false, predictableRoutine: false, untimed: false, readAloud: false };
const MEASURE = new Set<TaskKind>(["measure"]);
const NONE = new Set<TaskKind>();
const input = (over: Partial<Parameters<typeof buildBuildRun>[0]> = {}) => ({
  grade: "3" as Grade, masteryBySkill: {}, seed: 11, enabledKinds: MEASURE, profile: PLAIN, ...over,
});
const skillsOf = (qs: { skillId: string }[]) => qs.map((q) => q.skillId);
const tally = (skills: string[]) => Object.values(skills.reduce<Record<string, number>>((n, s) => ({ ...n, [s]: (n[s] ?? 0) + 1 }), {})).sort();

describe("BUILD_RUN", () => {
  it("is three tasks", () => expect(BUILD_RUN.tasks).toBe(3));
});

describe("buildBuildRun", () => {
  it("gives a grade 3 hero three bench tasks over area-perimeter and frac-unit, drawn two and one", () => {
    const r = buildBuildRun(input());
    expect(r.questions).toHaveLength(3);
    expect(r.questions.map(kindOf)).toEqual(["measure", "measure", "measure"]);
    expect([...new Set(skillsOf(r.questions))].sort()).toEqual(["area-perimeter", "frac-unit"]);
    expect([...r.skillIds].sort()).toEqual(["area-perimeter", "frac-unit"]);
    expect(tally(skillsOf(r.questions))).toEqual([1, 2]);
  });

  it("with the measure toggle off gives three choice tasks over the same skills", () => {
    const r = buildBuildRun(input({ enabledKinds: NONE }));
    expect(r.questions).toHaveLength(3);
    expect(r.questions.map(kindOf)).toEqual(["choice", "choice", "choice"]);
    expect([...new Set(skillsOf(r.questions))].sort()).toEqual(["area-perimeter", "frac-unit"]);
  });

  it("is deterministic by seed", () => {
    const a = buildBuildRun(input({ seed: 5 }));
    expect(buildBuildRun(input({ seed: 5 }))).toEqual(a);
    expect(buildBuildRun(input({ seed: 6 }))).not.toEqual(a);
  });

  it("draws the weaker skill twice", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = buildBuildRun(input({ seed, masteryBySkill: { "area-perimeter": 3, "frac-unit": 0 } }));
      expect(skillsOf(r.questions).filter((s) => s === "frac-unit")).toHaveLength(2);
    }
  });

  it("gives every grade from K to 12 three tasks over its two bench skills", () => {
    for (const grade of GRADES) {
      const benched = skillsFor("math", grade).filter((s) => benchFor(s.id)).map((s) => s.id);
      expect(benched, grade).toHaveLength(2);
      const r = buildBuildRun(input({ grade }));
      expect(r.questions, grade).toHaveLength(3);
      expect(r.questions.every((q) => benched.includes(q.skillId)), grade).toBe(true);
    }
  });

  it("trims a choice task's options for a hero who wants fewer choices, and leaves the bench alone", () => {
    const off = buildBuildRun(input({ enabledKinds: NONE, profile: { ...PLAIN, fewerChoices: true } }));
    const full = buildBuildRun(input({ enabledKinds: NONE }));
    const options = (q: unknown) => (q as { choices: string[] }).choices.length;
    expect(Math.max(...off.questions.map(options))).toBeLessThan(Math.max(...full.questions.map(options)));
    expect(buildBuildRun(input({ profile: { ...PLAIN, fewerChoices: true } })).questions.map(kindOf)).toEqual(["measure", "measure", "measure"]);
  });

  it("keeps a predictable order for a hero who wants one: each skill's tasks together", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = skillsOf(buildBuildRun(input({ seed, profile: { ...PLAIN, predictableRoutine: true } })).questions);
      // Never the lone skill's task between the other's pair.
      expect(s[0] === s[2] && s[0] !== s[1]).toBe(false);
    }
  });

  it("never repeats a task", () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const ids = buildBuildRun(input({ seed })).questions.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("a grade with no benched skill", () => {
  it("falls back to that grade's math skills as choice tasks, and never throws", async () => {
    vi.resetModules();
    vi.doMock("@/lib/tasks/bench", () => ({ benchFor: () => undefined, BENCH: {} }));
    try {
      const fake = await import("./build-run");
      const registry = await import("@/lib/tasks/registry");
      const r = fake.buildBuildRun(input());
      expect(r.questions).toHaveLength(3);
      expect(r.questions.map(registry.kindOf)).toEqual(["choice", "choice", "choice"]);
      const grade3 = skillsFor("math", "3").map((s) => s.id);
      expect(r.questions.every((q) => grade3.includes(q.skillId))).toBe(true);
    } finally {
      vi.doUnmock("@/lib/tasks/bench");
      vi.resetModules();
    }
  });
});
