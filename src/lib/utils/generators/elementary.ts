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
 * Highest number in play per level. Two rungs differ from the brief's [5, 10, 15, 20, 20]:
 *
 * Level 0 is 10, not 5. A deed asks eight questions and `drawGenerated` never repeats an id,
 * so a cap of 5 drawing n in [1, max - 1] left exactly four questions in existence ("what
 * comes after 1, 2, 3, 4") and a kindergartener's first counting deed was four questions
 * long. Ten gives nine, which clears the deed, and counting to ten before twenty is the
 * right first rung anyway.
 *
 * Level 1 is 12, not 10, purely as a consequence: with level 0 raised to 10, leaving level 1
 * at 10 would have made the first two rungs the same questions, so climbing off rung 0 would
 * have changed nothing a child could see.
 */
const COUNT_MAX = [10, 12, 15, 20, 20];

/**
 * Which phrasings each level may ask.
 *
 * Counting forward is learned first, so levels 0-2 only ever ask what comes *after*, and
 * counting back joins at level 3. Level 4 is where "between" arrives, and it is there
 * because the ceiling has nowhere left to go: levels 3 and 4 both count to 20 — twenty is
 * this grade's number line, and a rung that reached past it would be teaching grade 1 — so
 * with only the two directions in play level 4 asked the same 38 questions level 3 did.
 *
 * "What number comes between 12 and 14?" is number order rather than a bigger number: a
 * child has to hold two neighbours at once instead of stepping off one, which is a real
 * step up inside K, and it opens 19 questions no earlier rung can reach.
 */
const COUNT_SHAPES: readonly (readonly ("after" | "before" | "between")[])[] = [
  ["after"],
  ["after"],
  ["after"],
  ["after", "before"],
  ["after", "before", "between"],
];

/**
 * Counting and number order to 20 (grade K).
 */
export function countSeq(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const max = COUNT_MAX[lvl];
  const shapes = COUNT_SHAPES[lvl];
  const shape = shapes[randInt(rng, 0, shapes.length - 1)];
  // n stays in [1, max - 1] so every neighbour named lands inside the range a child is
  // counting in — which is what makes "between n - 1 and n + 1" safe at either end too.
  const n = randInt(rng, 1, max - 1);
  const answer = shape === "before" ? n - 1 : shape === "after" ? n + 1 : n;
  const prompt =
    shape === "between"
      ? `What number comes between ${n - 1} and ${n + 1}?`
      : `What number comes ${shape} ${n}?`;
  return makeQuestion(
    skillId,
    `${shape}-${n}`,
    prompt,
    String(answer),
    numericDistractors(answer, rng, 0),
    rng,
    prompt, // no symbols in it, so the spoken form is the written one
  );
}

/**
 * Ceilings per level, keyed by skill so one generator serves both comparison skills.
 *
 * Both used to stop climbing partway up — `[5, 10, 10, 10, 10]` and `[20, 50, 99, 99, 99]` —
 * so three of `compare-num`'s five rungs and two of `compare-num-100`'s drew from exactly the
 * pool the rung below had. They climb the whole way now, to twenty for a kindergartener
 * (K.CC.3's own range) and to ninety-nine for grade 1.
 */
const COMPARE_MAX: Record<string, number[]> = {
  "compare-num": [5, 8, 10, 15, 20],
  "compare-num-100": [20, 50, 70, 85, 99],
};

/**
 * The widest gap allowed between the smallest and the largest of the four numbers.
 *
 * A bigger ceiling alone is the cheap half of this ladder, and on its own it is not even the
 * real difficulty: `3, 18, 5, 2` is answered by spotting the one long number, while
 * `17, 19, 16, 18` has to actually be compared. So the top two rungs draw their four numbers
 * from a narrow window — which for `compare-num-100` means numbers sharing a tens digit, and
 * so comparing the ones place, which is 1.NBT.3 word for word.
 *
 * A window can only ever remove draws, so it could never make a rung fresh by itself; it is
 * the second axis beside the ceiling, not a replacement for it.
 */
const COMPARE_SPREAD: Record<string, number[]> = {
  "compare-num": [20, 20, 20, 6, 4],
  "compare-num-100": [99, 99, 99, 20, 9],
};

/**
 * Which number is the greatest (grade K at `compare-num`, grade 1 at `compare-num-100`).
 *
 * The four choices ARE the data, so a child compares a real set rather than a pair
 * dressed up as four options. The id sorts the numbers, so the same set is the same
 * question however it was drawn — which is what re-asking a miss verbatim needs.
 */
export function compareNum(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const max = (COMPARE_MAX[skillId] ?? COMPARE_MAX["compare-num"])[lvl];
  // Never wider than the range itself, and never narrower than the four distinct numbers
  // a window has to hold.
  const spread = Math.max(3, Math.min((COMPARE_SPREAD[skillId] ?? COMPARE_SPREAD["compare-num"])[lvl], max));
  const low = randInt(rng, 0, max - spread);
  const picked = new Set<number>();
  while (picked.size < 4) picked.add(randInt(rng, low, low + spread));
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

/**
 * How fine the minute hand gets per level: o'clock, then half hours, then quarters, then ten
 * and finally five-minute marks — 2.MD.7's own ladder, which ends at "to the nearest five
 * minutes" and so has a real top.
 *
 * This was `[30, 30, 15, 5, 5]`, flat at both ends: levels 0 and 1 shared all 22 half-hour
 * faces and levels 3 and 4 shared every five-minute one. Each rung now puts marks on the dial
 * the rung below had not, and whole hours are the right first thing a grade-2 child reads.
 */
const CLOCK_GRAIN = [60, 30, 15, 10, 5];

/** Every mark the minute hand can point at, for the levels whose own grain offers only one. */
const FIVE_MINUTE_MARKS = Array.from({ length: 12 }, (_, i) => i * 5);

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
    // A clock face is numbered 1-12: the minute hand at the top points at 12, never 0.
    // Printing the raw quotient put "the minute hand is on 0" in front of a grade-2 child
    // on half of their first two rungs, teaching a dial that does not exist.
    minuteHand = minute === 0 ? 12 : minute / 5;
    const answer = `${hour}:${pad2(minute)}`;
    // At the o'clock rung the level's own grain offers a single minute value, so the
    // "right hour, wrong minutes" distractor has to come from the fuller dial — otherwise
    // there is no wrong-minutes reading to offer at all. Every other level has its own.
    const minutePool = minuteChoices.length > 1 ? minuteChoices : FIVE_MINUTE_MARKS;
    const otherMinutes = minutePool.filter((m) => m !== minute);
    const wrongMinutes = `${hour}:${pad2(otherMinutes[randInt(rng, 0, otherMinutes.length - 1)])}`;
    const hourOut = `${((hour + (rng() < 0.5 ? 10 : 0)) % 12) + 1}:${pad2(minute)}`;
    const swapped = `${minuteHand}:${pad2((hour % 12) * 5)}`;
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

/**
 * How many of each kind may be in the handful, per level — the second axis, and the reason
 * levels 1 and 2 are no longer the same 81 questions.
 *
 * Both rungs hold two coin kinds, because dimes-and-pennies is worth two rungs of practice
 * and a third kind at level 2 would leave nothing for level 3. So level 1 introduces the
 * second kind with small handfuls — one new thing at a time — and level 2 keeps the two
 * kinds and opens the handful up to nine, which is more counting and more regrouping on the
 * same coins.
 */
const COIN_MAX_COUNT = [9, 5, 9, 9, 9];

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
  const lvl = L(level);
  const kinds = COINS.slice(0, COIN_KINDS[lvl]);
  const counts = kinds.map(() => randInt(rng, 1, COIN_MAX_COUNT[lvl]));
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
