/**
 * Grade 3 math.
 *
 * Declared with `function` rather than `const`, for the same reason as the grade K-2
 * module: `drill-generators.ts` imports this file and this file imports its helpers back,
 * so hoisted declarations are what keep the registry safe whichever module loads first.
 */
import {
  gcd,
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
 * How many equal parts the line is cut into, per level. The brief's ladder is 2, 3, 4, 6,
 * 8; each level draws from a small set of it rather than one fixed denominator, because a
 * single denominator d offers only d - 1 different questions — one, at halves — and a
 * deed asks eight. The sets climb, so the denominators get harder as the level does.
 */
const FRAC_DENOMS = [[2, 3, 4, 6], [2, 3, 4, 6], [2, 3, 4, 6, 8], [3, 4, 6, 8], [4, 6, 8]];

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
const ORDINAL_WORDS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

/** Two fractions are the same number when their lowest terms agree. */
function sameFraction(a: [number, number], b: [number, number]): boolean {
  const reduce = ([n, d]: [number, number]): string => {
    const g = gcd(Math.abs(n), Math.abs(d)) || 1;
    return `${n / g}/${d / g}`;
  };
  return reduce(a) === reduce(b);
}

/**
 * Unit fractions on a number line (grade 3).
 *
 * The answer is a fraction, so `numericDistractors` does not apply. The three wrong
 * choices are built by hand from the three real mistakes — reading the fraction upside
 * down, landing on the wrong mark, and calling the whole line one part — and are checked
 * against each other BY VALUE, not by spelling, so no two of them are the same number.
 */
export function fracUnit(level: number, rng: Rng, skillId: string): Question {
  const denoms = FRAC_DENOMS[L(level)];
  const d = denoms[randInt(rng, 0, denoms.length - 1)];
  const n = randInt(rng, 1, d - 1);

  // n + 1 would be the whole when the mark is the last one, which the third distractor
  // already offers; step back instead so the two stay different questions.
  const offByOne = n + 1 < d ? n + 1 : n - 1;
  const candidates: [number, number][] = [[d, n], [offByOne, d], [d, d]];
  const answer: [number, number] = [n, d];
  const distractors: string[] = [];
  for (const c of candidates) {
    if (sameFraction(c, answer)) continue;
    if (distractors.some((seen) => sameFraction(c, seen.split("/").map(Number) as [number, number]))) continue;
    distractors.push(`${c[0]}/${c[1]}`);
  }
  if (distractors.length !== 3) throw new Error(`could not build three distinct fractions for ${n}/${d}`);

  return makeQuestion(
    skillId,
    `${n}/${d}`,
    `A number line from 0 to 1 is split into ${d} equal parts. What fraction is at the ${ORDINALS[n]} mark?`,
    `${n}/${d}`,
    distractors,
    rng,
    `A number line from 0 to 1 is split into ${d} equal parts. What fraction is at the ${ORDINAL_WORDS[n]} mark?`,
  );
}

/** Longest side per level. */
const RECT_MAX = [5, 8, 10, 12, 15];

/**
 * Area and perimeter of a rectangle (grade 3). Perimeter joins from level 2.
 *
 * The other measure is always one of the distractors, because confusing the two is THE
 * mistake at this age — which is exactly why a rectangle whose area and perimeter are the
 * same number is redrawn: it would put the right answer in the distractor slot and leave
 * the question with two right answers.
 */
export function areaPerimeter(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const max = RECT_MAX[lvl];
  let w = 0, h = 0;
  do {
    w = randInt(rng, 1, max);
    h = randInt(rng, 1, max);
  } while (w * h === 2 * (w + h)); // 4 by 4, and 3 by 6, are the rectangles that collide

  const wantArea = !(lvl >= 2 && rng() < 0.5);
  const area = w * h;
  const perimeter = 2 * (w + h);
  const answer = wantArea ? area : perimeter;
  const other = wantArea ? perimeter : area;

  const distractors = [String(other)];
  for (const near of numericDistractors(answer, rng, 0)) {
    if (distractors.length === 3) break;
    if (!distractors.includes(near)) distractors.push(near);
  }
  for (let nudge = 4; distractors.length < 3; nudge++) {
    const candidate = String(answer + nudge);
    if (!distractors.includes(candidate)) distractors.push(candidate);
  }

  const measure = wantArea ? "area" : "perimeter";
  const prompt = `A rectangle is ${w} units wide and ${h} units tall. What is its ${measure}?`;
  return makeQuestion(
    skillId,
    `${w}x${h}${wantArea ? "a" : "p"}`,
    prompt,
    String(answer),
    distractors,
    rng,
    prompt, // plain words and two numbers; nothing a screen reader would mangle
  );
}

/** Which place to round to, and how big the number gets, per level. */
const ROUND_PLACE = [10, 10, 100, 100, 1000];
const ROUND_RANGE: [number, number][] = [[10, 99], [100, 999], [100, 999], [1000, 9999], [1000, 9999]];

/**
 * Rounding to a given place (grade 3).
 *
 * A number already sitting on the place is redrawn: it is its own rounded value, so the
 * "left it alone" distractor would be the right answer and the question would have two.
 */
export function roundNearest(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const place = ROUND_PLACE[lvl];
  const [lo, hi] = ROUND_RANGE[lvl];
  let n = 0;
  do {
    n = randInt(rng, lo, hi);
  } while (n % place === 0);

  const answer = Math.round(n / place) * place;
  const below = n - (n % place);
  // Rounded the wrong way: the multiple on the other side of the number.
  const wrongWay = answer === below ? below + place : below;
  // Rounded to the wrong place — one step coarser, or finer when there is nothing coarser
  // worth offering.
  const wrongPlace = place === 10 ? 100 : place / 10;
  const wrongPlaceValue = Math.round(n / wrongPlace) * wrongPlace;

  const distractors: string[] = [];
  const wanted = [wrongWay, wrongPlaceValue, n];
  for (const candidate of wanted) {
    // 0 is skipped rather than offered: rounding a two-digit number to the nearest
    // hundred really can land there, but as a choice it tells a child nothing.
    if (candidate <= 0 || candidate === answer) continue;
    const rendered = String(candidate);
    if (!distractors.includes(rendered)) distractors.push(rendered);
  }
  for (const near of numericDistractors(answer, rng, 0)) {
    if (distractors.length === 3) break;
    if (!distractors.includes(near)) distractors.push(near);
  }

  const prompt = `Round ${n} to the nearest ${place}.`;
  return {
    id: `${skillId}:${n}@${place}`,
    skillId,
    prompt,
    choices: shuffle([String(answer), ...distractors.slice(0, 3)], rng),
    answer: String(answer),
    readAloud: prompt, // "Round 274 to the nearest 10." reads as written
  };
}
