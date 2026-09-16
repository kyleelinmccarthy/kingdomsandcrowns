/**
 * Grade 9 math: Algebra I.
 *
 * Declared with `function` rather than `const`, for the same reason as every other per-grade
 * module: `drill-generators.ts` imports this file and this file imports its helpers back, so
 * hoisted declarations are what keep the registry safe whichever module loads first.
 *
 * `pickDistinct` comes from the grade 6-8 module rather than being written again here. Its
 * one subtlety — a candidate equal to the answer is skipped and backfilled, never reported —
 * is the shape a real defect took once, and a second copy is a second place to forget it.
 * The VERIFIERS never import any of this.
 */
import {
  makeQuestion,
  numericDistractors,
  randInt,
  speakInt,
  type Question,
  type Rng,
} from "../drill-generators";
import { pickDistinct } from "./middle";

/** Levels are 0-4, easiest to hardest within one grade; anything else clamps. */
const L = (level: number) => Math.min(4, Math.max(0, Math.floor(level)));

/**
 * A wrong reading is only ever offered when it comes out whole. A child who divides and lands
 * on a fraction knows something has gone wrong and starts over, so a fractional near-miss is
 * not a mistake anyone makes — it is a choice that announces itself.
 */
function whole(numerator: number, denominator: number): string[] {
  return denominator !== 0 && numerator % denominator === 0 ? [String(numerator / denominator)] : [];
}

/** "+ 4" or "- 4", from a signed number, so no prompt ever prints "+ -4". */
const signed = (n: number): string => `${n < 0 ? "-" : "+"} ${Math.abs(n)}`;
const spokenSign = (n: number): string => `${n < 0 ? "minus" : "plus"} ${Math.abs(n)}`;

// ---------------------------------------------------------------------------
// Multi-step equations
// ---------------------------------------------------------------------------

/** Largest coefficient outside the bracket, and on the right, per level. */
const MULTI_A_MAX = [3, 4, 5, 5, 5];
const MULTI_C_MAX = [3, 4, 5, 6, 6];
/** Largest constant inside the bracket, per level. */
const MULTI_B_MAX = [5, 6, 8, 9, 9];

/**
 * Multi-step equations (grade 9). Every level distributes; level 4 adds a form with the
 * variable divided by a number, which is where a fraction first has to be cleared.
 *
 * Four things are redrawn rather than patched, and three of them are what make the
 * distractors honest rather than decorative:
 *
 *  - **`b` is never 0.** "Distributed to the first term only" is `(d - b)/(a - c)` against an
 *    answer of `(d - ab)/(a - c)`; the two differ by `b(a - 1)/(a - c)`, which is zero exactly
 *    when `b` is zero or `a` is one. `a` starts at 2, so `b ≠ 0` is the whole guard.
 *  - **`x` is never 0.** "The x terms added instead of subtracted" is the same numerator over
 *    `a + c`, and at `x = 0` that numerator is 0 and both readings are 0.
 *  - **`a ≠ c`**, or the x terms cancel and there is nothing to solve.
 *  - **A constant of zero on the right**, which would print `4x + 0`.
 */
