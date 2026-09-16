import { GENERATORS, seededRng, shuffle, type Question, type Rng } from "./drill-generators";
import { nearestGrades, type Grade } from "./grade-levels";
import { skillsFor, type Skill } from "./skills";
import type { Deed } from "./deeds";

export type ProfileLike = { fewerChoices: boolean; predictableRoutine: boolean; untimed: boolean; readAloud: boolean };

export type PoolItem = {
  id: string;
  skillId: string;
  prompt: string;
  answer: string;
  distractors: string[];
  readAloud: string | null;
  level: number;
};

export type BuildRunInput = {
  deed: Deed;
  grade: Grade;
  masteryBySkill: Record<string, number>;
  profile: ProfileLike;
  seed: number;
  poolItems: PoolItem[];
  recentMisses: Question[];
};

export type BuiltRun = { skillIds: string[]; questions: Question[] };

/** What the browser receives: everything but the answer. */
export type ClientQuestion = Omit<Question, "answer">;

const MAX_REVIEW = 2;

/**
 * Every skill for the deed's area at the hero's grade, or at the nearest grade that has
 * any — easier grades first, so a hero is never handed harder work than their own grade.
 * Which of these a run actually practises is decided in `buildRun`, where the hero's
 * mastery and the run's seed are both in hand.
 */
export function chooseSkills(deed: Deed, grade: Grade): Skill[] {
  for (const g of nearestGrades(grade)) {
    const candidates = skillsFor(deed.area, g);
    if (candidates.length > 0) return candidates;
  }
  return [];
}

/**
 * Up to two skills for one run: the least-practised generator, and the least-practised
 * pool when one exists — so a hero works on what they have done least rather than on
 * whatever happened to be listed first. Ties are broken by the run's seed, so a hero
 * with fresh mastery everywhere still meets all of their grade's skills over time
 * instead of the same one every day.
 */
export function selectSkills(candidates: Skill[], masteryBySkill: Record<string, number>, rng: Rng): Skill[] {
  const leastPractised = (pool: Skill[]): Skill | undefined => {
    if (pool.length === 0) return undefined;
    const lowest = Math.min(...pool.map((s) => masteryBySkill[s.id] ?? 0));
    const tied = pool.filter((s) => (masteryBySkill[s.id] ?? 0) === lowest);
    return shuffle(tied, rng)[0];
  };
  const generator = leastPractised(candidates.filter((s) => s.source.kind === "generator"));
  const pool = leastPractised(candidates.filter((s) => s.source.kind === "pool"));
  const picked = [generator, pool].filter((s): s is Skill => !!s);
  // Unreachable today: `SkillSource` is exactly generator | pool, so a non-empty
  // `candidates` always yields at least one pick. It is kept as the guard for a third
  // source kind — which would otherwise fall through both filters and hand a hero an
  // empty run rather than something to do.
  return picked.length > 0 ? picked : candidates.slice(0, 1);
}

function poolQuestion(item: PoolItem, rng: Rng): Question {
  return {
    id: item.id,
    skillId: item.skillId,
    prompt: item.prompt,
    choices: shuffle([item.answer, ...item.distractors], rng),
    answer: item.answer,
    readAloud: item.readAloud ?? undefined,
  };
}

/** Items within one level of the hero's rung first; widen to everything if that runs short. */
function drawPool(items: PoolItem[], level: number, count: number, rng: Rng): Question[] {
  const near = shuffle(items.filter((i) => Math.abs(i.level - level) <= 1), rng);
  const far = shuffle(items.filter((i) => Math.abs(i.level - level) > 1), rng);
  return [...near, ...far].slice(0, count).map((i) => poolQuestion(i, rng));
}

/**
 * What a child actually reads: the prompt AND the options under it.
 *
 * The prompt alone is not the question for every skill. Three generators ask one sentence
 * forever — "Which number is the greatest?", "Which fraction is the largest?" — and put the
 * whole question in the four choices. Excluding on the prompt alone therefore threw away
 * every draw after the first and handed a child a ONE-QUESTION deed: roughly one
 * kindergarten math deed in four, since math has no pool skills to backfill from.
 *
 * Including the sorted choices costs nothing for an ordinary generator, whose id is derived
 * from its prompt, so the id check has already caught a genuine repeat before this runs.
 */
function questionText(q: Question): string {
  return `${q.prompt}|${[...q.choices].sort().join(",")}`;
}

/**
 * `excludePrompts` exists because an id is only as good as the day it was written. A missed
 * question is replayed from the run it was stored in, and when a generator's id shape
 * changes, a miss stored under the old shape no longer matches anything drawn today — so
 * the same question could appear twice in one deed, once as review and once as fresh. That
 * really happened: four generators were re-keyed to drop parameters their prompts never
 * showed, and every miss stored before that carried the old key.
 *
 * Excluding on the prompt as well as the id makes the guard independent of how ids are
 * spelled, so the next re-keying costs nobody a duplicated question.
 */
