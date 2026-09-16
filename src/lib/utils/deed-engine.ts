import { GENERATORS, seededRng, shuffle, type Question, type Rng } from "./drill-generators";
import { nearestGrades, type Grade } from "./grade-levels";
import { MASTERY_MAX } from "./mastery";
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
  /**
   * When each skill was last practised, epoch ms, from `skill_mastery.lastPracticedAt`.
   * Optional: a caller that does not know simply gets the mastery-weighted draw. The
   * action already selects the whole mastery row, so this costs no extra round trip.
   */
  lastPracticedBySkill?: Record<string, number | null>;
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
 * Every skill for the deed's area at the hero's grade, or at the nearest grade that has any.
 * Which of these a run actually practises is decided in `buildRun`, where the hero's mastery
 * and the run's seed are both in hand.
 *
 * `nearestGrades` walks the EASIER grades first, so wherever a strand has content at or below
 * the hero's grade they are never handed harder work than their own. Math has content at every
 * grade and this is simply true there.
 *
 * **It is not true everywhere, and the comment here used to say it was.** Where a strand has
 * nothing at or below a grade the walk runs off the bottom and carries on UPWARD, handing the
 * hero a harder grade's work rather than an empty quest. `nearestGrades("K")` is
 * `[K, 1, 2, ...]`: there is no easier grade to find, so it climbs. Today that happens for
 * Language Arts at K and at grade 1, which plan 3 has not filled — a kindergartener on a mill
 * quest is handed grade-2 spelling.
 *
 * **The fallback is not being changed.** An empty quest is worse than a hard one, and plan 3
 * fills those grades. What is changing is that it is written down and counted:
 * `deed-engine.test.ts` lists exactly which (area, grade) pairs walk upward today, and when
 * plan 3 lands that list should shrink to nothing and the test will say so.
 *
 * The same gap from the other side is not a defect at all: Reading stops at grade 3, so a
 * grade-9 hero's reading quest is grade-3 work. That is the walk doing what it says.
 */
export function chooseSkills(deed: Deed, grade: Grade): Skill[] {
  for (const g of nearestGrades(grade)) {
    const candidates = skillsFor(deed.area, g);
    if (candidates.length > 0) return candidates;
  }
  return [];
}

/**
 * A skill untouched for this many days is as overdue as it will ever get. Four days is
 * one rung of mastery in weight (see `weightsFor`), so a fully-neglected mastered skill
 * is exactly as likely as a freshly-practised untouched one — overdue enough to come
 * round again, never enough to outrank a skill a hero is actually struggling with.
 */
const STALE_DAYS_CAP = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How likely each candidate is to be the one a run practises.
 *
 * Least-mastered as an absolute RULE is the wrong long-run policy, and the sharp edge only
 * shows once a child has actually used it. `recordResult` lets a level go DOWN on repeated
 * failure and caps it at `MASTERY_MAX`, so the one skill a child finds hard is pushed toward
 * 0 while everything else climbs to 4 — strictly, permanently the minimum. Simulated over 40
 * days at grade 3 with a child who succeeds at everything but subtraction, `sub-1000` was
 * served 34 days of 40, the last 34 consecutively, and no mastered skill was ever revisited.
 * That is a child being drilled on their weakest subject every single day until they stop
 * wanting to play.
 *
 * So mastery is a bias, not a rule. Two terms, both deliberately small:
 *
 *  - **Mastery.** `MASTERY_MAX + 1 - level`: an untouched rung is five times likelier than a
 *    mastered one, and still never certain. Interleaved practice beats blocked practice
 *    anyway, so a hero meeting several skills in a week is the better teaching as well as
 *    the kinder one.
 *  - **Recency.** Days since the skill was last practised, capped. This is why
 *    `skill_mastery.lastPracticedAt` is persisted. Days are counted against the most recent
 *    practice we know of rather than a clock, so a run stays reproducible from its seed; a
 *    skill with no record at all counts as fully overdue, but only once SOME skill has a
 *    record, or a hero's very first run would call everything overdue and flatten the
 *    mastery bias to nothing.
 */