export function multiStepEq(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  let a = 0, b = 0, c = 0, d = 0, x = 0, e = 0;
  let overDivisor = false;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    overDivisor = lvl >= 4 && rng() < 0.5;
    a = randInt(rng, 2, MULTI_A_MAX[lvl]);
    b = randInt(rng, 1, MULTI_B_MAX[lvl]) * (rng() < 0.5 ? -1 : 1);
    if (overDivisor) {
      e = randInt(rng, 2, 3);
      x = randInt(rng, -3, 3) * e;                 // a multiple of e, so x/e stays whole
      c = 0;
      d = a * x - x / e + a * b;
    } else {
      e = 0;
      c = randInt(rng, 2, MULTI_C_MAX[lvl]);
      x = lvl >= 2 ? randInt(rng, -10, 10) : randInt(rng, 1, 8);
      d = (a - c) * x + a * b;
    }
    drawn = x !== 0 && d !== 0 && (overDivisor || a !== c);
  }
  if (!drawn) throw new Error(`could not draw a multi-step equation at level ${level}`);

  const candidates = overDivisor
    ? [
      ...whole(e * (d - b), a * e - 1),     // distributed to the first term only
      ...whole(e * (d + a * b), a * e - 1), // the constant moved the wrong way
      ...numericDistractors(x, rng),
    ]
    : [
      ...whole(d - b, a - c),               // distributed to the first term only
      ...whole(d + a * b, a - c),           // the constant moved the wrong way
      ...whole(d - a * b, a + c),           // the x terms added instead of subtracted
      ...numericDistractors(x, rng),
    ];

  const left = `${a}(x ${signed(b)})`;
  const right = overDivisor ? `x/${e} ${signed(d)}` : `${c}x ${signed(d)}`;
  const spokenRight = overDivisor
    ? `x divided by ${e} ${spokenSign(d)}`
    : `${c} x ${spokenSign(d)}`;
  return makeQuestion(
    skillId,
    `${a}(x${signed(b).replace(" ", "")})=${right.replace(/ /g, "")}`,
    `Solve for x: ${left} = ${right}`,
    String(x),
    pickDistinct(candidates, String(x)),
    rng,
    `Solve for x: ${a} times the quantity x ${spokenSign(b)}, equals ${spokenRight}`,
  );
}

// ---------------------------------------------------------------------------
// Systems of two equations
// ---------------------------------------------------------------------------

/** Largest coefficient on either variable, per level. */
const SYSTEM_COEF_MAX = [1, 1, 2, 3, 4];
/** How far a solution may sit from zero, per level. */
const SYSTEM_SOLUTION_MAX = [10, 10, 10, 10, 10];

/** "x", "2x", "-x" — a leading term, with a coefficient of one left unwritten. */
const leadTerm = (coefficient: number, letter: string): string =>
  `${coefficient === 1 ? "" : coefficient === -1 ? "-" : coefficient}${letter}`;
/** "+ y", "- 3y" — a following term, signed. */
const nextTerm = (coefficient: number, letter: string): string =>
  `${coefficient < 0 ? "-" : "+"} ${Math.abs(coefficient) === 1 ? "" : Math.abs(coefficient)}${letter}`;

/**
 * Systems of two equations (grade 9). Even levels ask for x, odd levels for y, so a child
 * cannot learn to answer whichever number they happened to work out first.
 *
 * **The other variable's value is always among the choices** — it is the mistake this skill
 * exists to catch, a child who solves the system correctly and then reads off the wrong half.
 * Which is exactly why `x === y` is redrawn: the mandatory distractor would BE the answer,
 * and `pickDistinct` would quietly backfill an off-by-one in its place, leaving nothing on
 * screen that the question was asked to test.
 *
 * All four readings are rendered and compared before the draw is kept, which catches the two
 * further collisions without anybody having to enumerate them: at `y = 0` the sum `x + y` is
 * the answer, and at `y = -x` the other variable and the flipped sign are the same number.
 */
