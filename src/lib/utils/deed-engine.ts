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
 * Up to two skills for the deed's area: one generator and one pool when both
 * exist at the hero's grade, otherwise the nearest grade that has any — easier
 * grades first, so a hero is never handed harder work than their own grade.
 */
export function chooseSkills(deed: Deed, grade: Grade): Skill[] {
  for (const g of nearestGrades(grade)) {
    const candidates = skillsFor(deed.area, g);
    if (candidates.length === 0) continue;
    const generator = candidates.find((s) => s.source.kind === "generator");
    const pool = candidates.find((s) => s.source.kind === "pool");
    const picked = [generator, pool].filter((s): s is Skill => !!s);
    return picked.length > 0 ? picked : [candidates[0]];
  }
  return [];
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

function drawGenerated(skill: Skill, level: number, count: number, rng: Rng, exclude: Set<string> = new Set()): Question[] {
  if (skill.source.kind !== "generator") return [];
  const generator = GENERATORS[skill.source.generatorId];
  const out: Question[] = [];
  // Seed "seen" from exclude so an id already used elsewhere in the run (a
  // review miss, in particular) is skipped like any other duplicate.
  const seen = new Set<string>(exclude);
  let guard = 0;
  while (out.length < count && guard < count * 20) {
    guard += 1;
    const q = generator(level, rng, skill.id);
    if (seen.has(q.id)) continue;
    seen.add(q.id);
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
  const skills = chooseSkills(deed, grade);
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
  const target = deed.questionCount;
  const fresh = Math.max(0, target - review.length);

  // Split fresh questions across the chosen skills, first skill taking the remainder.
  const perSkill = skills.map((_, i) => Math.floor(fresh / skills.length) + (i < fresh % skills.length ? 1 : 0));
  const bySkill = skills.map((skill, i) => {
    const level = masteryBySkill[skill.id] ?? 0;
    if (skill.source.kind === "generator") return drawGenerated(skill, level, perSkill[i], rng, reviewIds);
    const items = poolItems.filter((p) => p.skillId === skill.id && !reviewIds.has(p.id));
    return drawPool(items, level, perSkill[i], rng);
  });

  // A skill that came up short (thin pool) hands its slots to the others.
  let questions = bySkill.flat();
  if (questions.length < fresh) {
    for (const skill of skills) {
      if (questions.length >= fresh) break;
      const have = new Set(questions.map((q) => q.id));
      const extra = skill.source.kind === "generator"
        ? drawGenerated(skill, masteryBySkill[skill.id] ?? 0, fresh - questions.length + have.size, rng, new Set([...have, ...reviewIds])).filter((q) => !have.has(q.id))
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
