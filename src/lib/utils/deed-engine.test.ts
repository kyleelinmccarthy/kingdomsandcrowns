import { describe, it, expect, vi, afterEach } from "vitest";
import { applyProfile, buildDeedRun, chooseSkills, drawForSkill, gradeAnswer, runCandidates, selectSkills, type BuildRunInput, type PoolItem } from "./deed-engine";
import { DEEDS, SIDE_QUEST_QUESTIONS, TRAIL_CLUES, findDeed, type Deed } from "./deeds";
import { REVIEW } from "./review-schedule";
import { CHALLENGE } from "./deed-scoring";
import { GENERATORS, seededRng } from "./drill-generators";
import { SKILLS, choiceDrawable } from "./skills";
import { FOCUS_WEIGHT, focusWindow } from "./focus";
import { GRADES } from "./grade-levels";
import { skillsFor } from "./skills";
import type { Question } from "./drill-generators";
import type { ChoiceTask, LockTask, MeasureTask, Task, TaskKind } from "@/lib/tasks/types";
import { BENCH } from "@/lib/tasks/bench";
import { TASK_KINDS, kindOf } from "@/lib/tasks/registry";
import { HANDS_ON_KINDS } from "@/lib/tasks/kinds";
import { __setDrawerForTest, TASK_RUN_DRAWERS, type TaskDrawer } from "@/lib/tasks/draw";
import { choiceKind } from "@/lib/tasks/choice";
import { __setSortPoolsForTest, sortTaskFromId } from "@/lib/tasks/locks/sort";
import { __setTrailPoolsForTest, trailPoolFor, trailTaskOf } from "@/lib/tasks/trails";
import { TRAIL_SKILLS, trailKey } from "@/lib/content/trail-pools";
import { fixtureTrailPool } from "@/test/trail-pool-fixture";

const deedMath = findDeed("well-stones")!;      // math
const deedReading = findDeed("well-signs")!;    // reading
const deedLanguage = findDeed("mill-ledger")!;  // language
const deedScience = findDeed("well-water")!;     // science