export function systemsEq(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const cmax = SYSTEM_COEF_MAX[lvl];
  const smax = SYSTEM_SOLUTION_MAX[lvl];
  let a = 0, b = 0, c = 0, d = 0, x = 0, y = 0;
  let drawn = false;
  const asksX = lvl % 2 === 0;
  for (let attempt = 0; attempt < 600 && !drawn; attempt++) {
    a = randInt(rng, 1, cmax);
    c = randInt(rng, 1, cmax);
    if (lvl === 0) {
      b = 1;
      d = -1;                                          // the sum and the difference, to begin with
    } else {
      b = randInt(rng, 1, cmax) * (rng() < 0.5 ? -1 : 1);
      d = randInt(rng, 1, cmax) * (rng() < 0.5 ? -1 : 1);
    }
    if (a * d - b * c === 0) continue;                 // parallel lines: no single solution
    x = lvl >= 2 ? randInt(rng, -smax, smax) : randInt(rng, 0, smax);
    y = lvl >= 2 ? randInt(rng, -smax, smax) : randInt(rng, 0, smax);
    const answer = asksX ? x : y;
    const other = asksX ? y : x;
    drawn = new Set([answer, other, x + y, -answer]).size === 4;
  }
  if (!drawn) throw new Error(`could not draw a system with four different readings at level ${level}`);

  const answer = asksX ? x : y;
  const other = asksX ? y : x;
  const first = `${leadTerm(a, "x")} ${nextTerm(b, "y")} = ${a * x + b * y}`;
  const second = `${leadTerm(c, "x")} ${nextTerm(d, "y")} = ${c * x + d * y}`;
  const wanted = asksX ? "x" : "y";
  const distractors = pickDistinct(
    [String(other), String(x + y), String(-answer), ...numericDistractors(answer, rng)],
    String(answer),
  );

  const speakTerms = (p: number, q: number, total: number) =>
    `${p === 1 ? "" : p === -1 ? "negative " : `${speakInt(p)} `}x ${q < 0 ? "minus" : "plus"} ${Math.abs(q) === 1 ? "" : `${Math.abs(q)} `}y equals ${speakInt(total)}`;
  return makeQuestion(
    skillId,
    `${first}|${second}|${wanted}`.replace(/ /g, ""),
    `Solve: ${first} and ${second}. What is ${wanted}?`,
    String(answer),
    distractors,
    rng,
    `Solve: ${speakTerms(a, b, a * x + b * y)} and ${speakTerms(c, d, c * x + d * y)}. What is ${wanted}?`,
  );
}

// ---------------------------------------------------------------------------
// Factoring quadratics
// ---------------------------------------------------------------------------

/** How large the number inside a factor may be, per level. */
const FACTOR_SPAN = [6, 6, 8, 9, 9];

/**
 * One factorisation, canonically. Always `(x + a)(x + b)` with `a ≤ b`, and always `(x - 3)`
 * rather than `(x + -3)`. Canonical because the answer is a STRING: `(x + 4)(x + 3)` is the
 * same factorisation spelled another way, and a question whose right answer has two
 * spellings has no right answer.
 */
function factored(p: number, q: number): string {
  const [first, second] = p <= q ? [p, q] : [q, p];
  const part = (v: number) => `(x ${v < 0 ? "-" : "+"} ${Math.abs(v)})`;
  return `${part(first)}${part(second)}`;
}

/**
 * Factoring quadratics (grade 9). The leading coefficient is 1 throughout, and negatives
 * inside the factors join at level 3.
 *
 * Three draws are thrown away:
 *
 *  - **A repeated root.** `(x + 3)(x + 3)` makes "signs flipped" the only other reading and
 *    leaves the canonical ordering saying nothing; the brief names it, and it is guarded here
 *    rather than downstream.
 *  - **A factor of zero**, which is `x(x + 5)` written the long way and not this question.
 *  - **Factors that cancel**, `p = -q`, which prints `x² - 9` with no middle term at all —
 *    a difference of squares is a different lesson, and it also makes "signs flipped" the
 *    same factorisation as the answer.
 */
