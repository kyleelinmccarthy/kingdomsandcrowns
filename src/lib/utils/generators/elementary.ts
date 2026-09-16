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

/**
 * Highest number in play per level. Level 0 is 10, not 5: a deed asks eight questions and
 * `drawGenerated` never repeats an id, so a cap of 5 with n in [1, max - 1] left exactly
 * four questions in existence ("what comes after 1, 2, 3, 4") and a kindergartener's first
 * counting deed was four questions long. Ten gives nine, which clears the deed. Counting to
 * ten before twenty is the right first rung anyway.
 */
const COUNT_MAX = [10, 12, 15, 20, 20];

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

/** Which step sizes are in play per level, easiest ladder first. */
const SKIP_STEPS = [[2], [2, 5], [2, 5, 10], [2, 5, 10, 3], [2, 5, 10, 3, 4]];

/**
 * Skip counting (grade 2). Three terms are shown and the fourth is asked for, so the
 * printed run IS the evidence: a verifier can recover the step from the gaps between the
 * terms rather than trusting the "Count by 5s" label.
 */
export function skipCount(level: number, rng: Rng, skillId: string): Question {
  const steps = SKIP_STEPS[L(level)];
  const step = steps[randInt(rng, 0, steps.length - 1)];
  // Runs begin on a multiple of the step, the way a child is taught to skip count.
  const start = step * randInt(rng, 1, 10);
  const shown = [start, start + step, start + 2 * step];
  const answer = start + 3 * step;
  return makeQuestion(
    skillId,
    `${step}from${start}`,
    `Count by ${step}s: ${shown.join(", ")}, __`,
    String(answer),
    numericDistractors(answer, rng, 0),
    rng,
    `Count by ${step}s. ${shown.join(", ")}. What comes next?`,
  );
}

/** How fine the minute hand gets per level: half hours, then quarters, then five-minute marks. */
const CLOCK_GRAIN = [30, 30, 15, 5, 5];

/** Two digits, for the minutes in "4:05" and the cents in "$1.05". */
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Telling time from the hands (grade 2).
 *
 * The prompt names where each hand points, not the time, so the minute hand's number has
 * to be turned into minutes — which is the step the verifier can undo independently.
 *
 * The three distractors are the three mistakes a child actually makes: right hour with
 * the wrong minutes, one hour out, and the two hands read the wrong way round.
 */
export function timeClock(level: number, rng: Rng, skillId: string): Question {
  const grain = CLOCK_GRAIN[L(level)];
  const minuteChoices = Array.from({ length: 60 / grain }, (_, i) => i * grain);
  let hour = 0, minute = 0, minuteHand = 0;
  let choices: string[] = [];
  // Redraw rather than patch: when the minute hand points at the hour's own number
  // (4 o'clock, twenty past) the hands-swapped distractor IS the answer, and the
  // question would have two right answers. It is rare, so a redraw costs nothing.
  for (let attempt = 0; attempt < 50; attempt++) {
    hour = randInt(rng, 1, 12);
    minute = minuteChoices[randInt(rng, 0, minuteChoices.length - 1)];
    minuteHand = minute / 5;
    const answer = `${hour}:${pad2(minute)}`;
    const otherMinutes = minuteChoices.filter((m) => m !== minute);
    const wrongMinutes = `${hour}:${pad2(otherMinutes[randInt(rng, 0, otherMinutes.length - 1)])}`;
    const hourOut = `${((hour + (rng() < 0.5 ? 10 : 0)) % 12) + 1}:${pad2(minute)}`;
    const swapped = `${minuteHand === 0 ? 12 : minuteHand}:${pad2((hour % 12) * 5)}`;
    choices = [answer, wrongMinutes, hourOut, swapped];
    if (new Set(choices).size === 4) break;
    choices = [];
  }
  if (choices.length !== 4) throw new Error(`could not draw four distinct times at level ${level}`);
  const answer = choices[0];
  const prompt = `The hour hand is on ${hour} and the minute hand is on ${minuteHand}. What time is it?`;
  return {
    id: `${skillId}:${hour}:${minute}`,
    skillId,
    prompt,
    choices: shuffle(choices, rng),
    answer,
    // The answer's "4:30" is never spoken: what read-aloud says is the question, which
    // names the two hand positions as plain numbers and contains no symbol at all.
    readAloud: prompt,
  };
}

/**
 * The coin ladder, easiest first. Dimes come before pennies on purpose: a pennies-only
 * round would make the "counted the coins instead of their value" distractor equal the
 * answer, and the question would have two right answers.
 */
const COINS = [
  { one: "dime", many: "dimes", value: 10 },
  { one: "penny", many: "pennies", value: 1 },
  { one: "nickel", many: "nickels", value: 5 },
  { one: "quarter", many: "quarters", value: 25 },
];

/** How many kinds of coin are in the handful per level. */
const COIN_KINDS = [1, 2, 2, 3, 4];

/** "32¢" under a dollar, "$1.15" at or above one. */
function money(cents: number): string {
  return cents >= 100 ? `$${Math.floor(cents / 100)}.${pad2(cents % 100)}` : `${cents}¢`;
}

const coinPhrase = (count: number, coin: (typeof COINS)[number]) => `${count} ${count === 1 ? coin.one : coin.many}`;

/**
 * Counting coins (grade 2). Answers are money, so `numericDistractors` does not apply:
 * the three wrong choices are built from the three real mistakes — counting the coins
 * instead of their value, miscounting one coin, and being five cents out.
 */
export function moneyCoins(level: number, rng: Rng, skillId: string): Question {
  const kinds = COINS.slice(0, COIN_KINDS[L(level)]);
  const counts = kinds.map(() => randInt(rng, 1, 9));
  const total = kinds.reduce((sum, coin, i) => sum + coin.value * counts[i], 0);
  const coinCount = counts.reduce((a, b) => a + b, 0);
  const miscounted = kinds[randInt(rng, 0, kinds.length - 1)].value;

  const wanted = [coinCount, total + miscounted, total - miscounted, total + 5, total - 5];
  const distractors: string[] = [];
  for (const cents of wanted) {
    if (cents < 0 || cents === total) continue;
    const rendered = money(cents);
    if (rendered !== money(total) && !distractors.includes(rendered)) distractors.push(rendered);
    if (distractors.length === 3) break;
  }
  for (let nudge = 2; distractors.length < 3; nudge++) {
    const rendered = money(total + nudge);
    if (!distractors.includes(rendered)) distractors.push(rendered);
  }

  // Largest coin first, the way a person counts a handful out loud.
  const spoken = [...kinds.keys()]
    .sort((a, b) => kinds[b].value - kinds[a].value)
    .map((i) => coinPhrase(counts[i], kinds[i]));
  const listed = spoken.length === 1 ? spoken[0] : `${spoken.slice(0, -1).join(", ")} and ${spoken[spoken.length - 1]}`;
  const prompt = `How much is ${listed}?`;
  // The id names every coin kind in one fixed order, so the same handful is the same
  // question however it was drawn — and a level with fewer kinds still reads as zeroes.
  const key = COINS.map((coin) => {
    const at = kinds.indexOf(coin);
    return at < 0 ? 0 : counts[at];
  });
  return makeQuestion(
    skillId,
    `${key[3]}:${key[0]}:${key[2]}:${key[1]}`, // quarters:dimes:nickels:pennies
    prompt,
    money(total),
    distractors,
    rng,
    prompt, // "How much is 3 dimes and 2 pennies?" — no symbol reaches the spoken form
  );
}