function weightsFor(
  pool: Skill[],
  masteryBySkill: Record<string, number>,
  lastPracticedBySkill: Record<string, number | null>,
): number[] {
  const known = pool
    .map((s) => lastPracticedBySkill[s.id])
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  const newest = known.length > 0 ? Math.max(...known) : null;
  return pool.map((s) => {
    // Clamped, because a caller may hand back a level from a longer ladder than this one.
    const level = Math.min(MASTERY_MAX, Math.max(0, Math.floor(masteryBySkill[s.id] ?? 0)));
    const mastery = MASTERY_MAX + 1 - level;
    if (newest === null) return mastery;
    const at = lastPracticedBySkill[s.id];
    const gap = typeof at === "number" && Number.isFinite(at)
      ? Math.floor((newest - at) / DAY_MS)
      : STALE_DAYS_CAP;
    return mastery + Math.min(STALE_DAYS_CAP, Math.max(0, gap));
  });
}

/** One rng draw, whatever the pool size, so the cost of a wider grade is not a longer stream. */
function weightedPick(pool: Skill[], weights: number[], rng: Rng): Skill | undefined {
  if (pool.length === 0) return undefined;
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  // Only reachable on floating-point slop at the very top of the range.
  return pool[pool.length - 1];
}

/**
 * Up to two skills for one run: one generator skill and one pool skill when both exist, so a
 * hero works on what they have done least — most of the time — rather than on whatever
 * happened to be listed first. The draw is weighted by `weightsFor`, so the least-practised
 * skill wins far more often than any other and yet nothing is ever locked out: a hero with
 * fresh mastery everywhere still meets all of their grade's skills, and a hero with one hard
 * skill is not handed it every day.
 */