function poolItems(skillId: string, n: number, level = 2): PoolItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${skillId}-item-${i}`, skillId, prompt: `Prompt ${i}`, answer: `A${i}`, distractors: [`B${i}`, `C${i}`, `D${i}`], readAloud: null, level,
  }));
}

/**
 * Reading as multiple choice, as `well-signs` was before H7 made it a trail of four clues (F-5): the
 * eight-question choice deed. The candidate cases below are about what a run can PLAY, and the older
 * cases about what a choice run is, so they use this fixture; the trail cases use the real deed.
 */
const choiceReading: Deed = { ...findDeed("well-signs")!, mechanic: "choice", questionCount: SIDE_QUEST_QUESTIONS };
/** Every hands-on kind on: the run asks for no restriction beyond what it can play. */
const ALL_ON: ReadonlySet<TaskKind> = new Set<TaskKind>(HANDS_ON_KINDS);

const profile = { fewerChoices: false, predictableRoutine: false, untimed: false, readAloud: false };

/** Hands-on kinds off: the choice path, as stored runs and the gate have it. */
const CHOICE_ONLY: ReadonlySet<TaskKind> = new Set<TaskKind>();

/** A grade-3 multiple-choice reading run by default (the choice fixture: the real reading deeds are trails since H7). */
function input(over: Partial<BuildRunInput> = {}): BuildRunInput {
  return { deed: choiceReading, grade: "3", masteryBySkill: {}, profile, seed: 1, poolItems: poolItems("read-g3", 30), recentMisses: [], ...over };
}

/** A choice-only run's tasks, as choices: asserts that none is another kind. */
function choices(tasks: Task[]): ChoiceTask[] {
  for (const t of tasks) expect(kindOf(t)).toBe("choice");
  return tasks.filter((t): t is ChoiceTask => kindOf(t) === "choice");
}

describe("chooseSkills", () => {
  it("returns every candidate skill for the area at the hero's grade", () => {
    expect(chooseSkills(deedMath, "3").map((s) => s.id))
      .toEqual(["mul-facts", "div-facts", "frac-unit", "area-perimeter", "round-nearest", "add-1000", "sub-1000"]);
    expect(chooseSkills(deedReading, "3").map((s) => s.id)).toEqual(["read-g3"]);
  });
  it("falls back to the nearest grade when the area has no skill there", () => {
    expect(chooseSkills(deedLanguage, "7").map((s) => s.id)).toEqual(["vocab-g68"]);
    // Unfiltered: `chooseSkills` knows nothing of what a run can play, so grade 9 finds the trail-only `read-g9`.
    // The run's own candidates (`runCandidates`) are what leave it out where trails cannot play (R-H8).
    expect(chooseSkills(deedReading, "9").map((s) => s.id)).toEqual(["read-g9"]);
    expect(chooseSkills(deedReading, "12").map((s) => s.id)).toEqual(["read-g9"]);
    expect(chooseSkills(deedReading, "7").map((s) => s.id)).toEqual(["read-g6"]);
  });

  /**
   * **`chooseSkills` walks easier grades first, and where a strand has nothing at or below a
   * grade it runs off the bottom and walks UP instead.** Its comment used to claim a hero is
   * never handed harder work than their own grade, full stop. That is true of math, which has
   * content at every grade; it is not true of the strands plan 3 has not filled, and the
   * comment was the one about wrong-year work.
   *
   * The behaviour is deliberate and stays — an empty quest is worse than a hard one — so what
   * this asserts is the LIST, hand-written, exactly. Every (area, grade) pair listed would be a
   * hero being handed a harder grade's work than their own. It held two entries, both Language
   * Arts: a kindergartener and a first-grader handed grade-2 spelling. Authoring `lang-gk` and
   * `lang-g1` gave those two grades their own pools, so nothing climbs anywhere and the literal
   * is now `[]`. It stays `[]`: a new climb is a defect, not a line to add.
   *
   * Falling DOWN is not on this list and is not a defect: Reading is authored no higher than
   * grade 4 yet, so a grade-9 hero gets grade-4 reading. That is the walk doing what it says
   * it does, and the fall shortens with every reading grade that gets written.
   *
   * `skills.test.ts` keeps the same inventory for the three authored strands, phrased from the
   * skill-table side; if you empty one, empty the other.
   */
  it("hands harder work than the hero's grade in exactly these places, and nowhere else", () => {
    // One deed per area, and every area covered, so the sweep below cannot quietly skip a
    // strand. Asked through `chooseSkills` itself rather than through a second copy of the
    // walk: what is being inventoried is what a hero is actually handed.
    const byArea = [[deedMath, "math"], [deedReading, "reading"], [deedLanguage, "language"], [deedScience, "science"]] as const;
    // `logic` is exempt by name: the owner decided it is practised on locks and Puzzle practice,
    // not side quests, so it has no deed (and `chooseSkills` is asked for it in the logic tests).
    expect(byArea.map(([, area]) => area).sort()).toEqual([...new Set(SKILLS.map((s) => s.area))].filter((a) => a !== "logic").sort());

    const climbing: string[] = [];
    for (const [deed, area] of byArea) {
      for (const grade of GRADES) {
        const chosen = chooseSkills(deed, grade);
        expect(chosen.length, `${area} grade ${grade} is handed an empty quest`).toBeGreaterThan(0);
        // Only when EVERY grade the chosen skills belong to is above the hero's: a skill that
        // spans grades 2 and 3 is not harder work for a grade-3 hero.
        const served = chosen[0].grades;
        if (served.length > 0 && served.every((g) => GRADES.indexOf(g) > GRADES.indexOf(grade))) {
          climbing.push(`${area} grade ${grade} is taught grade ${served[0]}`);
        }
      }
    }
    expect(climbing).toEqual([]);
  });
});

describe("buildDeedRun", () => {
  it("returns the deed's question count with four distinct choices each", () => {
    const run = buildDeedRun(input());
    expect(run.questions).toHaveLength(8);
    for (const q of choices(run.questions)) { expect(q.choices).toHaveLength(4); expect(q.choices).toContain(q.answer); }
    expect(run.skillIds).toEqual(["read-g3"]);
  });
  it("is deterministic for a seed", () => {
    expect(buildDeedRun(input({ seed: 9 }))).toEqual(buildDeedRun(input({ seed: 9 })));
  });
  it("takes the grown-up's side-quest length over the deed's own count", () => {
    expect(buildDeedRun(input({ questionCount: 4 })).questions).toHaveLength(4);
    expect(buildDeedRun(input({ questionCount: 12 })).questions).toHaveLength(12);
  });
  it("never repeats a pool item and draws near the mastery level, widening when needed", () => {
    const items = [...poolItems("read-g3", 5, 0), ...poolItems("read-g3", 3, 4).map((i) => ({ ...i, id: `${i.id}-hi` }))];
    const run = buildDeedRun(input({ poolItems: items, masteryBySkill: { "read-g3": 4 } }));
    expect(new Set(run.questions.map((q) => q.id)).size).toBe(run.questions.length);
    expect(run.questions.length).toBe(8);
  });
  it("mixes in at most two recent misses for the chosen skills", () => {
    const misses: Question[] = [0, 1, 2].map((i) => ({ id: `miss-${i}`, skillId: "read-g3", prompt: `Miss ${i}`, choices: ["x", "y", "z", "w"], answer: "x" }));
    const run = buildDeedRun(input({ recentMisses: misses }));
    expect(run.questions.filter((q) => q.id.startsWith("miss-"))).toHaveLength(2);
    expect(run.questions).toHaveLength(8);
  });
  it("dedupes recent misses with the same id into a single review question", () => {
    const misses: Question[] = [
      { id: "miss-dup", skillId: "read-g3", prompt: "Miss", choices: ["x", "y", "z", "w"], answer: "x" },
      { id: "miss-dup", skillId: "read-g3", prompt: "Miss", choices: ["x", "y", "z", "w"], answer: "x" },
    ];
    const run = buildDeedRun(input({ recentMisses: misses }));
    expect(run.questions.filter((q) => q.id === "miss-dup")).toHaveLength(1);
    expect(run.questions).toHaveLength(8);
    expect(new Set(run.questions.map((q) => q.id)).size).toBe(8);
  });
  it("never re-asks a miss of a kind the deed is not played with (R-C6)", () => {
    // The deed's mechanic is choice, so a miss stored as another kind is dropped, enabled or not.
    // (The measure task is cut down to what the filter reads, hence the cast.)
    const other = { kind: "measure", id: "miss-m", skillId: "read-g3", prompt: "Cut it", answer: "3/4" } as unknown as Task;
    const choice: Question = { id: "miss-c", skillId: "read-g3", prompt: "Miss", choices: ["x", "y", "z", "w"], answer: "x" };
    for (const enabledKinds of [undefined, new Set<TaskKind>(), new Set<TaskKind>(["choice"])]) {
      const ids = buildDeedRun(input({ recentMisses: [other, choice], enabledKinds })).questions.map((q) => q.id);
      expect(ids).not.toContain("miss-m");
      expect(ids).toContain("miss-c");
    }
  });
  it("ignores misses from other skills", () => {
    const misses: Question[] = [{ id: "miss-other", skillId: "mul-facts", prompt: "6 × 7", choices: ["42", "41", "43", "40"], answer: "42" }];
    expect(buildDeedRun(input({ recentMisses: misses })).questions.some((q) => q.id === "miss-other")).toBe(false);
  });
  it("trims to two choices that include the answer under fewerChoices", () => {
    const run = buildDeedRun(input({ profile: { ...profile, fewerChoices: true } }));
    for (const q of choices(run.questions)) { expect(q.choices).toHaveLength(2); expect(q.choices).toContain(q.answer); }
  });
  it("groups by skill with review last under predictableRoutine", () => {
    const misses: Question[] = [{ id: "miss-0", skillId: "mul-facts", prompt: "6 × 7", choices: ["42", "41", "43", "40"], answer: "42" }];
    // The miss only becomes review on a run that actually practises mul-facts. Mastery is a
    // weighted bias now rather than a rule, so no arrangement of levels can PIN the pick —
    // mul-facts is put at the bottom to make it the likely one and the runs that chose
    // something else are skipped, which states the precondition instead of pretending to
    // control it. The pins come from the grade's own candidate list so re-pointing a skill
    // at a different grade cannot silently leave one out.
    const masteryBySkill = Object.fromEntries(
      chooseSkills(deedMath, "3").map((s) => [s.id, s.id === "mul-facts" ? 0 : 4])
    );
    let checked = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const run = buildDeedRun(input({
        deed: deedMath, poolItems: [], recentMisses: misses, seed, masteryBySkill,
        profile: { ...profile, predictableRoutine: true },
      }));
      if (!run.skillIds.includes("mul-facts")) continue;
      checked += 1;
      expect(run.questions[run.questions.length - 1].id, `seed ${seed}`).toBe("miss-0");
    }
    expect(checked, "mul-facts was never chosen, so this asserted nothing").toBeGreaterThan(5);
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
    let checked = 0;
    for (let seed = 1; seed <= 50; seed++) {
      // add-10 (the misses' own skill) sits at the bottom so the weighted draw favours it,
      // and runs that chose another grade-K skill are skipped: the misses are not review on
      // those, so there is nothing here for them to say. Every generator skill the grade
      // offers has to be listed, or an unpinned one defaults to 0 and dilutes the bias.
      const run = buildDeedRun(input({
        deed: deedMath, grade: "K", poolItems: [], recentMisses: misses, seed, enabledKinds: CHOICE_ONLY,
        masteryBySkill: { "add-10": 0, "sub-10": 4, "count-seq": 4, "compare-num": 4 },
      }));
      const ids = run.questions.map((q) => q.id);
      expect(run.questions).toHaveLength(8);
      expect(new Set(ids).size).toBe(ids.length);
      if (!run.skillIds.includes("add-10")) continue;
      checked += 1;
      expect(ids.filter((id) => id === "add-10:1+1")).toHaveLength(1);
      expect(ids.filter((id) => id === "add-10:2+2")).toHaveLength(1);
    }
    expect(checked, "add-10 was never chosen, so the review path asserted nothing").toBeGreaterThan(10);
  });
});

describe("grading", () => {
  it("grades by exact match after trimming", () => {
    const q: Question = { id: "q", skillId: "s", prompt: "p", choices: ["a", "b", "c", "d"], answer: "b" };
    expect(gradeAnswer(q, " b ")).toBe(true);
    expect(gradeAnswer(q, "B")).toBe(false);
  });
});

const mathDeed = findDeed("well-stones")!;   // area: "math"

describe("chooseSkills by grade", () => {
  it("gives a grade-3 hero the skills their grade's content is authored for", () => {
    const ids = chooseSkills(mathDeed, "3").map((s) => s.id);
    expect(ids).toContain("mul-facts");
  });

  it("reaches multi-digit multiplication when a grown-up moves a grade-3 hero's math up a year", () => {
    // The whole point of the setting: this is unreachable for grade 3 today, which gets
    // the multiplication FACTS and leaves multi-digit work to grade 4.
    const ids = chooseSkills(mathDeed, "4").map((s) => s.id);
    expect(ids).toContain("mul-multi");
  });

  it("walks to easier grades, never harder, when a grade has nothing", () => {
    // Reading's multiple-choice pools reach grade 4, so a grade-6 hero's PLAYABLE reading (what a run
    // draws where trails cannot play) falls back two years. It is still a fall, not a climb, which is
    // the point here; the remaining reading grades are what close the gap. `chooseSkills` alone now
    // lands on the trail-only `read-g6`; `runCandidates` is what filters it out (R-H8).
    const ids = runCandidates(choiceReading, "6", [], ALL_ON).map((s) => s.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toContain("read-g4");
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

  it("returns EVERY skill its landing grade has, so the caller's pool query is a superset of whatever gets selected", () => {
    // What the action's poolSkillIds query must cover: chooseSkills does not pick one skill,
    // it hands back the whole grade, and `selectSkills` chooses later. Fetch items for fewer
    // than all of them and the run silently comes up short whenever selectSkills lands on the
    // one the query did not fetch for.
    //
    // This used to be asked of Language at grades 4-5, which authored two pool skills
    // (spell-g45 and vocab-g45) into one band. `ela-science-skill-map.md` gives each strand
    // exactly ONE skill per grade, so no authored grade has two candidates any more and that
    // example would now pass vacuously. Math still has several skills per grade, which is the
    // same property and a real case.
    const ids = chooseSkills(mathDeed, "3").map((s) => s.id);
    expect(ids.length).toBeGreaterThan(1);
    expect([...ids].sort()).toEqual(skillsFor("math", "3").map((s) => s.id).sort());
  });

  it("selects only one pool skill per run, even when items for another pool are in hand", () => {
    // Grade-4 language is spell-g45 alone now, but the caller can still hand over items it
    // fetched for a skill this run will not practise. Those must not leak into the run.
    const items = [...poolItems("spell-g45", 10), ...poolItems("vocab-g45", 10)];
    const run = buildDeedRun(input({ deed: deedLanguage, grade: "4", poolItems: items, masteryBySkill: {} }));
    const poolSkillIds = [...new Set(run.skillIds.filter((id) => id === "spell-g45" || id === "vocab-g45"))];
    expect(poolSkillIds).toEqual(["spell-g45"]);
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
    // The choice path's reach; the trail path's is pinned with the trail runs (H7, below).
    ["reading", choiceReading],
    ["language", deedLanguage],
    ["science", deedScience],
  ] as const;

  it.each(AREA_DEEDS)("reaches every %s skill at every grade across a run of seeds", (area, deed) => {
    for (const grade of GRADES) {
      // Trail-only skills (`read-g6`, `read-g9`) are reached through the trail mechanic and nothing else
      // (R-H8): a choice run never draws them. Their reachability is pinned with the trail run (H7).
      const available = skillsFor(area, grade).filter(choiceDrawable).map((s) => s.id);
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
    // skills the child never saw. Grade 3 math has seven candidates; a run uses one.
    const built = buildDeedRun({ ...baseInput, grade: "3", seed: 7, masteryBySkill: {} });
    expect(chooseSkills(deedMath, "3").length).toBe(7);
    expect(built.skillIds).toHaveLength(1);
  });

  it("leans hard on the least-mastered skill without locking on to it", () => {
    // This was "practises the least-mastered skill first", and was true on every seed
    // because least-mastered was an absolute rule. It is a weighted draw now, so the
    // truth is a tendency and has to be measured as one — but it is still a strong
    // tendency, and a version of this test that merely asserted div-facts is reachable
    // would let the bias be dropped entirely without anything failing.
    //
    // The other skills are pinned above 0 deliberately: an untouched skill defaults to 0
    // and would tie with div-facts. The pins are built from the grade's own candidate
    // list so a skill added later cannot be forgotten.
    const practised = Object.fromEntries(
      chooseSkills(deedMath, "3").map((s) => [s.id, s.id === "div-facts" ? 0 : 4])
    );
    expect(practised["div-facts"], "div-facts must be one of grade 3's skills").toBe(0);
    const counts = new Map<string, number>();
    const SEEDS = 200;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const built = buildDeedRun({ ...baseInput, grade: "3", seed, masteryBySkill: practised });
      for (const id of built.skillIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const div = counts.get("div-facts") ?? 0;
    const rivals = [...counts.entries()].filter(([id]) => id !== "div-facts");
    const best = Math.max(...rivals.map(([, n]) => n));
    // Weight 5 against 1 apiece for six rivals: div-facts should take something close to
    // 5/11 of the runs, and every rival about 1/11. Three times the busiest rival is a
    // wide margin round a big gap, not a tight pin on the arithmetic.
    expect(div, `div-facts took ${div}/${SEEDS}: ${[...counts].map(([k, n]) => `${k}=${n}`).join(" ")}`)
      .toBeGreaterThan(best * 3);
    // ...and the others are not locked out, which is the whole point of the change.
    expect(rivals.length, "only div-facts was ever served").toBeGreaterThan(1);
  });

  it("does not serve the same skill every day to a child who finds one hard", () => {
    // A one-run assertion cannot see this. `recordResult` lets a level go DOWN on repeated
    // failure and caps it at MASTERY_MAX, so under a strict least-mastered rule the one
    // skill a child struggles with sinks to 0 while everything else climbs to 4 — strictly
    // and permanently the minimum. Measured before the fix: sub-1000 served 34 days of 40,
    // the last 34 consecutively, every other skill served exactly once.
    const HARD = "sub-1000";
    expect(chooseSkills(deedMath, "3").map((s) => s.id), "the hard skill must be a grade-3 one")
      .toContain(HARD);
    const mastery: Record<string, number> = {};
    const served: string[] = [];
    for (let day = 1; day <= 40; day++) {
      const built = buildDeedRun({ ...baseInput, grade: "3", seed: day, masteryBySkill: { ...mastery } });
      for (const id of built.skillIds) {
        served.push(id);
        // Mastery moves the way the real engine moves it: up on success, down on repeated
        // failure, capped at MASTERY_MAX.
        mastery[id] = id === HARD ? Math.max(0, (mastery[id] ?? 0) - 1) : Math.min(4, (mastery[id] ?? 0) + 1);
      }
    }
    const counts = new Map<string, number>();
    for (const id of served) counts.set(id, (counts.get(id) ?? 0) + 1);

    // No skill takes more than two thirds of the days...
    for (const [id, n] of counts) expect(n, `${id} served ${n}/40 days`).toBeLessThanOrEqual(27);
    // ...and nothing is served ten days running.
    const longestRun = served.reduce((best, id, i) => {
      let run = 1;
      while (i - run >= 0 && served[i - run] === id) run++;
      return Math.max(best, run);
    }, 1);
    expect(longestRun, `longest unbroken run of one skill: ${longestRun}`).toBeLessThan(10);
    // The hard skill is still practised more than anything else — the point is that it
    // stops being the ONLY thing practised, not that it stops being the priority. Before
    // the fix this was 34/40; after it, 8/40 and still the busiest skill of the seven.
    const hardest = counts.get(HARD) ?? 0;
    const busiestRival = Math.max(...[...counts.entries()].filter(([id]) => id !== HARD).map(([, n]) => n));
    expect(hardest, `${HARD} took ${hardest}/40, busiest rival ${busiestRival}`).toBeGreaterThanOrEqual(busiestRival);
    expect(hardest, "the hard skill fell to less than a flat share of the days").toBeGreaterThan(40 / counts.size);
  });

  it("gives a skill nobody has touched for days a turn, however well it is mastered", () => {
    // Every skill mastered, so mastery alone would make the draw a flat coin toss across
    // seven candidates. round-nearest was last practised a week ago and the rest today, so
    // the recency term should single it out. This is what `skill_mastery.lastPracticedAt`
    // is persisted for.
    const DAY = 24 * 60 * 60 * 1000;
    const today = Date.UTC(2026, 0, 20);
    const candidates = chooseSkills(deedMath, "3").map((s) => s.id);
    const practised = Object.fromEntries(candidates.map((id) => [id, 4]));
    const lastPracticedBySkill = Object.fromEntries(
      candidates.map((id) => [id, id === "round-nearest" ? today - 7 * DAY : today])
    );
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 200; seed++) {
      const built = buildDeedRun({
        ...baseInput, grade: "3", seed, masteryBySkill: practised, lastPracticedBySkill,
      });
      for (const id of built.skillIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const stale = counts.get("round-nearest") ?? 0;
    const best = Math.max(...[...counts.entries()].filter(([id]) => id !== "round-nearest").map(([, n]) => n));
    expect(stale, `round-nearest took ${stale}/200: ${[...counts].map(([k, n]) => `${k}=${n}`).join(" ")}`)
      .toBeGreaterThan(best * 2);
  });

  it("does not call everything overdue on a hero's very first run", () => {
    // With no practice recorded anywhere there is nothing to be overdue against, so the
    // recency term must stay silent — otherwise it adds the same constant to every
    // candidate and flattens the mastery bias, which is the half that actually matters.
    const practised = Object.fromEntries(
      chooseSkills(deedMath, "3").map((s) => [s.id, s.id === "div-facts" ? 0 : 4])
    );
    const blank = Object.fromEntries(chooseSkills(deedMath, "3").map((s) => [s.id, null]));
    const count = (last: Record<string, number | null>) => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const built = buildDeedRun({ ...baseInput, grade: "3", seed, masteryBySkill: practised, lastPracticedBySkill: last });
        if (built.skillIds.includes("div-facts")) n++;
      }
      return n;
    };
    expect(count(blank)).toBe(count({}));
    expect(count(blank), "the mastery bias went missing when nothing had been practised").toBeGreaterThan(60);
  });
});

describe("what a child is actually served over a sitting", () => {
  const baseInput = input({ deed: deedMath, poolItems: [] });

  it("does not hand a bottom-rung child the same worksheet every day", () => {
    // `mul-facts` rung 0 used to draw both factors from 0-2: NINE questions in existence,
    // and a deed asks eight. A child's first multiplication deed was eight of the nine, and
    // the next day's was eight of the same nine. Two things fixed it — this engine taking
    // roughly one question in three from rung 1, and the rung itself being widened to the
    // whole two times table, 57 facts — and this is the check that says so from the outside,
    // where a child sits.
    const practised = Object.fromEntries(
      chooseSkills(deedMath, "3").map((s) => [s.id, s.id === "mul-facts" ? 0 : 4])
    );
    const prompts = new Set<string>();
    let deeds = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const built = buildDeedRun({ ...baseInput, grade: "3", seed, masteryBySkill: practised });
      if (!built.skillIds.includes("mul-facts")) continue;
      deeds += 1;
      for (const q of built.questions) if (q.skillId === "mul-facts") prompts.add(q.prompt);
    }
    expect(deeds, "mul-facts was barely chosen, so this proves nothing").toBeGreaterThan(10);
    // Nine before either repair, twenty with the engine's rung-1 borrowing alone, seventy
    // now that the rung itself holds 57 facts. Fifty is a floor with room in it: below that
    // and one of the two repairs has quietly stopped working.
    expect(prompts.size, `only ${prompts.size} distinct multiplication questions across ${deeds} deeds`)
      .toBeGreaterThan(50);
  });

  it("still opens a bottom-rung deed at the rung the child is on", () => {
    // The widening must never be the first thing a child meets: the opening question is
    // the one that decides whether today's deed looks doable.
    const practised = Object.fromEntries(
      chooseSkills(deedMath, "3").map((s) => [s.id, s.id === "mul-facts" ? 0 : 4])
    );
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const built = buildDeedRun({
        ...baseInput, grade: "3", seed, masteryBySkill: practised,
        profile: { ...profile, predictableRoutine: true },
      });
      if (!built.skillIds.includes("mul-facts")) continue;
      checked += 1;
      const [a, b] = built.questions[0].prompt.match(/(\d+) × (\d+)/)!.slice(1).map(Number);
      // Rung 0 is the two times table and rung 1 the fours, so the SMALLER factor is what
      // says which rung a fact was drawn at; the other factor runs to ten on both.
      expect(Math.min(a, b), `seed ${seed} opened with ${built.questions[0].prompt}`).toBeLessThanOrEqual(2);
      expect(Math.max(a, b), `seed ${seed} opened with ${built.questions[0].prompt}`).toBeLessThanOrEqual(10);
    }
    expect(checked).toBeGreaterThan(10);
  });

  it.each([
    ["6", "integer-ops", 4],
    ["K", "add-10", 3],
  ] as const)("keeps identity cases off grade %s's %s at level %i", (grade, skillId, level) => {
    // Read off /dev/content as a parent would: grade 6 integer-ops at level 4 served
    // `What is -36 × 1?`, grade K add-10 at level 3 served `What is 9 + 0?`. A child four
    // rungs up reads "times one" as the program making a mistake.
    const practised = Object.fromEntries(
      chooseSkills(deedMath, grade).map((s) => [s.id, s.id === skillId ? level : 4])
    );
    const offenders: string[] = [];
    let seen = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const built = buildDeedRun({ ...baseInput, grade, seed, masteryBySkill: practised });
      for (const q of built.questions.filter((q) => q.skillId === skillId)) {
        seen += 1;
        if (/(?:^|[^\d.])(?:0\s*[+×]|[+\-×]\s*0(?![\d.])|1\s*×|[×÷]\s*1(?![\d.]))/.test(q.prompt)) {
          offenders.push(q.prompt);
        }
      }
    }
    expect(seen, `${skillId} was barely served, so this proves nothing`).toBeGreaterThan(40);
    expect(offenders, `identity cases at level ${level}: ${offenders.slice(0, 5).join(" | ")}`).toEqual([]);
  });

  it("still fills a deed at a rung whose questions are mostly identity cases", () => {
    // Dodging must never cost a child questions. `add-10` at level 3 sums to 9, and a
    // third of its pairs have a zero in them; the deed is still eight questions long.
    const practised = Object.fromEntries(
      chooseSkills(deedMath, "K").map((s) => [s.id, s.id === "add-10" ? 4 : 5])
    );
    for (let seed = 1; seed <= 40; seed++) {
      const built = buildDeedRun({ ...baseInput, grade: "K", seed, masteryBySkill: practised });
      expect(built.questions.length, `seed ${seed}`).toBe(8);
      expect(new Set(built.questions.map((q) => q.id)).size).toBe(8);
    }
  });
});

describe("a miss stored under an older id shape is still not re-asked", () => {
  /**
   * Misses are replayed from the run they were stored in, so their ids are whatever that
   * day's generator produced. Four generators were re-keyed to drop parameters their
   * prompts never showed — and every miss stored before that carries the old key, which
   * matches nothing drawn today. Excluding on the id alone let the same question appear
   * twice in one deed: once as the review question, once as a fresh draw.
   *
   * The id here is deliberately one no current generator can produce.
   */
  it("excludes the review question by its prompt, not only by its id", () => {
    const skill = chooseSkills(deedMath, "3")[0];
    const fresh = buildDeedRun(input({ deed: deedMath, grade: "3", poolItems: [], masteryBySkill: {}, seed: 11, enabledKinds: CHOICE_ONLY }));
    const target = choices(fresh.questions)[0];

    const stale: Question = { ...target, id: `${target.skillId}:STALE-KEY:${target.id}` };
    const run = buildDeedRun(
      input({ deed: deedMath, grade: "3", poolItems: [], masteryBySkill: {}, seed: 11, recentMisses: [stale], enabledKinds: CHOICE_ONLY })
    );

    expect(skill, "grade 3 math must have a generator skill for this to mean anything").toBeDefined();
    const prompts = run.questions.map((q) => q.prompt);
    expect(new Set(prompts).size, `repeated a prompt: ${prompts.join(" | ")}`).toBe(prompts.length);
  });
});

describe("a skill whose question lives in its choices still fills a deed", () => {
  /**
   * `compare-num`, `compare-num-100` and `fractions-compare` ask one sentence forever —
   * "Which number is the greatest?" — and put the whole question in the four choices.
   * Excluding a draw because its PROMPT had been seen therefore threw away everything after
   * the first, and the deed came back with one question. Math has no pool skills to backfill
   * from, so roughly one kindergarten math deed in four was a single question.
   *
   * Run through `buildDeedRun` rather than a replica, because the bug lived in how the real
   * engine fills a deed, not in the generator.
   */
  it.each([
    ["K", "compare-num"],
    ["1", "compare-num-100"],
  ] as const)("grade %s fills eight questions on %s", (grade, skillId) => {
    for (let seed = 1; seed <= 25; seed++) {
      const built = buildDeedRun(
        input({ deed: deedMath, grade, poolItems: [], seed, masteryBySkill: { [skillId]: 0 } })
      );
      if (!built.skillIds.includes(skillId)) continue;
      expect(built.questions.length, `${skillId} seed ${seed} filled only ${built.questions.length}`).toBe(8);
      const texts = choices(built.questions).map((q) => `${q.prompt}|${[...q.choices].sort().join(",")}`);
      expect(new Set(texts).size, "repeated a question").toBe(texts.length);
    }
  });
});

describe("which skills count their choices as part of the question", () => {
  /**
   * `questionText` decides this by asking whether the prompt contains a digit — a heuristic,
   * and heuristics need a list of what they are supposed to match. Exactly three skills ask a
   * sentence with no number in it and put the question in the four choices. If a fourth ever
   * appears, or one of these three gains a number, this fails and someone looks at it rather
   * than finding out from a child getting a one-question deed.
   */
  it("is exactly the skills whose prompt never changes", () => {
    const constantPrompt: string[] = [];
    for (const skill of SKILLS) {
      if (skill.source.kind !== "generator") continue;
      const genId = (skill.source as { generatorId: string }).generatorId;
      const prompts = new Set<string>();
      for (let seed = 1; seed <= 40; seed++) {
        const rng = seededRng(seed);
        for (const level of [0, 1, 2, 3, 4]) {
          for (let i = 0; i < 6; i++) prompts.add(GENERATORS[genId](level, rng, skill.id).prompt);
        }
      }
      if (prompts.size === 1) constantPrompt.push(skill.id);
    }
    expect(constantPrompt.sort()).toEqual(["compare-num", "compare-num-100", "fractions-compare"]);
  });
});

describe("buildDeedRun keep-it-sharp review", () => {
  const mastery = { "mul-facts": 1, "div-facts": 2, "frac-unit": 2, "sub-1000": 2 };
  const mulInput = (over: Partial<BuildRunInput> = {}) =>
    input({ deed: deedMath, grade: "3", poolItems: [], masteryBySkill: mastery, enabledKinds: CHOICE_ONLY, ...over });
  const missOf = (i: number, skillId: string): Question => ({ id: `miss-${i}`, skillId, prompt: `Miss ${i}`, choices: ["x", "y", "z", "w"], answer: "x" });
  // Selection draws first from the seed, so a run without due skills names the run's own.
  const ownOf = (seed: number) => buildDeedRun(mulInput({ seed })).skillIds;
  const dueOf = (seed: number, ids: string[]) => {
    const own = ownOf(seed);
    return ids.filter((id) => !own.includes(id));
  };

  it("swaps fresh questions for a due skill's, keeping the count and the order of skillIds", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const own = ownOf(seed);
      const due = dueOf(seed, ["div-facts"]);
      const run = buildDeedRun(mulInput({ seed, dueSkillIds: ["div-facts"] }));
      expect(run.questions).toHaveLength(8);
      expect(new Set(run.questions.map((q) => q.id)).size).toBe(8);
      expect(run.skillIds).toEqual([...own, ...due]);
      expect(run.questions.some((q) => q.skillId === "div-facts")).toBe(true);
    }
  });
  it("holds recent misses and due questions together to REVIEW.maxTotal, misses first", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const own = ownOf(seed);
      const ids = ["div-facts", "frac-unit", "sub-1000"];
      const run = buildDeedRun(mulInput({ seed, dueSkillIds: ids, recentMisses: [missOf(0, own[0]), missOf(1, own[0])] }));
      const misses = run.questions.filter((q) => q.id.startsWith("miss-"));
      const due = run.questions.filter((q) => !own.includes(q.skillId));
      expect(run.questions).toHaveLength(8);
      expect(misses).toHaveLength(2);
      expect(misses.length + due.length).toBeLessThanOrEqual(REVIEW.maxTotal);
      expect(due.length).toBeLessThanOrEqual(1);
    }
  });
  it("keeps misses at two, so three misses and two due skills give two misses and one due question", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const own = ownOf(seed);
      const misses = [0, 1, 2].map((i) => missOf(i, own[0]));
      const run = buildDeedRun(mulInput({ seed, dueSkillIds: dueOf(seed, ["div-facts", "frac-unit", "sub-1000"]).slice(0, 2), recentMisses: misses }));
      expect(run.questions).toHaveLength(8);
      expect(run.questions.filter((q) => q.id.startsWith("miss-"))).toHaveLength(2);
      expect(run.questions.filter((q) => !own.includes(q.skillId))).toHaveLength(1);
    }
  });
  it("still brings a third overdue skill when the top two are the run's own", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const own = ownOf(seed);
      const others = ["mul-facts", "div-facts", "frac-unit", "area-perimeter", "round-nearest", "add-1000", "sub-1000"].filter((id) => !own.includes(id));
      const run = buildDeedRun(mulInput({ seed, dueSkillIds: [...own, others[0]] }));
      expect(run.skillIds).toEqual([...own, others[0]]);
      expect(run.questions.some((q) => q.skillId === others[0])).toBe(true);
      expect(run.questions).toHaveLength(8);
    }
  });
  it("never asks for more than maxDue due questions", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const own = ownOf(seed);
      const run = buildDeedRun(mulInput({ seed, dueSkillIds: ["div-facts", "frac-unit", "sub-1000"], questionCount: 12 }));
      const due = run.questions.filter((q) => !own.includes(q.skillId));
      expect(due.length).toBeLessThanOrEqual(REVIEW.maxDue);
      expect(due.length).toBeGreaterThan(0);
    }
  });
  it("ignores a due skill the deed cannot serve", () => {
    const run = buildDeedRun(mulInput({ seed: 5, dueSkillIds: ["read-g3", "nonsense"] }));
    expect(run.skillIds).toEqual(ownOf(5));
    expect(run.questions).toHaveLength(8);
  });
  it("has none when nothing is due (the challenge shape)", () => {
    expect(buildDeedRun(mulInput({ seed: 7, dueSkillIds: [], recentMisses: [] }))).toEqual(buildDeedRun(mulInput({ seed: 7 })));
  });
  it("puts due questions at the end under predictableRoutine, and trims their choices under fewerChoices", () => {
    const seed = [1, 2, 3, 4, 5, 6].find((s) => dueOf(s, ["div-facts"]).length === 1)!;
    const own = ownOf(seed);
    const run = buildDeedRun(mulInput({ seed, dueSkillIds: ["div-facts"], profile: { ...profile, predictableRoutine: true, fewerChoices: true } }));
    const flags = run.questions.map((q) => !own.includes(q.skillId));
    expect(flags.lastIndexOf(false)).toBeLessThan(flags.indexOf(true));
    expect(flags[flags.length - 1]).toBe(true);
    for (const q of choices(run.questions)) expect(q.choices).toHaveLength(2);
  });
});

describe("buildDeedRun for a Crown Challenge (levelBoost)", () => {
  afterEach(() => vi.restoreAllMocks());
  const mathSkills = chooseSkills(deedMath, "3").map((s) => s.id);
  const at = (level: number) => Object.fromEntries(mathSkills.map((id) => [id, level]));
  /** Every level a generator was asked for while one run was built. */
  function drawLevels(over: Partial<BuildRunInput>): number[] {
    const levels: number[] = [];
    for (const key of Object.keys(GENERATORS)) {
      const real = GENERATORS[key];
      vi.spyOn(GENERATORS, key).mockImplementation((level, rng, skillId) => {
        levels.push(level);
        return real(level, rng, skillId);
      });
    }
    buildDeedRun(input({ deed: deedMath, grade: "3", poolItems: [], questionCount: CHALLENGE.questions, ...over }));
    return levels;
  }

  it("draws every generated question one rung above the child", () => {
    const levels = drawLevels({ masteryBySkill: at(2), levelBoost: 1 });
    expect(levels.length).toBeGreaterThan(0);
    expect(new Set(levels)).toEqual(new Set([3]));
  });
  it("never draws above the top rung", () => {
    expect(new Set(drawLevels({ masteryBySkill: at(4), levelBoost: 1 }))).toEqual(new Set([4]));
  });
  it("draws pool items near the boosted rung too", () => {
    const items = [
      ...poolItems("read-g3", 5, 1).map((i) => ({ ...i, id: `${i.id}-lo` })),
      ...poolItems("read-g3", 5, 4).map((i) => ({ ...i, id: `${i.id}-hi` })),
    ];
    const plain = buildDeedRun(input({ poolItems: items, masteryBySkill: { "read-g3": 2 }, questionCount: 3 }));
    const boosted = buildDeedRun(input({ poolItems: items, masteryBySkill: { "read-g3": 2 }, questionCount: 3, levelBoost: 1 }));
    expect(plain.questions.every((q) => q.id.endsWith("-lo"))).toBe(true);
    expect(boosted.questions.every((q) => q.id.endsWith("-hi"))).toBe(true);
  });
  it("asks exactly the challenge's three questions with nothing mixed in", () => {
    const run = buildDeedRun(input({ deed: deedMath, grade: "3", poolItems: [], masteryBySkill: at(2), questionCount: CHALLENGE.questions, levelBoost: CHALLENGE.levelBoost, dueSkillIds: [], recentMisses: [] }));
    expect(run.questions).toHaveLength(3);
  });
});

describe("buildDeedRun keeps its output as deeds name a mechanic", () => {
  // Question ids recorded BEFORE the engine was threaded with `mechanic`; they must not move. The
  // math deeds are `measure` now, so a draw of a benched skill (area-perimeter, frac-unit, ...) is
  // re-recorded below; every other entry here is byte-identical, and the choice path is pinned apart.
  const reading = poolItems("read-g3", 30);
  const ids = (deed: typeof deedMath, seed: number, over: Partial<BuildRunInput> = {}) =>
    buildDeedRun(input({ deed, seed, poolItems: reading, dueSkillIds: ["div-facts", "read-g3"], ...over })).questions.map((q) => q.id);
  const RECORDED: Record<string, string[]> = {
    "well-stones@1": ["round-nearest:69@10", "round-nearest:99@10", "round-nearest:73@10", "round-nearest:46@10", "div-facts:6/1", "round-nearest:33@10", "round-nearest:723@10", "round-nearest:631@10"],
    "well-stones@42": ["round-nearest:35@10", "round-nearest:63@10", "div-facts:11/1", "round-nearest:28@10", "round-nearest:155@10", "round-nearest:948@10", "round-nearest:37@10", "round-nearest:13@10"],
    // Re-recorded: area-perimeter is on the bench, so the run is played there (the div-facts review stays choice).
    "well-stones@20261110": ["area-perimeter:cut:area:5x2", "area-perimeter:cut:area:5x3", "area-perimeter:cut:per:2x2", "area-perimeter:cut:area:4x4", "area-perimeter:cut:per:4x4", "area-perimeter:cut:per:3x5", "area-perimeter:cut:per:5x3", "div-facts:10/1"],
    // Re-recorded (H7): the reading side quest is a trail, so a grade-3 run is four `read-g3` clues of
    // whole trails, in trail order. Its choice twin below holds the ids it drew before, unchanged.
    "well-signs@1": ["read-g3:trail:091c3f6f", "read-g3:trail:081c3ddc", "read-g3:trail:0b1c4295", "read-g3:trail:0858f428"],
    "well-signs@42": ["read-g3:trail:d3141c67", "read-g3:trail:d2141ad4", "read-g3:trail:d5141f8d", "read-g3:trail:0858f428"],
    "well-signs@20261110": ["read-g3:trail:25cb3885", "read-g3:trail:24cb36f2", "read-g3:trail:23cb355f", "read-g3:trail:948a2acf"],
  };
  it.each(Object.entries(RECORDED))("%s asks the same questions in the same order", (key, expected) => {
    const [deedId, seed] = key.split("@");
    expect(ids(findDeed(deedId)!, Number(seed))).toEqual(expected);
  });

  // The choice path, proven unchanged: with hands-on kinds off, each deed draws what it always drew.
  const RECORDED_CHOICE: Record<string, string[]> = {
    "well-stones@1": RECORDED["well-stones@1"],
    "well-stones@42": RECORDED["well-stones@42"],
    "well-stones@20261110": ["area-perimeter:4x2a", "area-perimeter:5x1a", "div-facts:10/1", "area-perimeter:4x3a", "area-perimeter:1x4a", "area-perimeter:3x2a", "area-perimeter:2x1a", "area-perimeter:8x4a"],
    // Recorded before any deed named a mechanic; a trail deed with trails off is the eight it always was.
    "well-signs@1": ["read-g3-item-14", "read-g3-item-24", "read-g3-item-8", "read-g3-item-10", "read-g3-item-16", "read-g3-item-6", "read-g3-item-11", "read-g3-item-12"],
    "well-signs@42": ["read-g3-item-26", "read-g3-item-25", "read-g3-item-1", "read-g3-item-16", "read-g3-item-28", "read-g3-item-7", "read-g3-item-2", "read-g3-item-27"],
    "well-signs@20261110": ["read-g3-item-18", "read-g3-item-10", "read-g3-item-14", "read-g3-item-19", "read-g3-item-5", "read-g3-item-28", "read-g3-item-16", "read-g3-item-23"],
  };
  it.each(Object.entries(RECORDED_CHOICE))("%s with hands-on kinds off asks the old questions in the old order", (key, expected) => {
    const [deedId, seed] = key.split("@");
    expect(ids(findDeed(deedId)!, Number(seed), { enabledKinds: CHOICE_ONLY })).toEqual(expected);
  });

  it("leaves `kind` off a choice task, as stored runs have none, and puts it on a benched skill's task", () => {
    // Seed 20261110 draws area-perimeter (benched) with a div-facts review (not benched).
    const run = buildDeedRun(input({ deed: deedMath, grade: "3", poolItems: [], seed: 20261110, dueSkillIds: ["div-facts"] }));
    const benched = run.questions.filter((q) => q.skillId in BENCH);
    const rest = run.questions.filter((q) => !(q.skillId in BENCH));
    expect(benched.length).toBeGreaterThan(0);
    expect(rest.length).toBeGreaterThan(0);
    for (const q of benched) expect((q as Task).kind).toBe("measure");
    for (const q of rest) expect("kind" in q).toBe(false);
  });
  it("leaves `kind` off every task of a choice-pinned math run", () => {
    const run = buildDeedRun(input({ deed: deedMath, grade: "3", poolItems: [], seed: 20261110, dueSkillIds: ["div-facts"], enabledKinds: CHOICE_ONLY }));
    expect(run.questions.length).toBeGreaterThan(0);
    for (const q of run.questions) expect("kind" in q).toBe(false);
  });
});

describe("drawForSkill", () => {
  it("draws `count` distinct questions for a generator skill", () => {
    const skill = SKILLS.find((s) => s.id === "mul-facts")!;
    const qs = drawForSkill(skill, 2, 5, seededRng(7), [], new Set(), new Set());
    expect(qs).toHaveLength(5);
    expect(new Set(qs.map((q) => q.id)).size).toBe(5);
    expect(qs.every((q) => q.skillId === "mul-facts")).toBe(true);
  });
  it("draws a pool skill's items, skipping other skills' and excluded ones", () => {
    const skill = SKILLS.find((s) => s.id === "read-g3")!;
    const items = [...poolItems("read-g3", 6), ...poolItems("read-g4", 6)];
    const qs = drawForSkill(skill, 2, 4, seededRng(7), items, new Set(["read-g3-item-0"]), new Set());
    expect(qs).toHaveLength(4);
    expect(qs.every((q) => q.skillId === "read-g3" && q.id !== "read-g3-item-0")).toBe(true);
  });
});

describe("selectSkills with focus skills", () => {
  const two = ["mul-facts", "div-facts"].map((id) => SKILLS.find((s) => s.id === id)!);
  const firstPick = (seed: number, focus?: ReadonlySet<string>) => selectSkills(two, {}, seededRng(seed), {}, focus)[0].id;

  it("draws a focus skill at least 2.5 times as often as an equally-weighted one", () => {
    let focused = 0;
    for (let seed = 1; seed <= 1000; seed++) if (firstPick(seed, new Set(["mul-facts"])) === "mul-facts") focused++;
    const other = 1000 - focused;
    expect(focused).toBeGreaterThanOrEqual(2.5 * other);
    expect(other).toBeGreaterThan(0); // a focus skill never locks the others out
  });

  it("is today's output, with the same rng use, when the focus set is empty or absent", () => {
    const candidates = chooseSkills(deedMath, "3");
    for (let seed = 1; seed <= 200; seed++) {
      const plain = seededRng(seed);
      const empty = seededRng(seed);
      const a = selectSkills(candidates, { "mul-facts": 3 }, plain, { "mul-facts": 5 });
      const b = selectSkills(candidates, { "mul-facts": 3 }, empty, { "mul-facts": 5 }, new Set());
      expect(b.map((s) => s.id)).toEqual(a.map((s) => s.id));
      expect(empty()).toBe(plain());
    }
  });

  it("scales a focus skill's weight by FOCUS_WEIGHT whatever its mastery", () => {
    expect(FOCUS_WEIGHT).toBe(3);
  });

  it("threads focusSkillIds through buildDeedRun", () => {
    const base = input({ deed: deedMath, grade: "3", poolItems: [], questionCount: 1 });
    const firstSkill = (seed: number, focusSkillIds?: string[]) => buildDeedRun({ ...base, seed, focusSkillIds }).skillIds[0];
    let focused = 0;
    for (let seed = 1; seed <= 300; seed++) if (firstSkill(seed, ["div-facts"]) === "div-facts") focused++;
    let plain = 0;
    for (let seed = 1; seed <= 300; seed++) if (firstSkill(seed) === "div-facts") plain++;
    expect(focused).toBeGreaterThan(plain);
  });
});

describe("a focus skill a grade off the hero's own", () => {
  // The focus window reaches one grade either side; `chooseSkills` serves the hero's grade only.
  const servedSkills = (over: Partial<BuildRunInput>, seeds = 300) => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= seeds; seed++) for (const id of buildDeedRun(input({ ...over, seed })).skillIds) seen.add(id);
    return seen;
  };

  it("adds nothing to chooseSkills when there is no focus, for every deed strand and grade", () => {
    // Reading is left out: its trail-only rows are filtered by `runCandidates` and not by `chooseSkills` (R-H8, below).
    for (const deed of [deedMath, deedLanguage, deedScience]) {
      for (const g of GRADES) expect(runCandidates(deed, g, [])).toEqual(chooseSkills(deed, g));
    }
    for (const g of ["K", "1", "2", "3", "4", "5"] as const) expect(runCandidates(choiceReading, g, [])).toEqual(chooseSkills(choiceReading, g));
    expect(runCandidates(deedMath, "3", ["add-100", "read-g4", "nope", "add-100", "mul-facts"]).map((s) => s.id))
      .toEqual([...chooseSkills(deedMath, "3").map((s) => s.id), "add-100"]);
  });

  it("leaves a science deed's candidates unchanged for a logic focus id", () => {
    for (const g of GRADES) {
      expect(runCandidates(deedScience, g, ["logic-g23", "logic-g45"]).map((s) => s.id))
        .toEqual(chooseSkills(deedScience, g).map((s) => s.id));
    }
  });

  it("is a candidate for a deed in its own strand: a grade-2 math focus comes up for a grade-3 hero", () => {
    expect(chooseSkills(deedMath, "3").map((s) => s.id)).not.toContain("add-100");
    expect(servedSkills({ deed: deedMath, grade: "3", poolItems: [], focusSkillIds: ["add-100"] })).toContain("add-100");
  });

  it("is a candidate for a pool strand too, drawing the focus pool's own items", () => {
    const items = [...poolItems("read-g3", 30), ...poolItems("read-g4", 30)];
    const run = (seed: number) => buildDeedRun(input({ deed: choiceReading, grade: "3", poolItems: items, focusSkillIds: ["read-g4"], seed }));
    let served = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = run(seed);
      if (!r.skillIds.includes("read-g4")) continue;
      served++;
      expect(r.questions.some((q) => q.skillId === "read-g4")).toBe(true);
    }
    expect(served).toBeGreaterThan(0);
  });

  it("never comes up in a deed of another strand", () => {
    expect(servedSkills({ deed: deedMath, grade: "3", poolItems: [], focusSkillIds: ["read-g4", "spell-g45"] }))
      .not.toContain("read-g4");
    const reading = servedSkills({ deed: choiceReading, grade: "3", focusSkillIds: ["add-100", "spell-g45"] });
    expect(reading).not.toContain("add-100");
    expect(reading).not.toContain("spell-g45");
  });

  it("can come back as a due skill once it is a candidate", () => {
    // Mastered, so it is rarely the draw; when it is not, it arrives as one of the due skills.
    const run = buildDeedRun(input({
      deed: deedMath, grade: "3", poolItems: [], focusSkillIds: ["add-100"], dueSkillIds: ["add-100"],
      masteryBySkill: { "add-100": 4 }, lastPracticedBySkill: {}, seed: 7,
    }));
    expect(run.skillIds).toContain("add-100");
  });
});

describe("applyProfile", () => {
  const qs: Question[] = [
    { id: "a", skillId: "mul-facts", prompt: "2 x 3?", choices: ["6", "5", "8", "9"], answer: "6" },
    { id: "b", skillId: "mul-facts", prompt: "3 x 3?", choices: ["12", "9", "6", "8"], answer: "9" },
    { id: "c", skillId: "read-g3", prompt: "Main idea?", choices: ["x", "y"], answer: "y" },
  ];

  it("leaves the tasks alone, and draws nothing, when fewer choices is off", () => {
    const rng = seededRng(3);
    const twin = seededRng(3);
    const routine = { ...profile, predictableRoutine: true };
    expect(applyProfile(qs, routine, rng)).toBe(qs);
    expect(rng()).toBe(twin());
  });

  it("with fewer choices, every task offers its answer and exactly one other", () => {
    const out = applyProfile(qs, { ...profile, fewerChoices: true }, seededRng(3));
    expect(out.map((q) => q.id)).toEqual(["a", "b", "c"]);
    for (const [i, q] of out.entries()) {
      expect(q.choices).toHaveLength(2);
      expect(q.choices).toContain(qs[i].answer);
      expect(qs[i].choices).toEqual(expect.arrayContaining(q.choices));
    }
  });

  it("is what buildDeedRun applies: recorded fewer-choices runs ask the same choices in the same order", () => {
    // Recorded before the rule moved into applyProfile; they must not move. Pinned to the choice path
    // (hands-on kinds off), since `well-signs` is a trail since H7 and these are about choices.
    const RECORDED: Record<string, string[]> = {
      "well-stones@1": ["round-nearest:69@10=69|70", "round-nearest:99@10=100|98", "round-nearest:73@10=70|100", "round-nearest:46@10=40|50", "div-facts:6/1=6|16", "round-nearest:33@10=30|27", "round-nearest:723@10=700|720", "round-nearest:631@10=630|631"],
      "well-stones@1+routine": ["round-nearest:46@10=40|50", "round-nearest:631@10=630|631", "round-nearest:99@10=100|98", "round-nearest:33@10=27|30", "round-nearest:723@10=700|720", "round-nearest:73@10=100|70", "round-nearest:69@10=69|70", "div-facts:6/1=16|6"],
      "well-signs@1": ["read-g3-item-14=A14|C14", "read-g3-item-24=D24|A24", "read-g3-item-8=C8|A8", "read-g3-item-10=A10|B10", "read-g3-item-16=B16|A16", "read-g3-item-6=A6|B6", "read-g3-item-11=A11|D11", "read-g3-item-12=A12|B12"],
      "well-signs@1+routine": ["read-g3-item-14=C14|A14", "read-g3-item-24=A24|D24", "read-g3-item-12=A12|B12", "read-g3-item-8=A8|C8", "read-g3-item-11=A11|D11", "read-g3-item-6=A6|B6", "read-g3-item-16=A16|B16", "read-g3-item-10=A10|B10"],
    };
    for (const [key, expected] of Object.entries(RECORDED)) {
      const [deedId, rest] = key.split("@");
      const routine = rest.endsWith("+routine");
      const run = buildDeedRun(input({
        deed: findDeed(deedId)!, seed: Number(rest.replace("+routine", "")), poolItems: poolItems("read-g3", 30),
        dueSkillIds: ["div-facts", "read-g3"], profile: { ...profile, fewerChoices: true, predictableRoutine: routine }, enabledKinds: CHOICE_ONLY,
      }));
      expect(choices(run.questions).map((q) => `${q.id}=${q.choices.join("|")}`)).toEqual(expected);
    }
  });
});

describe("a draw knows the kind", () => {
  // A stand-in kind, so the draw path is pinned apart from any real one: its definition is put in the
  // registry for the length of one test (the only registry seam, local to this file) and its drawer
  // through `__setDrawerForTest`. "stub" is no `TaskKind`, hence the casts.
  const STUB = "stub" as unknown as TaskKind;
  const stubDeed = { ...deedMath, mechanic: STUB };
  const enabled = new Set<TaskKind>([STUB]);
  const registry = TASK_KINDS as unknown as Record<string, unknown>;

  function useStub(presents: (skillId: string) => boolean, drawer: TaskDrawer) {
    registry.stub = { ...choiceKind, presents };
    __setDrawerForTest("stub", drawer);
  }
  /** A stub task whose id is `n`, and which carries a field no choice task has. */
  const stubTask = (skillId: string, n: number): Task =>
    ({ kind: "stub", id: `stub:${skillId}:${n}`, skillId, prompt: "Same prompt", marker: true }) as unknown as Task;
  const stubRun = (over: Partial<BuildRunInput> = {}) =>
    buildDeedRun(input({ deed: stubDeed, enabledKinds: enabled, poolItems: [], ...over }));

  afterEach(() => {
    delete registry.stub;
    __setDrawerForTest("stub", null);
  });

  it("draws a skill its kind presents through that kind's drawer, and does not relabel it", () => {
    let n = 0;
    useStub((id) => id === "div-facts", (skill) => stubTask(skill.id, n++));
    const run = stubRun({ seed: 1, dueSkillIds: ["div-facts"] });
    const stubs = run.questions.filter((q) => kindOf(q) === STUB);
    expect(stubs).toHaveLength(1);
    expect(stubs[0]).toMatchObject({ kind: "stub", skillId: "div-facts", marker: true });
    // Every other skill stays a plain choice: no `kind` key, as stored runs have none.
    const rest = run.questions.filter((q) => kindOf(q) !== STUB);
    expect(rest).toHaveLength(7);
    for (const q of rest) {
      expect("kind" in q).toBe(false);
      expect(q.skillId).not.toBe("div-facts");
    }
  });

  it("draws the fresh questions through the drawer too, and keeps same-prompt tasks (the prompt filter is for choices)", () => {
    let n = 0;
    useStub(() => true, (skill) => stubTask(skill.id, n++));
    const run = stubRun({ seed: 1 });
    expect(run.questions).toHaveLength(8);
    expect(run.questions.every((q) => kindOf(q) === STUB && "marker" in q)).toBe(true);
    expect(new Set(run.questions.map((q) => q.id)).size).toBe(8);
  });

  it("deduplicates a drawer by id, and a drawer that runs dry gives a shorter run rather than an error", () => {
    let n = 0;
    useStub(() => true, (skill) => stubTask(skill.id, n++ % 3));
    const run = stubRun({ seed: 1 });
    expect(run.questions.map((q) => q.id).sort()).toHaveLength(3);
    expect(new Set(run.questions.map((q) => q.id)).size).toBe(3);
  });

  it("refills a short skill through the drawer as well", () => {
    // Two skills (one due, so one fresh pick plus one due pick would not short-fall); one skill
    // alone that can only give 2 of its 8 and then none: the refill asks again and is still the kind.
    const calls: number[] = [];
    let n = 0;
    useStub(() => true, (skill) => { calls.push(n); return n < 2 ? stubTask(skill.id, n++) : null; });
    const run = stubRun({ seed: 1 });
    expect(run.questions).toHaveLength(2);
    expect(run.questions.every((q) => kindOf(q) === STUB)).toBe(true);
    // The first pass asked up to its attempt bound and the refill asked again.
    expect(calls.length).toBeGreaterThan(8 * 20);
  });

  it("ignores a stub kind that is not enabled: the skill is a choice", () => {
    useStub(() => true, () => { throw new Error("must not draw"); });
    const run = buildDeedRun(input({ deed: stubDeed, enabledKinds: new Set<TaskKind>(), poolItems: [] }));
    expect(run.questions).toHaveLength(8);
    expect(run.questions.every((q) => !("kind" in q))).toBe(true);
  });

  describe("drawForSkill", () => {
    const skill = SKILLS.find((s) => s.id === "mul-facts")!;

    it("draws a choice exactly as it did when no kind is named", () => {
      const a = drawForSkill(skill, 2, 5, seededRng(7), [], new Set(), new Set());
      const b = drawForSkill(skill, 2, 5, seededRng(7), [], new Set(), new Set(), "choice");
      expect(b).toEqual(a);
    });
    it("asks the drawer for at most count * 20 tasks, deduping by id and honouring exclusions", () => {
      let asked = 0;
      useStub(() => true, (s) => { asked += 1; return stubTask(s.id, asked % 4); });
      const kind = STUB;
      const drawn = drawForSkill(skill, 2, 6, seededRng(7), [], new Set([`stub:mul-facts:0`]), new Set(), kind);
      expect(drawn.map((t) => t.id).sort()).toEqual(["stub:mul-facts:1", "stub:mul-facts:2", "stub:mul-facts:3"]);
      expect(asked).toBe(6 * 20);
    });
    it("returns nothing, and does not throw, for a kind with no drawer", () => {
      expect(drawForSkill(skill, 2, 4, seededRng(7), [], new Set(), new Set(), "nothing" as unknown as TaskKind)).toEqual([]);
    });
  });

  describe("applyProfile", () => {
    const choices: Question[] = [
      { id: "a", skillId: "mul-facts", prompt: "2 x 3?", choices: ["6", "5", "8", "9"], answer: "6" },
      { id: "b", skillId: "mul-facts", prompt: "3 x 3?", choices: ["12", "9", "6", "8"], answer: "9" },
    ];
    const odd = { kind: "stub", id: "s", skillId: "mul-facts", prompt: "Cut", answer: "3/4" } as unknown as Task;
    const fewer = { ...profile, fewerChoices: true };

    it("leaves a non-choice task as it is, and draws for the choices alone", () => {
      const withOdd = seededRng(3);
      const alone = seededRng(3);
      const mixed = applyProfile<Task>([choices[0], odd, choices[1]], fewer, withOdd);
      const only = applyProfile(choices, fewer, alone);
      expect(mixed[1]).toBe(odd);
      expect([mixed[0], mixed[2]]).toEqual(only);
      expect(withOdd()).toBe(alone());
    });
  });
});

describe("a measure miss comes back only where the bench plays its skill (R-C6)", () => {
  // No skill is on the bench until the generators land, so one is put there for each test.
  const bench = BENCH as Record<string, unknown>;
  // From the choice reading deed: the shipped one is a trail, whose questionCount and walk would leak in.
  const measureDeed = { ...choiceReading, mechanic: "measure" as TaskKind };
  let n = 0;
  const benchTask = (skillId: string): MeasureTask => ({
    kind: "measure", id: `bench:${skillId}:${n++}`, skillId, prompt: "Cut it", mode: "cut", unit: "ft", answer: "3/4", bridge: "3/4",
  });
  const miss: MeasureTask = { ...benchTask("read-g3"), id: "miss-m" };
  const run = (enabledKinds: ReadonlySet<TaskKind> | undefined) =>
    buildDeedRun(input({ deed: measureDeed, recentMisses: [miss], enabledKinds }));
  const onBench = () => {
    bench["read-g3"] = (_level: number, _rng: unknown, skillId: string) => benchTask(skillId);
  };

  afterEach(() => {
    delete bench["read-g3"];
  });

  it("is kept when the deed is played by measuring, measuring is on, and the bench holds the skill", () => {
    onBench();
    for (const enabled of [undefined, new Set<TaskKind>(["measure"])]) {
      const built = run(enabled);
      expect(built.questions.map((q) => q.id)).toContain("miss-m");
      expect(built.questions.every((q) => kindOf(q) === "measure")).toBe(true);
    }
  });

  it("is dropped when measuring is off, and the run is all choices", () => {
    onBench();
    for (const enabled of [new Set<TaskKind>(), new Set<TaskKind>(["choice"])]) {
      const built = run(enabled);
      expect(built.questions.map((q) => q.id)).not.toContain("miss-m");
      expect(choices(built.questions)).toHaveLength(8);
    }
  });

  it("is dropped when the bench does not hold the skill, even with measuring on", () => {
    const built = run(new Set<TaskKind>(["measure"]));
    expect(built.questions.map((q) => q.id)).not.toContain("miss-m");
    expect(choices(built.questions)).toHaveLength(8);
  });
});

describe("a logic skill is never drawn as choice", () => {
  const logic = skillsFor("logic", "2")[0];

  it("draws nothing as choice, and does not throw", () => {
    expect(logic.id).toBe("logic-g23");
    expect(() => drawForSkill(logic, 2, 5, seededRng(7), [], new Set(), new Set())).not.toThrow();
    expect(drawForSkill(logic, 2, 5, seededRng(7), [], new Set(), new Set(), "choice")).toEqual([]);
  });

  it("is never picked by selectSkills, whatever else is on offer", () => {
    expect(selectSkills([logic], {}, seededRng(1))).toEqual([]);
    const mixed = [...skillsFor("math", "3"), logic];
    for (let seed = 1; seed <= 50; seed++) {
      expect(selectSkills(mixed, {}, seededRng(seed), {}, new Set([logic.id])).map((s) => s.id)).not.toContain(logic.id);
    }
  });
});

describe("science side quests sort on a lock's face (R-F11)", () => {
  afterEach(() => __setSortPoolsForTest(null));
  const LOCKS_ON: ReadonlySet<TaskKind> = new Set<TaskKind>(["measure", "lock"]);
  const SCIENCE_DEEDS = ["well-water", "mill-wheel", "chapel-stars", "watchtower-signals", "garden-bees"];
  /** The science pool skill a grade's science side quest asks, with 30 choice items of its own (for the choice path). */
  const scienceAt = (grade: (typeof GRADES)[number]) => {
    const [skill] = chooseSkills(deedScience, grade);
    return { skill, items: poolItems(skill.id, 30) };
  };

  it("names the five science side quests as locks, and only them", () => {
    expect(DEEDS.filter((d) => d.mechanic === "lock").map((d) => d.id).sort()).toEqual([...SCIENCE_DEEDS].sort());
    for (const d of DEEDS.filter((x) => x.area === "science")) expect(d.mechanic, d.id).toBe("lock");
  });

  it("plays every grade's science side quest as sorts from that grade's pool, the solution kept off the view", () => {
    for (const grade of GRADES) {
      const { skill, items } = scienceAt(grade);
      for (const deedId of SCIENCE_DEEDS) {
        const run = buildDeedRun(input({ deed: findDeed(deedId)!, grade, poolItems: items, seed: 11, enabledKinds: LOCKS_ON }));
        expect(run.questions.length, `${deedId} at ${grade}`).toBe(deedScience.questionCount);
        for (const t of run.questions) {
          expect(t.skillId).toBe(skill.id);
          expect(kindOf(t)).toBe("lock");
          expect((t as LockTask).puzzle).toBe("sort");
          expect(JSON.stringify(TASK_KINDS.lock.toView(t as LockTask))).not.toMatch(/solution|fits/);
        }
      }
    }
  });

  it("with locks off (or at the gate) is the multiple-choice side quest it always was, at every grade", () => {
    for (const grade of GRADES) {
      const { skill, items } = scienceAt(grade);
      const run = buildDeedRun(input({ deed: deedScience, grade, poolItems: items, seed: 11, enabledKinds: new Set<TaskKind>(["measure"]) }));
      // The whole length a multiple-choice side quest always had (RF-j shortens only the sorts).
      expect(run.questions.length).toBe(SIDE_QUEST_QUESTIONS);
      for (const t of choices(run.questions)) expect(t.skillId).toBe(skill.id);
    }
  });

  it("a science skill no sort pool credits falls back to choice at the whole length: half is for sorts only (RF-j)", () => {
    __setSortPoolsForTest([]);
    const { items } = scienceAt("2");
    const run = buildDeedRun(input({ deed: deedScience, grade: "2", poolItems: items, seed: 11, enabledKinds: LOCKS_ON }));
    expect(run.questions.length).toBe(SIDE_QUEST_QUESTIONS);
    choices(run.questions);
    const longer = buildDeedRun(input({ deed: deedScience, grade: "2", poolItems: items, seed: 11, enabledKinds: LOCKS_ON, sideQuestLength: 12 }));
    expect(longer.questions.length).toBe(12);
  });

  it("a science run that draws sorts is half the grown-up's length, rounded (RF-j)", () => {
    const { items } = scienceAt("2");
    for (const [length, sorts] of [[8, 4], [12, 6], [5, 3]] as const) {
      const run = buildDeedRun(input({ deed: deedScience, grade: "2", poolItems: items, seed: 11, enabledKinds: LOCKS_ON, sideQuestLength: length }));
      expect(run.questions.length, `${length}`).toBe(sorts);
      for (const t of run.questions) expect(kindOf(t)).toBe("lock");
    }
  });

  // Recorded AFTER the science deeds named `lock`, and re-recorded for RF-j (four sorts, each from its
  // own set), with the default `enabledKinds`, every kind on: the same seeds ask the same sorts in the same order. The ids name sort-pool sets and items, so an edit to
  // `sort-science-g23.json` that adds or renames items re-records this; the twin below never moves.
  const SCIENCE_LOCK: Record<string, string[]> = {
    "well-water@1": [
      "science-g23:sort:sort-science-g23:solid-liquid:fa4635be,73cc7d76,a40bf1f0,fcb6a3ab,be6c25fa,80034cfe",
      "science-g23:sort:sort-science-g23:living:f372e4e9,d9644242,4b58189c,379e5fc0,5f1320b6,0eb5a579",
      "science-g23:sort:sort-science-g23:plants-animals:d712267a,6c899331,0e5f43b8,fd007e8a,09c59ea2,47292f7e",
      "science-g23:sort:sort-science-g23:magnetic:3a198686,b9ffe423,00e27cd7,b1d89406,fcf3772e,dfefd155",
    ],
    "well-water@42": [
      "science-g23:sort:sort-science-g23:solid-liquid:a40bf1f0,73cc7d76,be6c25fa,80034cfe,44c34c87,48b01616",
      "science-g23:sort:sort-science-g23:magnetic:b1d89406,dfefd155,1cad23d2,fcf3772e,00e27cd7,b5d709a0",
      "science-g23:sort:sort-science-g23:plants-animals:4b670274,d712267a,0e5f43b8,25b9afd5,3bef5f1c,a7a4a268",
      "science-g23:sort:sort-science-g23:living:77698475,5f1320b6,14952583,59d6749e,e791167b,f372e4e9",
    ],
    "well-water@20261110": [
      "science-g23:sort:sort-science-g23:magnetic:00e27cd7,b1d89406,b9ffe423,1cad23d2,dfefd155,fcf3772e",
      "science-g23:sort:sort-science-g23:plants-animals:0e5f43b8,3bef5f1c,25b9afd5,a7a4a268,4b670274,47292f7e",
      "science-g23:sort:sort-science-g23:solid-liquid:fcb6a3ab,73cc7d76,80034cfe,a40bf1f0,48b01616,44c34c87",
      "science-g23:sort:sort-science-g23:living:77698475,e791167b,5f1320b6,f372e4e9,59d6749e,14952583",
    ],
  };

  // Recorded BEFORE the science deeds named `lock` (the default `enabledKinds`, every kind on): with
  // locks off the same seeds ask the same pool items in the same order (the choice-pinned twin).
  const SCIENCE_CHOICE: Record<string, string[]> = {
    "well-water@1": ["science-g23-item-14", "science-g23-item-24", "science-g23-item-8", "science-g23-item-10", "science-g23-item-16", "science-g23-item-6", "science-g23-item-11", "science-g23-item-12"],
    "well-water@42": ["science-g23-item-26", "science-g23-item-25", "science-g23-item-1", "science-g23-item-16", "science-g23-item-28", "science-g23-item-7", "science-g23-item-2", "science-g23-item-27"],
    "well-water@20261110": ["science-g23-item-18", "science-g23-item-10", "science-g23-item-14", "science-g23-item-19", "science-g23-item-5", "science-g23-item-28", "science-g23-item-16", "science-g23-item-23"],
  };
  const scienceIds = (seed: number, over: Partial<BuildRunInput> = {}) =>
    buildDeedRun(input({ deed: deedScience, grade: "2", seed, poolItems: poolItems("science-g23", 30), ...over })).questions.map((q) => q.id);

  it.each(Object.entries(SCIENCE_LOCK))("%s asks the same sorts in the same order", (key, expected) => {
    expect(scienceIds(Number(key.split("@")[1]))).toEqual(expected);
  });

  it.each(Object.entries(SCIENCE_CHOICE))("%s with hands-on kinds off asks the old questions in the old order", (key, expected) => {
    expect(scienceIds(Number(key.split("@")[1]), { enabledKinds: CHOICE_ONLY })).toEqual(expected);
  });
});

describe("a science side quest's sorts each come from their own set (RF-j)", () => {
  /** "pool:set" of a sort lock's id (`<skill>:sort:<pool>:<set>:<items>`). */
  const setOf = (t: Task) => t.id.split(":").slice(2, 4).join(":");
  /** How many sets each science skill's pool holds, from the shipped pools. */
  const setsIn = (skillId: string) => new Set(Array.from({ length: 400 }, (_, seed) =>
    drawForSkill(SKILLS.find((s) => s.id === skillId)!, 2, 1, seededRng(seed), [], new Set(), new Set(), "lock").map(setOf)).flat()).size;
  const run = (grade: (typeof GRADES)[number], seed: number) =>
    buildDeedRun(input({ deed: deedScience, grade, seed, poolItems: [] })).questions;

  it("a grade-2 run's four sorts use four different sets, its pool having four", () => {
    expect(setsIn("science-g23")).toBe(4);
    for (const seed of [1, 42, 20261110]) {
      const tasks = run("2", seed);
      expect(tasks).toHaveLength(4);
      expect(new Set(tasks.map(setOf)).size).toBe(4);
    }
  });

  it("across 50 seeds and every band, no run repeats a set while its pool still has one unused", () => {
    for (const grade of ["K", "2", "4", "6", "9"] as const) {
      const [skill] = chooseSkills(deedScience, grade);
      const pool = setsIn(skill.id);
      for (let seed = 1; seed <= 50; seed++) {
        const sets = run(grade, seed).map(setOf);
        const distinct = new Set(sets).size;
        expect(distinct, `${grade} seed ${seed}: ${sets.join(" ")}`).toBe(Math.min(sets.length, pool));
      }
    }
  });

  it("is the same run for the same seed", () => {
    for (const seed of [3, 4, 5]) expect(run("2", seed).map((t) => t.id)).toEqual(run("2", seed).map((t) => t.id));
  });

  it("keeps the rule that one id is one puzzle: every drawn sort rebuilds from its id alone", () => {
    for (const t of run("6", 7)) expect(sortTaskFromId(t.id)).toEqual(t);
  });
});

describe("a grown-up's vocabulary focus is sorted on a lock's face (R-F11)", () => {
  const LOCKS_ON: ReadonlySet<TaskKind> = new Set<TaskKind>(["measure", "lock"]);
  const items = [...poolItems("spell-g45", 30), ...poolItems("vocab-g45", 30)];
  /** Every task a grade-5 language side quest asked of `skillId` across seeds, with the given focus and switches. */
  function tasksOf(skillId: string, focusSkillIds: string[], enabledKinds: ReadonlySet<TaskKind>): Task[] {
    const out: Task[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const run = buildDeedRun(input({ deed: deedLanguage, grade: "5", poolItems: items, seed, focusSkillIds, enabledKinds }));
      out.push(...run.questions.filter((q) => q.skillId === skillId));
    }
    return out;
  }

  it("asks a focused vocabulary skill as word sorts in a language side quest", () => {
    const tasks = tasksOf("vocab-g45", ["vocab-g45"], LOCKS_ON);
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) {
      expect(kindOf(t)).toBe("lock");
      expect((t as LockTask).puzzle).toBe("sort");
    }
  });

  it("leaves vocabulary as multiple choice when it is not a focus, or when locks are off", () => {
    const plain = tasksOf("vocab-g45", [], LOCKS_ON);
    expect(plain.length).toBeGreaterThan(0);
    choices(plain);
    const off = tasksOf("vocab-g45", ["vocab-g45"], new Set<TaskKind>(["measure"]));
    expect(off.length).toBeGreaterThan(0);
    choices(off);
  });

  it("leaves a focus no lock presents as it was: spelling stays choice, and a benched math focus stays on the bench", () => {
    const spelling = tasksOf("spell-g45", ["spell-g45"], LOCKS_ON);
    expect(spelling.length).toBeGreaterThan(0);
    choices(spelling);
    const math = buildDeedRun(input({ deed: deedMath, grade: "3", poolItems: [], seed: 20261110, focusSkillIds: ["area-perimeter"], enabledKinds: LOCKS_ON }));
    const benched = math.questions.filter((q) => q.skillId === "area-perimeter");
    expect(benched.length).toBeGreaterThan(0);
    for (const t of benched) expect(kindOf(t)).toBe("measure");
  });
});

describe("a run draws only what it can play (R-H8)", () => {
  const ids = (deed: Deed, g: (typeof GRADES)[number], focus: readonly string[] = [], on: ReadonlySet<TaskKind> = ALL_ON) =>
    runCandidates(deed, g, focus, on).map((s) => s.id);

  it("keeps reading multiple choice where trails cannot play: every grade 6 to 12 is read-g4", () => {
    for (const g of ["6", "7", "8", "9", "10", "11", "12"] as const) expect(ids(choiceReading, g), `grade ${g}`).toEqual(["read-g4"]);
  });

  it("never gives a reader an empty run: K and 2 keep their sight words, 1 and 3 and 4 and 5 their pools (Review Focus 3)", () => {
    expect(ids(choiceReading, "K")).toEqual(["sight-k1"]);
    expect(ids(choiceReading, "2")).toEqual(["sight-g23"]);
    expect(ids(choiceReading, "1")).toEqual(["read-g1"]);
    expect(ids(choiceReading, "3")).toEqual(["read-g3"]);
    expect(ids(choiceReading, "4")).toEqual(["read-g4"]);
    expect(ids(choiceReading, "5")).toEqual(["read-g4"]);
    for (const g of GRADES) expect(ids(choiceReading, g).length, `grade ${g}`).toBeGreaterThan(0);
  });

  it("changes nothing for math, science and language at any grade, with every kind on, none on, or no set at all", () => {
    for (const deed of [deedMath, deedLanguage, deedScience]) {
      for (const g of GRADES) {
        const all = chooseSkills(deed, g).map((s) => s.id);
        expect(ids(deed, g), `${deed.area} ${g} all on`).toEqual(all);
        expect(runCandidates(deed, g, [], CHOICE_ONLY).map((s) => s.id), `${deed.area} ${g} none on`).toEqual(all);
        expect(runCandidates(deed, g).map((s) => s.id), `${deed.area} ${g} no set`).toEqual(all);
      }
    }
  });

  it("leaves a grade-6+ reading focus on a trail skill out of a choice run, and keeps one a choice run can draw", () => {
    expect(ids(choiceReading, "7", ["read-g6", "read-g9"])).toEqual(["read-g4"]);
    expect(ids(choiceReading, "3", ["read-g6"])).toEqual(["read-g3"]);
    expect(ids(choiceReading, "3", ["read-g4", "read-g6"])).toEqual(["read-g3", "read-g4"]);
  });

  describe("when the deed's mechanic presents a trail skill", () => {
    const trailReading = { ...choiceReading, mechanic: "trail" as const };
    const TRAILS_ON: ReadonlySet<TaskKind> = new Set<TaskKind>(["trail"]);
    afterEach(() => __setTrailPoolsForTest(null));
    // The real kind presents a skill when a pool credits it, so these load fixture pools (F-7) rather than spy.
    const BAND_OF: Record<string, "k1" | "g23" | "g45" | "g68" | "g912"> = { "read-g1": "k1", "read-g3": "g23", "read-g4": "g45", "read-g6": "g68", "read-g9": "g912" };
    const presenting = (...skillIds: string[]) => __setTrailPoolsForTest(skillIds.map((id) => fixtureTrailPool(BAND_OF[id])));

    it("keeps the trail skill while its switch is on, and drops it with the switch off or at the gate", () => {
      presenting("read-g6");
      expect(ids(trailReading, "7", [], TRAILS_ON)).toEqual(["read-g6"]);
      expect(ids(trailReading, "7", [], ALL_ON)).toEqual(["read-g6"]);
      expect(runCandidates(trailReading, "7", []).map((s) => s.id), "no set means every kind on").toEqual(["read-g6"]);
      // Trails off, or the gate (no hands-on kind at all): today's multiple choice, never empty.
      expect(ids(trailReading, "7", [], new Set<TaskKind>(["measure", "lock"]))).toEqual(["read-g4"]);
      expect(ids(trailReading, "7", [], CHOICE_ONLY)).toEqual(["read-g4"]);
    });

    it("keeps only the trail-only skills the mechanic presents", () => {
      presenting("read-g9");
      // read-g6 is trail-only and not presented: it is not playable, so grade 7 falls to read-g4.
      expect(ids(trailReading, "7", [], TRAILS_ON)).toEqual(["read-g4"]);
      expect(ids(trailReading, "10", [], TRAILS_ON)).toEqual(["read-g9"]);
    });

    it("keeps a choice-drawable skill whether or not the mechanic presents it", () => {
      presenting();
      expect(ids(trailReading, "3", [], TRAILS_ON)).toEqual(["read-g3"]);
      expect(ids(trailReading, "K", [], TRAILS_ON)).toEqual(["sight-k1"]);
    });

    it("lets a focus extra in only when it is playable", () => {
      presenting("read-g6");
      expect(ids(trailReading, "4", ["read-g6"], TRAILS_ON)).toEqual(["read-g4", "read-g6"]);
      expect(ids(trailReading, "4", ["read-g6"], CHOICE_ONLY)).toEqual(["read-g4"]);
    });

    it("a lock mechanic does not make a trail skill playable: a lock presents no reading skill", () => {
      presenting("read-g6");
      expect(ids({ ...choiceReading, mechanic: "lock" }, "7", [], ALL_ON)).toEqual(["read-g4"]);
    });
  });

  it("a lock skill is playable on a deed whose mechanic is a lock that presents it, and only while locks are on", () => {
    const logicDeed = { ...choiceReading, area: "logic", mechanic: "lock" } as unknown as Deed;
    expect(ids(logicDeed, "5")).toEqual(["logic-g45"]);
    expect(ids(logicDeed, "5", [], new Set<TaskKind>(["measure", "trail"]))).toEqual([]);
    expect(runCandidates(logicDeed, "5").map((s) => s.id)).toEqual(["logic-g45"]);
  });
});

describe("what a trail skill's choice draw is, and what buildDeedRun hands the candidates (R-H8)", () => {
  it("a choice draw of a trail skill is empty, never a throw", () => {
    const skill = SKILLS.find((s) => s.id === "read-g6")!;
    expect(drawForSkill(skill, 0, 4, seededRng(1), [], new Set(), new Set())).toEqual([]);
    expect(drawForSkill(SKILLS.find((s) => s.id === "read-g9")!, 3, 4, seededRng(2), [], new Set(), new Set())).toEqual([]);
  });

  it("a grade 6 to 12 reading run is read-g4 multiple choice, eight questions, with trails off", () => {
    for (const g of ["6", "7", "9", "12"] as const) {
      const run = buildDeedRun(input({ deed: choiceReading, grade: g, poolItems: poolItems("read-g4", 30), enabledKinds: CHOICE_ONLY }));
      expect(run.skillIds, `grade ${g}`).toEqual(["read-g4"]);
      expect(run.questions, `grade ${g}`).toHaveLength(8);
      choices(run.questions);
    }
  });

  it("a grade-7 reading run is read-g4 whichever kinds are on, since a choice deed presents no trail skill", () => {
    for (const enabledKinds of [CHOICE_ONLY, ALL_ON, undefined]) {
      const run = buildDeedRun(input({ deed: choiceReading, grade: "7", poolItems: poolItems("read-g4", 30), enabledKinds }));
      expect(run.skillIds).toEqual(["read-g4"]);
      expect(run.questions).toHaveLength(8);
    }
  });

  it("a trail skill that is a run's one candidate is still picked by selectSkills (H7 relies on it); a lock skill is not", () => {
    expect(selectSkills([SKILLS.find((s) => s.id === "read-g6")!], {}, seededRng(1)).map((s) => s.id)).toEqual(["read-g6"]);
    expect(selectSkills([SKILLS.find((s) => s.id === "logic-g45")!], {}, seededRng(1))).toEqual([]);
  });
});

describe("a trail run: whole trails of the skill's pool (H4, R-H9, R-H11)", () => {
  const trailDeed = { ...findDeed("well-signs")!, mechanic: "trail" as const };
  const real = TASK_RUN_DRAWERS.trail!;
  afterEach(() => {
    TASK_RUN_DRAWERS.trail = real;
    __setTrailPoolsForTest(null);
  });
  const calm = { ...profile, predictableRoutine: true };

  it("trail-run: a mechanic-trail deed with the fixture pool draws 4 clues of kind trail", () => {
    __setTrailPoolsForTest([fixtureTrailPool("g23")]);
    const run = buildDeedRun(input({ deed: trailDeed, questionCount: 4, enabledKinds: ALL_ON }));
    expect(run.skillIds).toEqual(["read-g3"]);
    expect(run.questions).toHaveLength(4);
    for (const q of run.questions) expect(kindOf(q)).toBe("trail");
    expect(new Set(run.questions.map((q) => q.id)).size).toBe(4);
    for (const q of run.questions) expect(q.id).toMatch(/^read-g3:trail:[0-9a-f]{8}$/);
  });

  it("keeps a trail's clues in order when the run is not shuffled (predictable routine), and is one run per seed", () => {
    __setTrailPoolsForTest([fixtureTrailPool("g23")]);
    for (const seed of [1, 2, 3, 4, 5]) {
      const a = buildDeedRun(input({ deed: trailDeed, seed, questionCount: 4, enabledKinds: ALL_ON, profile: calm }));
      const b = buildDeedRun(input({ deed: trailDeed, seed, questionCount: 4, enabledKinds: ALL_ON, profile: calm }));
      expect(a).toEqual(b);
      const trails = a.questions.map((q) => (q as { trail: string }).trail);
      // A trail's clues are together: no trail comes back after another began.
      expect(trails.filter((t, i) => i > 0 && t !== trails[i - 1]).length, `seed ${seed}`).toBeLessThanOrEqual(1);
    }
  });

  it("plays as choice, exactly as before, when no pool credits the skill", () => {
    __setTrailPoolsForTest([]);
    const run = buildDeedRun(input({ deed: trailDeed, questionCount: 4, enabledKinds: ALL_ON }));
    for (const q of run.questions) expect(kindOf(q)).toBe("choice");
    expect(run.questions).toHaveLength(4);
  });

  it("passes the week's trails as `avoid` to the fresh draw, and the draw keeps off them", () => {
    const pool = fixtureTrailPool("g23");
    __setTrailPoolsForTest([pool]);
    const recent = pool.trails.filter((t) => t.level <= 1).map((t) => `${pool.poolId}/${t.id}`);
    const calls: string[][] = [];
    TASK_RUN_DRAWERS.trail = (skill, level, count, rng, exclude, avoid) => {
      calls.push([...avoid].sort());
      return real(skill, level, count, rng, exclude, avoid);
    };
    // Mastery 0 draws near levels 0-1: every near trail is avoided, so the draw falls to the far ones.
    for (const seed of [1, 2, 3]) {
      const run = buildDeedRun(input({ deed: trailDeed, seed, questionCount: 4, enabledKinds: ALL_ON, recentTrails: recent }));
      expect(run.questions).toHaveLength(4);
      for (const q of run.questions) expect(recent, `seed ${seed}`).not.toContain((q as { trail: string }).trail);
    }
    expect(calls.length).toBeGreaterThan(0);
    for (const avoid of calls) expect(avoid).toEqual([...recent].sort());
  });

  it("the refill passes avoid: a draw that comes up short is topped up without an avoided trail while others remain", () => {
    const pool = fixtureTrailPool("g23");
    __setTrailPoolsForTest([pool]);
    const recent = pool.trails.filter((t) => t.level <= 1).map((t) => `${pool.poolId}/${t.id}`);
    const calls: { count: number; avoid: string[] }[] = [];
    TASK_RUN_DRAWERS.trail = (skill, level, count, rng, exclude, avoid) => {
      calls.push({ count, avoid: [...avoid].sort() });
      const drawn = real(skill, level, count, rng, exclude, avoid);
      // The first draw comes up one short, so the engine goes back for the rest.
      return calls.length === 1 ? drawn.slice(0, count - 1) : drawn;
    };
    const run = buildDeedRun(input({ deed: trailDeed, seed: 9, questionCount: 4, enabledKinds: ALL_ON, recentTrails: recent }));
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[1].count).toBe(1);
    for (const call of calls) expect(call.avoid).toEqual([...recent].sort());
    expect(run.questions).toHaveLength(4);
    for (const q of run.questions) expect(recent).not.toContain((q as { trail: string }).trail);
  });

  it("the due draw gets avoid too", () => {
    __setTrailPoolsForTest([fixtureTrailPool("g23"), fixtureTrailPool("g45")]);
    const recent = ["trail-g23/fx-01-trail", "trail-g45/fx-02-trail"];
    const calls: { skillId: string; count: number; avoid: string[] }[] = [];
    TASK_RUN_DRAWERS.trail = (skill, level, count, rng, exclude, avoid) => {
      calls.push({ skillId: skill.id, count, avoid: [...avoid].sort() });
      return real(skill, level, count, rng, exclude, avoid);
    };
    // Grade 4 with a grade-3 focus: both skills are candidates, one is picked, the other comes back as a due reminder.
    const run = buildDeedRun(input({
      deed: trailDeed, grade: "4", seed: 3, questionCount: 4, enabledKinds: ALL_ON, recentTrails: recent,
      focusSkillIds: ["read-g3"], dueSkillIds: ["read-g3", "read-g4"], poolItems: [...poolItems("read-g3", 30), ...poolItems("read-g4", 30)],
    }));
    expect(new Set(calls.map((c) => c.skillId)).size, "both skills were drawn from: one fresh, one due").toBe(2);
    expect(calls.some((c) => c.count === 1)).toBe(true);
    for (const call of calls) expect(call.avoid).toEqual([...recent].sort());
    expect(run.questions.length).toBeGreaterThan(0);
  });

  it("leaves the measure and sort draws alone: threading avoid moves no recorded id", () => {
    // `avoid` is the trail drawer's alone: handing it to a run must not move a measure or sort run's ids.
    const base = buildDeedRun(input({ deed: deedMath, grade: "3", seed: 21, enabledKinds: ALL_ON }));
    expect(buildDeedRun(input({ deed: deedMath, grade: "3", seed: 21, enabledKinds: ALL_ON, recentTrails: ["trail-g23/fx-01-trail"] }))).toEqual(base);
    const sci = buildDeedRun(input({ deed: deedScience, grade: "3", seed: 5, enabledKinds: ALL_ON }));
    expect(buildDeedRun(input({ deed: deedScience, grade: "3", seed: 5, enabledKinds: ALL_ON, recentTrails: ["trail-g23/fx-01-trail"] }))).toEqual(sci);
  });
});

describe("reading side quests are clue trails (H7: R-H9, R-H10, R-H21, R-H22)", () => {
  // The real deed, a trail since H7, drawing from the shipped pools.
  const reading = findDeed("well-signs")!;
  const TRAILS_OFF: ReadonlySet<TaskKind> = new Set<TaskKind>(["measure", "lock"]);
  type G = (typeof GRADES)[number];
  /** The skill a reader's trail credits, by grade: K and 1 walk `read-g1`'s trails, 2 and 3 `read-g3`'s (R-H21). */
  const TRAIL_SKILL_AT: Record<G, string> = {
    K: "read-g1", 1: "read-g1", 2: "read-g3", 3: "read-g3", 4: "read-g4", 5: "read-g4",
    6: "read-g6", 7: "read-g6", 8: "read-g6", 9: "read-g9", 10: "read-g9", 11: "read-g9", 12: "read-g9",
  };
  /** H3's choice table: what the same side quest plays with trails off or at the gate. */
  const CHOICE_SKILL_AT: Record<G, string> = {
    K: "sight-k1", 1: "read-g1", 2: "sight-g23", 3: "read-g3", 4: "read-g4", 5: "read-g4",
    6: "read-g4", 7: "read-g4", 8: "read-g4", 9: "read-g4", 10: "read-g4", 11: "read-g4", 12: "read-g4",
  };
  const READING_ITEMS = ["sight-k1", "sight-g23", "read-g1", "read-g3", "read-g4"].flatMap((id) => poolItems(id, 30));
  /** Every shipped clue's place, by task id: its trail key, the trail's level, and its index in the trail. */
  const CLUE_AT = new Map<string, { trail: string; level: number; index: number }>();
  for (const skillId of Object.values(TRAIL_SKILLS)) {
    const pool = trailPoolFor(skillId)!;
    for (const t of pool.trails) t.clues.forEach((_, index) => CLUE_AT.set(trailTaskOf(pool, t, index).id, { trail: trailKey(pool.poolId, t.id), level: t.level, index }));
  }
  const run = (over: Partial<BuildRunInput> = {}) => buildDeedRun(input({ deed: reading, enabledKinds: ALL_ON, poolItems: READING_ITEMS, ...over }));
  const kinds = (r: { questions: Task[] }) => r.questions.map(kindOf);
  const allTrail = (r: { questions: Task[] }) => r.questions.length > 0 && kinds(r).every((k) => k === "trail");
  /** What the fresh draw picks for this input, from the same seeded rng `buildDeedRun` starts with. */
  const drawn = (g: G, focus: string[], seed: number) =>
    selectSkills(runCandidates(reading, g, focus, ALL_ON), {}, seededRng(seed), {}, new Set(focus)).map((s) => s.id);
  afterEach(() => __setTrailPoolsForTest(null));

  it("a reader's trail skill at every grade, with trails on: K-1 read-g1, 2-3 read-g3, 4-5 read-g4, 6-8 read-g6, 9-12 read-g9", () => {
    for (const g of GRADES) {
      expect(runCandidates(reading, g, [], ALL_ON).map((s) => s.id), `grade ${g}`).toEqual([TRAIL_SKILL_AT[g]]);
      expect(runCandidates(reading, g, [], new Set<TaskKind>(["trail"])).map((s) => s.id), `grade ${g} trails alone`).toEqual([TRAIL_SKILL_AT[g]]);
      expect(runCandidates(reading, g).map((s) => s.id), `grade ${g} no set`).toEqual([TRAIL_SKILL_AT[g]]);
    }
  });

  it("trails off, or the gate, gives H3's choice table at every grade, never an empty run (Review Focus 3)", () => {
    for (const g of GRADES) {
      for (const on of [TRAILS_OFF, CHOICE_ONLY]) expect(runCandidates(reading, g, [], on).map((s) => s.id), `grade ${g}`).toEqual([CHOICE_SKILL_AT[g]]);
    }
  });

  it("every grade's run is four clues of its trail skill; grade 7 draws read-g6 clues", () => {
    for (const g of GRADES) {
      const r = run({ grade: g, seed: 1 });
      expect(r.skillIds, `grade ${g}`).toEqual([TRAIL_SKILL_AT[g]]);
      expect(r.questions, `grade ${g}`).toHaveLength(TRAIL_CLUES);
      expect(allTrail(r), `grade ${g}`).toBe(true);
      for (const q of r.questions) expect(q.skillId, `grade ${g}`).toBe(TRAIL_SKILL_AT[g]);
    }
    const seventh = run({ grade: "7", seed: 3, poolItems: [] });
    expect(seventh.questions.map((q) => q.skillId)).toEqual(["read-g6", "read-g6", "read-g6", "read-g6"]);
  });

  it("reaches every trail skill a reader's run may hold, at every grade, read-g6 and read-g9 included (H3's review)", () => {
    const reached = new Set<string>();
    for (const g of GRADES) {
      // The hero's own trail skill, and every focus a grown-up may pick that a trail presents.
      const focus = focusWindow({ reading: g }).map((s) => s.id);
      const offered = runCandidates(reading, g, focus, ALL_ON).filter((s) => TASK_KINDS.trail.presents(s.id)).map((s) => s.id);
      expect(offered, `grade ${g}`).toContain(TRAIL_SKILL_AT[g]);
      const served = new Set<string>();
      for (let seed = 1; seed <= 200; seed++) {
        for (const q of run({ grade: g, seed, focusSkillIds: focus }).questions) if (kindOf(q) === "trail") served.add(q.skillId);
      }
      expect(offered.filter((id) => !served.has(id)), `grade ${g} never walks`).toEqual([]);
      for (const id of served) reached.add(id);
    }
    expect([...reached].sort()).toEqual(Object.values(TRAIL_SKILLS).sort());
  });

  describe("selectSkills draws a trail skill beside a pool skill (H3's review)", () => {
    const servedOver = (over: Partial<BuildRunInput>) => {
      const served = new Set<string>();
      for (let seed = 1; seed <= 100; seed++) {
        const r = run({ ...over, seed });
        expect(allTrail(r), `seed ${seed}`).toBe(true);
        expect(r.skillIds, `seed ${seed}: one skill a run`).toHaveLength(1);
        for (const q of r.questions) expect(q.skillId, `seed ${seed}`).toBe(r.skillIds[0]);
        served.add(r.skillIds[0]);
      }
      return [...served].sort();
    };

    it("a grade-5 reader with a read-g6 focus walks read-g6 trails as well as read-g4's", () => {
      expect(runCandidates(reading, "5", ["read-g6"], ALL_ON).map((s) => s.id)).toEqual(["read-g4", "read-g6"]);
      expect(servedOver({ grade: "5", focusSkillIds: ["read-g6"] })).toEqual(["read-g4", "read-g6"]);
    });

    it("a grade-7 reader (base read-g6) with a read-g4 focus extra walks both, never only read-g4: a trail can play the focus, so it stays a trail", () => {
      expect(runCandidates(reading, "7", ["read-g4"], ALL_ON).map((s) => s.id)).toEqual(["read-g6", "read-g4"]);
      expect(servedOver({ grade: "7", focusSkillIds: ["read-g4"] })).toEqual(["read-g4", "read-g6"]);
    });

    it("weighs a trail-only skill and a pool skill in one draw, a focus three times over", () => {
      const pair = ["read-g4", "read-g6"].map((id) => SKILLS.find((s) => s.id === id)!);
      let focused = 0;
      for (let seed = 1; seed <= 600; seed++) {
        const picked = selectSkills(pair, {}, seededRng(seed), {}, new Set(["read-g6"]));
        expect(picked).toHaveLength(1);
        if (picked[0].id === "read-g6") focused++;
      }
      expect(focused).toBeGreaterThanOrEqual(2.5 * (600 - focused));
      expect(600 - focused).toBeGreaterThan(0);
    });
  });

  it("a trail run is four clues of whole trails, in trail order, never shuffled; 6 at length 12, 2 at length 4 (R-H10)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = run({ grade: "3", seed });
      expect(r.questions, `seed ${seed}`).toHaveLength(4);
      expect(allTrail(r), `seed ${seed}`).toBe(true);
      const at = r.questions.map((q) => CLUE_AT.get(q.id)!);
      at.forEach((c, i) => {
        // A trail starts at its first clue and goes on one clue at a time; once it ends it never comes back.
        if (i === 0 || c.trail !== at[i - 1].trail) {
          expect(c.index, `seed ${seed} task ${i}`).toBe(0);
          expect(at.slice(0, i).some((p) => p.trail === c.trail), `seed ${seed} task ${i}`).toBe(false);
        } else {
          expect(c.index, `seed ${seed} task ${i}`).toBe(at[i - 1].index + 1);
        }
      });
    }
    expect(run({ grade: "3", seed: 1, sideQuestLength: 12 }).questions).toHaveLength(6);
    expect(run({ grade: "3", seed: 1, sideQuestLength: 4 }).questions).toHaveLength(2);
  });

  it("a walking run takes no other kind: a choice miss and a due skill no trail presents are left out", () => {
    const miss = (skillId: string, i: number): ChoiceTask => ({ id: `${skillId}-item-${i}`, skillId, prompt: `Prompt ${i}`, choices: [`A${i}`, `B${i}`], answer: `A${i}` });
    // Seed 7 draws read-g3 fresh, not the read-g4 focus (recorded); read-g4 is then due.
    const asked: Partial<BuildRunInput> = {
      grade: "3", seed: 7, focusSkillIds: ["read-g4"], dueSkillIds: ["read-g4"], recentMisses: [miss("sight-g23", 0), miss("read-g3", 3)],
    };
    expect(drawn("3", ["read-g4"], 7)).toEqual(["read-g3"]);
    // Only read-g3 has a pool here, so read-g4 would be a choice question: the walk leaves it out.
    __setTrailPoolsForTest([fixtureTrailPool("g23")]);
    const fixtured = run(asked);
    expect(fixtured.questions).toHaveLength(4);
    expect(allTrail(fixtured)).toBe(true);
    expect(fixtured.questions.some((q) => q.skillId === "read-g4" || q.skillId === "sight-g23")).toBe(false);
    // With the real pools a trail presents read-g4, so its due clue comes along, last.
    __setTrailPoolsForTest(null);
    const real = run(asked);
    expect(real.questions).toHaveLength(4);
    expect(allTrail(real)).toBe(true);
    expect(real.questions.map((q) => q.skillId)).toEqual(["read-g3", "read-g3", "read-g3", "read-g4"]);
  });

  it("trails off: eight multiple-choice questions, as before", () => {
    const r = run({ grade: "3", seed: 1, enabledKinds: TRAILS_OFF, poolItems: poolItems("read-g3", 30) });
    expect(r.questions).toHaveLength(8);
    expect(r.skillIds).toEqual(["read-g3"]);
    choices(r.questions);
    expect(r).toEqual(buildDeedRun(input({ seed: 1, enabledKinds: TRAILS_OFF, poolItems: poolItems("read-g3", 30) })));
  });

  it("the gate is multiple choice, at the grown-up's whole length", () => {
    const r = run({ grade: "3", seed: 1, enabledKinds: CHOICE_ONLY });
    expect(r.questions).toHaveLength(8);
    choices(r.questions);
    expect(run({ grade: "3", seed: 1, enabledKinds: CHOICE_ONLY, sideQuestLength: 12 }).questions).toHaveLength(12);
  });

  it("a Crown Challenge is three clues", () => {
    const r = run({ grade: "3", seed: 1, questionCount: CHALLENGE.questions, levelBoost: CHALLENGE.levelBoost, recentMisses: [], dueSkillIds: [] });
    expect(r.questions).toHaveLength(3);
    expect(allTrail(r)).toBe(true);
  });

  describe("a grown-up's reading focus no trail can play wins (R-H22)", () => {
    it("a drawn sight-word focus makes the side quest multiple choice, at the whole length", () => {
      // Seed 1 draws the sight-word focus (recorded); read-g3 is due beside it.
      expect(drawn("2", ["sight-g23"], 1)).toEqual(["sight-g23"]);
      const asked: Partial<BuildRunInput> = { grade: "2", seed: 1, focusSkillIds: ["sight-g23"], dueSkillIds: ["read-g3"] };
      const r = run(asked);
      expect(r.questions).toHaveLength(8);
      expect(kinds(r)).not.toContain("trail");
      choices(r.questions);
      expect(r.questions.some((q) => q.skillId === "read-g3"), "the due skill is asked as choice too").toBe(true);
      const long = run({ ...asked, sideQuestLength: 12 });
      expect(long.questions).toHaveLength(12);
      expect(kinds(long)).not.toContain("trail");
    });

    it("the same focus left undrawn keeps the trail, and a due sight-word skill is left out", () => {
      // Seed 7 draws read-g3 (recorded).
      expect(drawn("2", ["sight-g23"], 7)).toEqual(["read-g3"]);
      const r = run({ grade: "2", seed: 7, focusSkillIds: ["sight-g23"], dueSkillIds: ["sight-g23"] });
      expect(r.questions).toHaveLength(4);
      expect(allTrail(r)).toBe(true);
      expect(r.questions.some((q) => q.skillId === "sight-g23")).toBe(false);
    });

    it("a focus a trail presents keeps the trail", () => {
      for (let seed = 1; seed <= 30; seed++) {
        const r = run({ grade: "3", seed, focusSkillIds: ["read-g4"], dueSkillIds: ["read-g3", "read-g4"] });
        expect(allTrail(r), `seed ${seed}`).toBe(true);
        expect(r.questions, `seed ${seed}`).toHaveLength(4);
      }
    });

    it("waits for trails: with trails off the sight-word focus run is the multiple-choice run it always was", () => {
      for (let seed = 1; seed <= 20; seed++) {
        const asked: Partial<BuildRunInput> = { grade: "2", seed, focusSkillIds: ["sight-g23"], dueSkillIds: ["read-g3"], enabledKinds: TRAILS_OFF };
        expect(run(asked), `seed ${seed}`).toEqual(buildDeedRun(input({ ...asked, deed: choiceReading, poolItems: READING_ITEMS })));
      }
    });
  });

  it("passes over the trails met lately: with every near trail in recentTrails, the run walks far ones", () => {
    const pool = trailPoolFor("read-g3")!;
    // Mastery 0: the near levels are 0 and 1.
    const recent = pool.trails.filter((t) => t.level <= 1).map((t) => trailKey(pool.poolId, t.id));
    expect(recent.length).toBeGreaterThanOrEqual(18);
    for (let seed = 1; seed <= 10; seed++) {
      const fresh = run({ grade: "3", seed });
      expect(fresh.questions.some((q) => CLUE_AT.get(q.id)!.level <= 1), `seed ${seed} draws near without recentTrails`).toBe(true);
      const r = run({ grade: "3", seed, recentTrails: recent });
      expect(r.questions).toHaveLength(4);
      for (const q of r.questions) expect(CLUE_AT.get(q.id)!.level, `seed ${seed}`).toBeGreaterThanOrEqual(2);
    }
  });
});
