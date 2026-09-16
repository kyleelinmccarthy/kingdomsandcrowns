/**
 * Kindergarten and grade 1 math.
 *
 * Generators live in per-grade modules because a grade's worth of math is the unit a
 * parent reads and reviews. Each one is registered in `GENERATORS` (see
 * `../drill-generators.ts`) and must have a matching entry in `VERIFIERS`
 * (`../drill-verify.ts`) — the universal property test fails on either one missing.
 *
 * These are declared with `function`, not `const`, on purpose: `drill-generators.ts`
 * imports this module and this module imports its helpers back, so the two are a cycle.
 * Hoisted function declarations are initialised before either module body evaluates, so
 * the registry can name them whichever module a caller happens to load first; `const`
 * arrows would sit in the temporal dead zone and throw.
 */
import {
  makeQuestion,
  numericDistractors,
  randInt,
  shuffle,
  type Question,
  type Rng,
} from "../drill-generators";

/** Levels are 0-4, easiest to hardest within one grade; anything else clamps. */
const L = (level: number) => Math.min(4, Math.max(0, Math.floor(level)));

/** Highest number in play per level. */
const COUNT_MAX = [5, 10, 15, 20, 20];

/**
 * Counting and number order to 20 (grade K).
 *
 * Counting forward is learned first, so levels 0-2 only ever ask what comes *after*;
 * counting back joins in at level 3.
 */
export function countSeq(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const max = COUNT_MAX[lvl];
  // n stays in [1, max - 1] so both directions land inside the range a child is counting in.
  const n = randInt(rng, 1, max - 1);
  const back = lvl >= 3 && rng() < 0.5;
  const answer = back ? n - 1 : n + 1;
  const prompt = `What number comes ${back ? "before" : "after"} ${n}?`;
  return makeQuestion(
    skillId,
    `${back ? "before" : "after"}-${n}`,
    prompt,
    String(answer),
    numericDistractors(answer, rng, 0),
    rng,
    prompt, // no symbols in it, so the spoken form is the written one
  );
}

/** Ceilings per level, keyed by skill so one generator serves both comparison skills. */
const COMPARE_MAX: Record<string, number[]> = {
  "compare-num": [5, 10, 10, 10, 10],
  "compare-num-100": [20, 50, 99, 99, 99],
};

/**
 * Which number is the greatest (grade K at `compare-num`, grade 1 at `compare-num-100`).
 *
 * The four choices ARE the data, so a child compares a real set rather than a pair
 * dressed up as four options. The id sorts the numbers, so the same set is the same
 * question however it was drawn — which is what re-asking a miss verbatim needs.
 */
export function compareNum(level: number, rng: Rng, skillId: string): Question {
  const max = (COMPARE_MAX[skillId] ?? COMPARE_MAX["compare-num"])[L(level)];
  const picked = new Set<number>();
  while (picked.size < 4) picked.add(randInt(rng, 0, max));
  const nums = [...picked];
  const answer = Math.max(...nums);
  const prompt = "Which number is the greatest?";
  return {
    id: `${skillId}:${[...nums].sort((a, b) => a - b).join(",")}`,
    skillId,
    prompt,
    choices: shuffle(nums.map(String), rng),
    answer: String(answer),
    readAloud: prompt,
  };
}

/** Highest starting number per level. */
const TEN_MORE_MAX = [20, 40, 60, 80, 99];

/**
 * Ten more, ten less (grade 1). Levels 0-1 only add ten; taking ten away joins at level 2.
 *
 * `numericDistractors` offers the answer plus or minus ten among its candidates, which
 * here can be the starting number itself. That is wanted: "34" is exactly the tempting
 * wrong answer to "what is 10 more than 34?".
 */
export function tenMoreLess(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const max = TEN_MORE_MAX[lvl];
  const less = lvl >= 2 && rng() < 0.5;
  // Taking ten away starts at 10 or higher so the answer never goes negative.
  const n = randInt(rng, less ? 10 : 0, max);
  const answer = less ? n - 10 : n + 10;
  const prompt = `What is 10 ${less ? "less" : "more"} than ${n}?`;
  return makeQuestion(
    skillId,
    `${less ? "less" : "more"}-${n}`,
    prompt,
    String(answer),
    numericDistractors(answer, rng, 0),
    rng,
    prompt,
  );
}