function drawGenerated(
  skill: Skill,
  level: number,
  count: number,
  rng: Rng,
  exclude: Set<string> = new Set(),
  excludePrompts: Set<string> = new Set(),
): Question[] {
  if (skill.source.kind !== "generator") return [];
  const generator = GENERATORS[skill.source.generatorId];
  const out: Question[] = [];
  // Seed "seen" from exclude so an id already used elsewhere in the run (a
  // review miss, in particular) is skipped like any other duplicate.
  const seen = new Set<string>(exclude);
  const seenPrompts = new Set<string>(excludePrompts);
  let guard = 0;
  while (out.length < count && guard < count * 20) {
    guard += 1;
    const q = generator(level, rng, skill.id);
    if (seen.has(q.id) || seenPrompts.has(questionText(q))) continue;
    seen.add(q.id);
    seenPrompts.add(questionText(q));
    out.push(q);
  }
  return out;
}

function trimChoices(q: Question, rng: Rng): Question {
  const other = q.choices.find((c) => c !== q.answer) ?? q.answer;
  return { ...q, choices: shuffle([q.answer, other], rng) };
}

export function buildDeedRun(input: BuildRunInput): BuiltRun {
  const { deed, grade, masteryBySkill, profile, seed, poolItems, recentMisses } = input;
  const rng = seededRng(seed);
  const skills = selectSkills(chooseSkills(deed, grade), masteryBySkill, rng);
  const skillIds = skills.map((s) => s.id);
  if (skills.length === 0) return { skillIds: [], questions: [] };

  // A miss that recurs across runs (or a caller that hands back duplicates) is one
  // review question, not one per occurrence; the first occurrence wins.
  const seenMissIds = new Set<string>();
  const dedupedMisses = recentMisses.filter((m) => {
    if (seenMissIds.has(m.id)) return false;
    seenMissIds.add(m.id);
    return true;
  });
  const review = dedupedMisses.filter((m) => skillIds.includes(m.skillId)).slice(0, MAX_REVIEW);
  const reviewIds = new Set(review.map((m) => m.id));
  // Also by prompt: a miss stored under an older id shape would otherwise be re-asked as a
  // fresh question in the same deed.
  const reviewPrompts = new Set(review.map(questionText));
  const target = deed.questionCount;
  const fresh = Math.max(0, target - review.length);

  // Split fresh questions across the chosen skills, first skill taking the remainder.
  const perSkill = skills.map((_, i) => Math.floor(fresh / skills.length) + (i < fresh % skills.length ? 1 : 0));
  const bySkill = skills.map((skill, i) => {
    const level = masteryBySkill[skill.id] ?? 0;
    if (skill.source.kind === "generator") return drawGenerated(skill, level, perSkill[i], rng, reviewIds, reviewPrompts);
    const items = poolItems.filter((p) => p.skillId === skill.id && !reviewIds.has(p.id));
    return drawPool(items, level, perSkill[i], rng);
  });

  // A skill that came up short (thin pool) hands its slots to the others.
  let questions = bySkill.flat();
  if (questions.length < fresh) {
    for (const skill of skills) {
      if (questions.length >= fresh) break;
      const have = new Set(questions.map((q) => q.id));
      const havePrompts = new Set(questions.map(questionText));
      const extra = skill.source.kind === "generator"
        ? drawGenerated(skill, masteryBySkill[skill.id] ?? 0, fresh - questions.length + have.size, rng, new Set([...have, ...reviewIds]), new Set([...havePrompts, ...reviewPrompts])).filter((q) => !have.has(q.id))
        : drawPool(poolItems.filter((p) => p.skillId === skill.id && !have.has(p.id) && !reviewIds.has(p.id)), masteryBySkill[skill.id] ?? 0, fresh - questions.length, rng);
      questions = [...questions, ...extra].slice(0, fresh);
    }
  }

  if (questions.length === 0 && review.length === 0) return { skillIds, questions: [] };

  let ordered: Question[];
  if (profile.predictableRoutine) {
    // Same shape every time: skills in catalog order, review at the end.
    ordered = [...skills.flatMap((s) => questions.filter((q) => q.skillId === s.id)), ...review];
  } else {
    ordered = shuffle([...questions, ...review], rng);
  }

  const finalQuestions = profile.fewerChoices ? ordered.map((q) => trimChoices(q, rng)) : ordered;
  return { skillIds, questions: finalQuestions };
}

export function gradeAnswer(question: Question, answer: string): boolean {
  return question.answer.trim() === answer.trim();
}

export function toClientQuestion(question: Question): ClientQuestion {
  // Built explicitly (not via destructuring-and-discarding `answer`) because
  // this repo's ESLint config has no unused-var ignore pattern for that idiom.
  const { id, skillId, prompt, choices, readAloud } = question;
  return { id, skillId, prompt, choices, readAloud };
}