export function factorQuad(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const span = FACTOR_SPAN[lvl];
  const signedDraw = () => randInt(rng, 1, span) * (lvl >= 3 && rng() < 0.5 ? -1 : 1);
  let p = 0, q = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    p = signedDraw();
    q = signedDraw();
    drawn = p !== q && p !== 0 && q !== 0 && p + q !== 0;
  }
  if (!drawn) throw new Error(`could not draw a quadratic that factors at level ${level}`);

  const sum = p + q, product = p * q;
  const answer = factored(p, q);

  // A pair that multiplies to the same constant but adds to something else.
  const multiplyRight: string[] = [];
  for (let u = -Math.abs(product); u <= Math.abs(product) && multiplyRight.length === 0; u++) {
    if (u === 0 || product % u !== 0) continue;
    if (u + product / u === sum) continue;
    multiplyRight.push(factored(u, product / u));
  }
  // A pair that adds to the same middle coefficient but multiplies to something else.
  const addRight: string[] = [];
  for (let step = 1; step <= span + 2 && addRight.length === 0; step++) {
    const u = p + step, v = sum - u;
    if (u === 0 || v === 0 || u * v === product) continue;
    addRight.push(factored(u, v));
  }

  const distractors = pickDistinct(
    [factored(-p, -q), ...multiplyRight, ...addRight, factored(p + 1, q), factored(p, q + 1), factored(p - 1, q)],
    answer,
  );
  if (distractors.length !== 3) throw new Error(`could not build three wrong factorisations for ${p}, ${q}`);

  const middle = `${sum < 0 ? "-" : "+"} ${Math.abs(sum) === 1 ? "" : Math.abs(sum)}x`;
  const prompt = `Factor: x² ${middle} ${signed(product)}`;
  return makeQuestion(
    skillId,
    `${sum},${product}`,
    prompt,
    answer,
    distractors,
    rng,
    // "x squared", never `x²`: a screen reader says the superscript as a separate number.
    `Factor: x squared ${sum < 0 ? "minus" : "plus"} ${Math.abs(sum) === 1 ? "" : `${Math.abs(sum)} `}x ${spokenSign(product)}`,
  );
}

// ---------------------------------------------------------------------------
// Slope-intercept form
// ---------------------------------------------------------------------------

/** Largest slope and largest intercept, per level. */
const LINE_SLOPE_MAX = [3, 4, 5, 5, 5];
const LINE_INTERCEPT_MAX = [5, 6, 8, 8, 8];
/** How far from the y-axis the given point may sit, per level. Zero means it IS the intercept. */
const LINE_POINT_MAX = [0, 0, 4, 5, 6];

/** "y = 3x - 2", with a coefficient of one left unwritten. */
const lineText = (left: string, slope: number, variable: string, intercept: number): string =>
  `${left} = ${leadTerm(slope, variable)} ${signed(intercept)}`;

/**
 * Slope-intercept form (grade 9). At levels 0-1 the point given IS the y-intercept and can be
 * read straight off; from level 2 the point sits away from the axis and the intercept has to
 * be worked back to, which is the skill proper.
 *
 * Three draws are thrown away, each because a named distractor would otherwise be the answer:
 *
 *  - **A slope of zero**, which prints `y = 0x - 2` and is not a line anyone writes that way.
 *  - **An intercept of zero**, which makes "the sign of the intercept flipped" the answer.
 *  - **Slope equal to intercept**, which makes "slope and intercept swapped" the answer.
 */
export function slopeIntercept(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  let m = 0, b = 0, px = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    m = randInt(rng, 1, LINE_SLOPE_MAX[lvl]) * (rng() < 0.5 ? -1 : 1);
    b = randInt(rng, 1, LINE_INTERCEPT_MAX[lvl]) * (rng() < 0.5 ? -1 : 1);
    px = LINE_POINT_MAX[lvl] === 0 ? 0 : randInt(rng, 1, LINE_POINT_MAX[lvl]) * (rng() < 0.5 ? -1 : 1);
    drawn = m !== 0 && b !== 0 && m !== b;
  }
  if (!drawn) throw new Error(`could not draw a line at level ${level}`);

  const py = m * px + b;
  const answer = lineText("y", m, "x", b);
  const distractors = pickDistinct(
    [
      lineText("y", b, "x", m),   // slope and intercept swapped
      lineText("y", m, "x", -b),  // the sign of the intercept flipped
      lineText("x", m, "y", b),   // x and y swapped
      lineText("y", -m, "x", b),
    ],
    answer,
  );

  const prompt = `A line has slope ${m} and passes through (${px}, ${py}). Write it in slope-intercept form.`;
  return makeQuestion(
    skillId,
    `${m}@${px},${py}`,
    prompt,
    answer,
    distractors,
    rng,
    // "slope intercept", with no hyphen: a bare `-` is banned from read-aloud outright, and
    // a screen reader has no use for the one in "slope-intercept" either way.
    `A line has slope ${speakInt(m)} and passes through the point ${speakInt(px)}, ${speakInt(py)}. Write it in slope intercept form.`,
  );
}

