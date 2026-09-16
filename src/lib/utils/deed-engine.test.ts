import { describe, it, expect } from "vitest";
import { buildDeedRun, chooseSkills, gradeAnswer, toClientQuestion, type BuildRunInput, type PoolItem } from "./deed-engine";
import { findDeed } from "./deeds";
import { GRADES } from "./grade-levels";
import { skillsFor } from "./skills";
import type { Question } from "./drill-generators";

const deedMath = findDeed("well-stones")!;      // math
const deedReading = findDeed("well-signs")!;    // reading
const deedLanguage = findDeed("mill-ledger")!;  // language
const deedScience = findDeed("well-water")!;     // science

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
  it("returns every candidate skill for the area at the hero's grade", () => {
    expect(chooseSkills(deedMath, "3").map((s) => s.id)).toEqual(["add-20", "sub-20", "add-100"]);
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
    // Pin selection to add-20 (the miss's own skill) by making it the grade's only
    // least-practised generator; otherwise which of the three grade-3 generators gets
    // chosen is a seeded tie-break, and the miss would land on a skill never picked.
    const run = buildDeedRun(input({
      deed: deedMath, poolItems: [], recentMisses: misses,
      masteryBySkill: { "add-20": 0, "sub-20": 5, "add-100": 5 },
      profile: { ...profile, predictableRoutine: true },
    }));
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
      // Pin selection to add-10 (the misses' own skill) by putting every other grade-K
      // generator above it, so the tie-break shuffle can't route review questions to a
      // skill that was never chosen for the run. Every generator skill the grade offers
      // has to be listed, or an unpinned one defaults to 0 and ties with add-10 again.
      const run = buildDeedRun(input({
        deed: deedMath, grade: "K", poolItems: [], recentMisses: misses, seed,
        masteryBySkill: { "add-10": 0, "sub-10": 5, "count-seq": 5, "compare-num": 5 },
      }));
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

  it("falls back rather than returning nothing, for every area at every grade", () => {
    // This replaces a test named "when an area has no content at all" that asserted
    // chooseSkills(mathDeed, "K") does not throw — but math HAS content at K, so it
    // described a case it never exercised and could not realistically fail. Every area
    // has content at some grade, so what is actually true and worth pinning is that the
    // walk always lands somewhere: a hero is never handed an empty run.
    for (const deed of [deedMath, deedReading, deedLanguage, deedScience]) {
      for (const grade of GRADES) {
        expect(chooseSkills(deed, grade).length, `${deed.area} at grade ${grade}`).toBeGreaterThan(0);
      }
    }
  });

  it("widens to every pool skill when a grade has more than one, so the caller's pool query is a superset of whatever gets selected", () => {
    // Language at grades 4-5 authors two pool skills (spell-g45, vocab-g45) — the
    // exact case the action's poolSkillIds query must cover, or the run silently
    // comes up short whenever selectSkills picks the one the query didn't fetch for.
    const ids = chooseSkills(deedLanguage, "4").map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["spell-g45", "vocab-g45"]));
  });

  it("still selects only one pool skill per run even when a grade has two candidates", () => {
    const items = [...poolItems("spell-g45", 10), ...poolItems("vocab-g45", 10)];
    const run = buildDeedRun(input({ deed: deedLanguage, grade: "4", poolItems: items, masteryBySkill: {} }));
    const poolSkillIds = run.skillIds.filter((id) => id === "spell-g45" || id === "vocab-g45");
    expect(poolSkillIds).toHaveLength(1);
  });
});

describe("every skill at a hero's grade can actually be served", () => {
  const baseInput = input({ deed: deedMath, poolItems: [] });

  /**
   * One deed per area, so this covers all four strands and not just math. The bug this
   * guards against was never math-only: Language Arts at grades 4-5 authors two pool
   * skills and only `spell-g45` was ever served, so `vocab-g45` was dead content too.
   * A math-only version of this test passes while that is still broken.
   */
  const AREA_DEEDS = [
    ["math", deedMath],
    ["reading", deedReading],
    ["language", deedLanguage],
    ["science", deedScience],
  ] as const;

  it.each(AREA_DEEDS)("reaches every %s skill at every grade across a run of seeds", (area, deed) => {
    for (const grade of GRADES) {
      const available = skillsFor(area, grade).map((s) => s.id);
      if (available.length === 0) continue;
      // Pool skills need items or they can be selected and still produce nothing, which
      // would read as unreachable for the wrong reason.
      const items = available.flatMap((id) => poolItems(id, 30));
      const served = new Set<string>();
      for (let seed = 1; seed <= 200; seed++) {
        // A hero with no mastery anywhere: the flattest case, where nothing but the
        // selection rule decides. If a skill is unreachable here it is unreachable.
        const built = buildDeedRun({ ...baseInput, deed, grade, seed, masteryBySkill: {}, poolItems: items });
        for (const id of built.skillIds) served.add(id);
      }
      const unreachable = available.filter((id) => !served.has(id));
      expect(unreachable, `${area} grade ${grade} can never serve: ${unreachable.join(", ")}`).toEqual([]);
    }
  });

  it("hands a run only the skills it actually practised, never every candidate", () => {
    // skillIds drives which recent misses count as review, how the question budget is
    // split, and — at the call site — which mastery rows are snapshotted as the run's
    // starting point. Leaking the full candidate list would record progress against
    // skills the child never saw. Grade 3 math has three candidates; a run uses one.
    const built = buildDeedRun({ ...baseInput, grade: "3", seed: 7, masteryBySkill: {} });
    expect(chooseSkills(deedMath, "3").length).toBe(3);
    expect(built.skillIds).toHaveLength(1);
  });

  it("practises the least-mastered skill first", () => {
    // Grade 3 math has three generators (add-20, sub-20, add-100). Two are already
    // practised and one is at level 0. The level-0 skill must be the one chosen, on
    // every seed — this is not a tie. (add-100 is pinned above 0 too, or an untouched
    // skill defaulting to 0 would tie with sub-20 and make the pick a coin flip.)
    for (let seed = 1; seed <= 50; seed++) {
      const built = buildDeedRun({ ...baseInput, grade: "3", seed, masteryBySkill: { "add-20": 4, "sub-20": 0, "add-100": 4 } });
      expect(built.skillIds, `seed ${seed}`).toContain("sub-20");
    }
  });
});
