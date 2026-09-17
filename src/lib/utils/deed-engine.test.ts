import { describe, it, expect } from "vitest";
import { buildDeedRun, chooseSkills, gradeAnswer, toClientQuestion, type BuildRunInput, type PoolItem } from "./deed-engine";
import { findDeed } from "./deeds";
import { GENERATORS, seededRng } from "./drill-generators";
import { SKILLS } from "./skills";
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
  return { deed: deedReading, grade: "3", masteryBySkill: {}, profile, seed: 1, poolItems: poolItems("read-g3", 30), recentMisses: [], ...over };
}

describe("chooseSkills", () => {
  it("returns every candidate skill for the area at the hero's grade", () => {
    expect(chooseSkills(deedMath, "3").map((s) => s.id))
      .toEqual(["mul-facts", "div-facts", "frac-unit", "area-perimeter", "round-nearest", "add-1000", "sub-1000"]);
    expect(chooseSkills(deedReading, "3").map((s) => s.id)).toEqual(["read-g3"]);
  });
  it("falls back to the nearest grade when the area has no skill there", () => {
    expect(chooseSkills(deedLanguage, "7").map((s) => s.id)).toEqual(["vocab-g68"]);
    expect(chooseSkills(deedReading, "9").map((s) => s.id)).toEqual(["read-g4"]);
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
    expect(byArea.map(([, area]) => area).sort()).toEqual([...new Set(SKILLS.map((s) => s.area))].sort());

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
    for (const q of run.questions) { expect(q.choices).toHaveLength(4); expect(q.choices).toContain(q.answer); }
    expect(run.skillIds).toEqual(["read-g3"]);
  });
  it("is deterministic for a seed", () => {
    expect(buildDeedRun(input({ seed: 9 }))).toEqual(buildDeedRun(input({ seed: 9 })));
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
  it("ignores misses from other skills", () => {
    const misses: Question[] = [{ id: "miss-other", skillId: "mul-facts", prompt: "6 × 7", choices: ["42", "41", "43", "40"], answer: "42" }];
    expect(buildDeedRun(input({ recentMisses: misses })).questions.some((q) => q.id === "miss-other")).toBe(false);
  });
  it("trims to two choices that include the answer under fewerChoices", () => {
    const run = buildDeedRun(input({ profile: { ...profile, fewerChoices: true } }));
    for (const q of run.questions) { expect(q.choices).toHaveLength(2); expect(q.choices).toContain(q.answer); }
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
        deed: deedMath, grade: "K", poolItems: [], recentMisses: misses, seed,
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
    expect(ids).toContain("mul-facts");
  });

  it("reaches multi-digit multiplication when a grown-up moves a grade-3 hero's math up a year", () => {
    // The whole point of the setting: this is unreachable for grade 3 today, which gets
    // the multiplication FACTS and leaves multi-digit work to grade 4.
    const ids = chooseSkills(mathDeed, "4").map((s) => s.id);
    expect(ids).toContain("mul-multi");
  });

  it("walks to easier grades, never harder, when a grade has nothing", () => {
    // Reading is now authored up to grade 4, so a grade-6 hero falls back two years rather
    // than the four they used to fall. It is still a fall, not a climb, which is the point
    // here; the remaining reading grades are what close the gap.
    const ids = chooseSkills(readingDeed, "6").map((s) => s.id);
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
    const fresh = buildDeedRun(input({ deed: deedMath, grade: "3", poolItems: [], masteryBySkill: {}, seed: 11 }));
    const target = fresh.questions[0];

    const stale: Question = { ...target, id: `${target.skillId}:STALE-KEY:${target.id}` };
    const run = buildDeedRun(
      input({ deed: deedMath, grade: "3", poolItems: [], masteryBySkill: {}, seed: 11, recentMisses: [stale] })
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
      const texts = built.questions.map((q) => `${q.prompt}|${[...q.choices].sort().join(",")}`);
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