// ---------------------------------------------------------------------------
// Inequalities
// ---------------------------------------------------------------------------

/** Largest size of the coefficient on x, per level. */
const INEQUALITY_COEF_MAX = [5, 5, 7, 9, 9];

const RELATIONS = ["<", ">", "≤", "≥"] as const;
type Relation = (typeof RELATIONS)[number];

/** The same relation pointing the other way — what dividing by a negative does to it. */
const FLIPPED: Record<Relation, Relation> = { "<": ">", ">": "<", "≤": "≥", "≥": "≤" };
/** The same direction, strict where it was not and loose where it was. */
const LOOSENED: Record<Relation, Relation> = { "<": "≤", "≤": "<", ">": "≥", "≥": ">" };
const RELATION_WORDS: Record<Relation, string> = {
  "<": "is less than",
  ">": "is greater than",
  "≤": "is less than or equal to",
  "≥": "is greater than or equal to",
};

/**
 * Solving inequalities (grade 9). Coefficients are positive at levels 0-2; from level 3 the
 * coefficient is negative about half the time, which is the only way this skill ever
 * exercises the rule it exists for — **the inequality turns around when you divide by a
 * negative.** A level that never divides by a negative is teaching a different skill under
 * this skill's name.
 *
 * Mixed rather than always negative, deliberately: a child has to DECIDE whether to turn the
 * sign around, and a level where the answer is always "flip it" is answerable without reading
 * the coefficient at all.
 *
 * The un-flipped inequality is always among the choices. When the coefficient is negative
 * that is the defining error; when it is positive it is the mirror mistake, flipping a sign
 * that should have stayed put. A boundary of zero is redrawn, because `x > 0` and `x > -0`
 * are the same string and the "sign error" distractor would be the answer.
 */
export function inequalities(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const negative = lvl >= 3 && rng() < 0.5;
  const a = randInt(rng, 2, INEQUALITY_COEF_MAX[lvl]) * (negative ? -1 : 1);
  let b = 0, v = 0;
  do {
    b = randInt(rng, 1, 12) * (rng() < 0.5 ? -1 : 1);
    v = randInt(rng, -9, 9);
  } while (v === 0);
  const relation = RELATIONS[randInt(rng, 0, RELATIONS.length - 1)];
  const c = a * v + b;

  const solved: Relation = a < 0 ? FLIPPED[relation] : relation;
  const answer = `x ${solved} ${v}`;
  const distractors = pickDistinct(
    [
      `x ${FLIPPED[solved]} ${v}`,   // the inequality not turned around — the defining error
      `x ${solved} ${-v}`,           // the sign of the boundary lost
      `x ${LOOSENED[solved]} ${v}`,  // strict where it should be loose, or the other way
      `x ${solved} ${v + 1}`,
    ],
    answer,
  );

  const prompt = `Solve: ${a}x ${signed(b)} ${relation} ${c}`;
  return makeQuestion(
    skillId,
    prompt.slice("Solve: ".length).replace(/ /g, ""),
    prompt,
    answer,
    distractors,
    rng,
    `Solve: ${speakInt(a)} x ${spokenSign(b)} ${RELATION_WORDS[relation]} ${speakInt(c)}`,
  );
}