export function selectSkills(
  candidates: Skill[],
  masteryBySkill: Record<string, number>,
  rng: Rng,
  lastPracticedBySkill: Record<string, number | null> = {},
): Skill[] {
  const draw = (pool: Skill[]): Skill | undefined =>
    weightedPick(pool, weightsFor(pool, masteryBySkill, lastPracticedBySkill), rng);
  const generator = draw(candidates.filter((s) => s.source.kind === "generator"));
  const pool = draw(candidates.filter((s) => s.source.kind === "pool"));
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
/**
 * The skills whose prompt never changes, so the four choices ARE the question.
 *
 * Named outright rather than sniffed from the text. This was briefly decided by "does the
 * prompt contain a digit", which is true of these three and looks like a clean rule — but
 * `unit-circle` also asks some questions with no digit in them ("What is cos(pi)?") while its
 * prompts DO vary, so it was silently swept in. A test pins this set against the generators
 * whose prompt is genuinely constant, so a fourth one cannot arrive unnoticed.
 */
const CHOICES_ARE_THE_QUESTION = new Set(["compare-num", "compare-num-100", "fractions-compare"]);

function questionText(q: Question): string {
  // Folding the choices in everywhere looked harmless — an ordinary generator's id already
  // encodes its prompt, so the id check catches a repeated draw first — but it is not,
  // because the REVIEW question is compared by this text and not by id. A missed question
  // replayed from an earlier run carries that day's distractors; the same prompt drawn fresh
  // today carries new ones, so the two texts differed and the deed asked the same question
  // twice, once as review and once as fresh. That is the exact duplicate this was added to
  // prevent, so the choices count only where the prompt genuinely says nothing.
  return CHOICES_ARE_THE_QUESTION.has(q.skillId)
    ? `${q.prompt}|${[...q.choices].sort().join(",")}`
    : q.prompt;
}

/**
 * Which rung a single question is drawn at.
 *
 * Rung 0 is the thinnest rung every generator has, by construction: it is the one that
 * narrows hardest. When this was written, `mul-facts`, `count-seq` and `money-coins` had
 * nine distinct questions at rung 0, `skip-count`, `frac-unit`, `circle-measure` and
 * `unit-circle` ten, `frac-equiv`, `factors` and `log-eq` eleven or twelve. A deed asks
 * eight. Nothing repeats inside one deed — that is pinned — but eight of nine means a
 * child's first deed is very nearly everything that exists, so rung 0 was close to the same
 * worksheet every day until mastery moved them off it.
 *
 * **Those pools were the real defect and have since been widened at source**, in the
 * generators themselves: `mul-facts` rung 0 is 57 facts, `count-seq` 25, `money-coins` and
 * `skip-count` and `circle-measure` and `factors` 20, `frac-unit` 17, `frac-equiv` 21. Two
 * are bounded by mathematics rather than by a parameter and are left where they are, with
 * the reasoning written beside them: `unit-circle` at ten (quadrant I holds five angles and
 * the skill asks for two functions of them) and `log-eq` at twelve.
 *
 * This stays anyway, because it is worth having on its own terms rather than as a patch: a
 * rung-0 run takes roughly one question in three from rung 1. Rung 1 is by design the
 * next-easiest step and never a leap (`mul-facts`'s two times table becomes its fours;
 * `add-10` sums to 5 become sums to 6), and it is never the opening question, which stays at
 * the rung the child is actually on.
 *
 * Only rung 0. Higher rungs have both a much wider pool of their own and nothing above them
 * a child has been judged ready for, and pulling a rung-4 child down to rung 3 for variety
 * would make the top of the ladder feel easier, which is the opposite of what a top rung is.
 */
function levelForDraw(level: number, index: number): number {
  return level === 0 && index % 3 === 1 ? 1 : level;
}

/**
 * The identity cases: "x 1", "+ 0", "- 0", "0 +", "1 x", "x 0", "/ 1".
 *
 * These are trivial at ANY rung, and the ladder check cannot see them — it asks whether a
 * level can REACH questions an earlier one cannot, which says nothing about whether the
 * questions a level actually draws are hard. Read off the `/dev/content` page as a parent
 * would: grade 6 `integer-ops` at level 4 served `What is -36 x 1?`, and grade K `add-10` at
 * level 3 served `What is 9 + 0?`. A child who has climbed four rungs and is handed
 * "minus zero" reads it as the program making a mistake.
 *
 * Matched on the prompt rather than fixed in sixty generators, because it is a property of
 * what a child is SERVED and belongs with the rest of that. The leading guard stops "10 + 5"
 * being read as "0 +" and the trailing one stops "x 12" being read as "x 1".
 */
const IDENTITY_CASE = /(?:^|[^\d.])(?:0\s*[+\u00d7]|[+\-\u00d7]\s*0(?![\d.])|1\s*\u00d7|[\u00d7\u00f7]\s*1(?![\d.]))/;

/** The rung from which an identity case stops reading as practice and starts reading as a bug. */
const IDENTITY_FLOOR = 3;

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
  // Identity cases set aside rather than thrown away: filling the deed matters more than
  // dodging them, so a rung that genuinely cannot offer eight harder questions still gets
  // eight questions. Bounded too — past `count * 3` refusals the rung has said what it has.
  const held: Question[] = [];
  let dodged = 0;
  // Seed "seen" from exclude so an id already used elsewhere in the run (a
  // review miss, in particular) is skipped like any other duplicate.
  const seen = new Set<string>(exclude);
  const seenPrompts = new Set<string>(excludePrompts);
  let guard = 0;
  while (out.length < count && guard < count * 20) {
    guard += 1;
    const q = generator(levelForDraw(level, out.length), rng, skill.id);
    if (seen.has(q.id) || seenPrompts.has(questionText(q))) continue;
    seen.add(q.id);
    seenPrompts.add(questionText(q));
    if (level >= IDENTITY_FLOOR && dodged < count * 3 && IDENTITY_CASE.test(q.prompt)) {
      dodged += 1;
      held.push(q);
      continue;
    }
    out.push(q);
  }
  while (out.length < count && held.length > 0) out.push(held.shift()!);
  return out;
}

function trimChoices(q: Question, rng: Rng): Question {
  const other = q.choices.find((c) => c !== q.answer) ?? q.answer;
  return { ...q, choices: shuffle([q.answer, other], rng) };
}

export function buildDeedRun(input: BuildRunInput): BuiltRun {
  const { deed, grade, masteryBySkill, lastPracticedBySkill, profile, seed, poolItems, recentMisses } = input;
  const rng = seededRng(seed);
  const skills = selectSkills(chooseSkills(deed, grade), masteryBySkill, rng, lastPracticedBySkill ?? {});
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
