/**
 * Grade 9-12 math: Algebra I, Geometry, Algebra II, and precalculus and statistics.
 *
 * Declared with `function` rather than `const`, for the same reason as every other per-grade
 * module: `drill-generators.ts` imports this file and this file imports its helpers back, so
 * hoisted declarations are what keep the registry safe whichever module loads first.
 *
 * `pickDistinct` comes from the grade 6-8 module rather than being written again here. Its
 * one subtlety — a candidate equal to the answer is skipped and backfilled, never reported —
 * is the shape a real defect took once, and a second copy is a second place to forget it.
 * `PYTHAGOREAN_TRIPLES` and `frac` are imported for the same reason: `trig-ratios` and
 * `dist-midpoint` need whole-number answers off the same table `pythagorean` uses, and a
 * fraction has one spelling in this app or it has none. The VERIFIERS never import any of this.
 */
import {
  makeQuestion,
  numericDistractors,
  randInt,
  speakInt,
  type Question,
  type Rng,
} from "../drill-generators";
import { frac } from "./intermediate";
import { PYTHAGOREAN_TRIPLES, pickDistinct } from "./middle";

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

/**
 * How large the number inside a factor may be, per level.
 *
 * This was `[6, 6, 8, 9, 9]`, flat at both ends: levels 0 and 1 shared all fifteen positive
 * pairs, and levels 3 and 4 shared the signed ones. The span climbs one a rung now.
 *
 * It is the only axis this skill has, and that is said here rather than hidden: the leading
 * coefficient stays 1 by design (an answer of `(2x + 3)(x - 4)` is a different lesson and a
 * different distractor set), a difference of squares is excluded above, and a repeated root
 * is too — so beyond the sign, which arrives at level 3 and is the real jump, there is
 * nothing to vary but how far the factors reach.
 */
const FACTOR_SPAN = [6, 7, 8, 9, 10];

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
const INEQUALITY_COEF_MAX = [4, 6, 7, 9, 12];

const RELATIONS = ["<", ">", "≤", "≥"] as const;

/**
 * Which relations each level may draw — the second axis, beside the coefficient.
 *
 * The coefficient ceiling was `[5, 5, 7, 9, 9]` and flat at both ends, so levels 0 and 1
 * shared 1302 inequalities and levels 3 and 4 shared the signed ones. Widening it alone would
 * have been the cheap fix; "or equal to" is the better one, because whether the boundary is
 * itself a solution is a real thing to get wrong and a strict-only rung never asks it. So the
 * first two rungs are strict, level 2 brings in `≤` and `≥`, level 3 brings the negative
 * coefficient, and level 4 opens the coefficient the rest of the way.
 */
const INEQUALITY_RELATIONS: readonly (readonly Relation[])[] = [
  ["<", ">"], ["<", ">"], RELATIONS, RELATIONS, RELATIONS,
];
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
  const allowed = INEQUALITY_RELATIONS[lvl];
  const relation = allowed[randInt(rng, 0, allowed.length - 1)];
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

// ---------------------------------------------------------------------------
// Grade 10 — Geometry
// ---------------------------------------------------------------------------

/** The four relationships this skill asks about. */
type AngleKind = "complementary" | "supplementary" | "vertical" | "same-side";

/** Which relationships each level may draw. */
const ANGLE_KINDS: readonly AngleKind[][] = [
  ["complementary"],
  ["complementary", "supplementary"],
  ["complementary", "supplementary"],
  ["complementary", "supplementary", "vertical", "same-side"],
  ["complementary", "supplementary", "vertical", "same-side"],
];

/**
 * Multiples of five only at the first two rungs, any whole number from level 2. This is the
 * whole difference between levels 1 and 2, and it is a real one: `180 - 65` is a different
 * piece of arithmetic from `180 - 63`.
 */
const ANGLE_STEP = [5, 5, 1, 1, 1];

/** The sentence each relationship is asked in. */
function anglePrompt(kind: AngleKind, given: number): string {
  switch (kind) {
    case "complementary": return `Two angles are complementary. One is ${given}°. What is the other?`;
    case "supplementary": return `Two angles are supplementary. One is ${given}°. What is the other?`;
    case "vertical": return `Two lines cross. One of a pair of vertical angles is ${given}°. What is the other?`;
    case "same-side": return `Parallel lines are cut by a transversal. One same-side interior angle is ${given}°. What is the other?`;
  }
}

/**
 * Angle relationships (grade 10). Complementary alone at level 0, supplementary from 1, any
 * whole number of degrees from 2, and vertical and same-side interior pairs from 3.
 *
 * **The other relationship is always on screen** — the complement where the supplement was
 * asked, and the supplement where the complement was. It is the mistake this skill exists to
 * catch, and two draws are thrown away to keep it a mistake rather than a second right answer:
 *
 *  - **45°, when the complement is asked**, is its own complement, so "the angle you were
 *    given back again" would be the answer.
 *  - **An obtuse given angle** anywhere but a vertical pair at level 4. `90 - 110` is not an
 *    angle and could not be offered, and a level whose mandatory wrong reading sometimes does
 *    not exist is a level that sometimes tests nothing.
 *
 * A vertical pair is the one relationship whose answer IS the angle given, which is why the
 * "given angle" reading is offered for every other kind and never for that one. Level 4 is the
 * only rung that may give the obtuse member of a vertical pair, and that is what it adds.
 */
export function anglePairs(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const kinds = ANGLE_KINDS[lvl];
  const step = ANGLE_STEP[lvl];
  let kind: AngleKind = "complementary";
  let given = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    kind = kinds[randInt(rng, 0, kinds.length - 1)];
    const obtuse = kind === "vertical" && lvl >= 4 && rng() < 0.5;
    given = obtuse ? randInt(rng, 91, 179) : randInt(rng, 1, Math.floor(89 / step)) * step;
    drawn = !(kind === "complementary" && given === 45);
  }
  if (!drawn) throw new Error(`could not draw an angle pair at level ${level}`);

  const answer = kind === "vertical" ? given : kind === "complementary" ? 90 - given : 180 - given;
  const complement = given < 90 ? [String(90 - given)] : [];
  const supplement = [String(180 - given)];
  const candidates = [
    // The other relationship read into the question.
    ...(kind === "complementary" ? supplement : complement),
    ...(kind === "vertical" ? supplement : [String(given)]),
    String(360 - given),
    ...numericDistractors(answer, rng, 1),
  ];

  const prompt = anglePrompt(kind, given);
  return makeQuestion(
    skillId,
    `${kind}${given}`,
    prompt,
    String(answer),
    pickDistinct(candidates, String(answer)),
    rng,
    // `°` is fine on screen and unspeakable: a screen reader says it as "degree sign" or
    // says nothing at all. "same side" loses its hyphen for the same reason a bare `-` is
    // banned from spoken text outright — nothing is lost saying it as two words.
    prompt.replace(`${given}°`, `${given} degrees`).replace("same-side", "same side"),
  );
}

// ---------------------------------------------------------------------------
// Similar triangles
// ---------------------------------------------------------------------------

/** Largest scale factor between the two triangles, per level. */
const SIMILAR_SCALE_MAX = [3, 4, 5, 6, 8];
/** Largest side on the first triangle, per level. */
const SIMILAR_SIDE_MAX = [6, 7, 8, 9, 9];

/**
 * Similar triangles (grade 10). The first triangle's two sides are given along with the
 * second triangle's match for one of them; the match for the other is the answer.
 *
 * The prompt in the plan — "Two similar triangles have sides 3 and 12 in ratio" — is not a
 * sentence a child can act on: it never says which side matches which. This one names both
 * triangles and both matches. **A question a child cannot parse is a wrong question even with
 * the right answer.**
 *
 * Three draws are thrown away:
 *
 *  - **`b = 2` with a scale of 2**, the one case where adding the scale and multiplying by it
 *    agree (`2 + 2 = 2 × 2`). That reading is this skill's mandatory wrong answer, and
 *    `pickDistinct` would silently swap in an off-by-one rather than report the collision.
 *  - **Two equal sides on the first triangle**, which leaves "the side matching the 3"
 *    pointing at either of them.
 *  - **A match that equals the first triangle's other side**, which is readable but reads
 *    like a trick.
 */
export function similarTri(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  let a = 0, b = 0, scale = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    a = randInt(rng, 2, SIMILAR_SIDE_MAX[lvl]);
    b = randInt(rng, 2, SIMILAR_SIDE_MAX[lvl]);
    scale = randInt(rng, 2, SIMILAR_SCALE_MAX[lvl]);
    drawn = a !== b && b + scale !== b * scale && a * scale !== b;
  }
  if (!drawn) throw new Error(`could not draw a pair of similar triangles at level ${level}`);

  const matched = a * scale;
  const answer = b * scale;
  const candidates = [
    String(b + scale),       // the scale added instead of multiplied
    ...whole(b, scale),      // divided instead of multiplied
    String(b),               // the side left unscaled
    String(matched),
    ...numericDistractors(answer, rng, 1),
  ];

  const prompt = `Two triangles are similar: the first has sides ${a} and ${b}, and the second's side matching the ${a} is ${matched}. What is the second's side matching the ${b}?`;
  return makeQuestion(skillId, `${a},${b},${matched}`, prompt, String(answer), pickDistinct(candidates, String(answer)), rng, prompt);
}

// ---------------------------------------------------------------------------
// Right-triangle trigonometry
// ---------------------------------------------------------------------------

type Ratio = "sin" | "cos" | "tan";

/** Which ratios each level may ask. */
const TRIG_RATIOS: readonly Ratio[][] = [
  ["sin"],
  ["sin", "cos"],
  ["sin", "cos"],
  ["sin", "cos", "tan"],
  ["sin", "cos", "tan"],
];
/** How far a triple may be scaled up, and the largest hypotenuse in play, per level. */
const TRIG_SCALE_MAX = [1, 1, 2, 2, 3];
const TRIG_HYP_MAX = [25, 29, 40, 60, 90];

const RATIO_WORDS: Record<Ratio, string> = { sin: "sine", cos: "cosine", tan: "tangent" };

/**
 * Right-triangle trigonometry (grade 10). **The sides come from the Pythagorean triple table
 * in `generators/middle.ts`**, imported rather than copied, for the reason the table exists:
 * `sin A` on arbitrary legs is irrational and cannot be one of four choices.
 *
 * All three sides are named in the prompt, which is what makes "cosine when the sine was
 * asked" a real mistake rather than an impossible one — a child who reaches for the wrong pair
 * has both pairs in front of them. It is also what gives the verifier something to check that
 * this generator never told it: `opposite² + adjacent² = hypotenuse²` holds here only because
 * the table is right, and the verifier tests it without ever seeing the table.
 *
 * No trigonometric function is called anywhere in this file. `Math.cos(Math.PI / 3)` is
 * `0.5000000000000001`, and a question whose right answer is a rounding error has no right
 * answer; every ratio here is a quotient of two whole numbers from the table.
 *
 * The two legs swap roles half the time, which is a real part of the skill — "opposite" is a
 * position relative to the angle, not a position on the page.
 */
export function trigRatios(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  let opposite = 0, adjacent = 0, hypotenuse = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    const [p, q, r] = PYTHAGOREAN_TRIPLES[randInt(rng, 0, PYTHAGOREAN_TRIPLES.length - 1)];
    const scale = randInt(rng, 1, TRIG_SCALE_MAX[lvl]);
    if (r * scale > TRIG_HYP_MAX[lvl]) continue;
    const flip = rng() < 0.5;
    opposite = (flip ? q : p) * scale;
    adjacent = (flip ? p : q) * scale;
    hypotenuse = r * scale;
    drawn = true;
  }
  if (!drawn) throw new Error(`could not draw a right triangle at level ${level}`);

  const ratios = TRIG_RATIOS[lvl];
  const ratio = ratios[randInt(rng, 0, ratios.length - 1)];
  const sine = frac(opposite, hypotenuse);
  const cosine = frac(adjacent, hypotenuse);
  const tangent = frac(opposite, adjacent);
  const cotangent = frac(adjacent, opposite);
  const answer = ratio === "sin" ? sine : ratio === "cos" ? cosine : tangent;
  // The first entry is always the ratio a child reaches for by mistake: the OTHER of sine and
  // cosine, or — for the tangent — the same two sides the other way up. No triple has two
  // equal legs, so none of these can ever be the answer; the test asserts it rather than
  // trusting this note.
  const candidates = ratio === "sin"
    ? [cosine, frac(hypotenuse, opposite), cotangent, tangent]
    : ratio === "cos"
      ? [sine, frac(hypotenuse, adjacent), tangent, cotangent]
      : [cotangent, sine, cosine, frac(hypotenuse, opposite)];

  const prompt = `In a right triangle, angle A has an opposite side of ${opposite}, an adjacent side of ${adjacent}, and a hypotenuse of ${hypotenuse}. What is ${ratio} A?`;
  return makeQuestion(
    skillId,
    `${opposite},${adjacent},${hypotenuse},${ratio}`,
    prompt,
    answer,
    pickDistinct(candidates, answer),
    rng,
    `In a right triangle, angle A has an opposite side of ${opposite}, an adjacent side of ${adjacent}, and a hypotenuse of ${hypotenuse}. What is the ${RATIO_WORDS[ratio]} of angle A?`,
  );
}

// ---------------------------------------------------------------------------
// Surface area and volume of solids
// ---------------------------------------------------------------------------

type Solid = "prism" | "cylinder" | "sphere" | "cone";

/** Which solids each level may draw. */
const SOLID_SHAPES: readonly Solid[][] = [
  ["prism"],
  ["prism", "cylinder"],
  ["prism", "cylinder"],
  ["prism", "cylinder"],
  ["prism", "cylinder", "sphere", "cone"],
];
/** Surface area is a wrong reading from level 0 and a QUESTION from level 2. */
const SOLID_ASKS_SURFACE = [false, false, true, true, true];
/** Largest edge, radius or height in play, per level. */
const SOLID_DIM_MAX = [4, 5, 6, 8, 10];

/**
 * A measure held exactly, as a whole numerator over a whole denominator. Nothing here is ever
 * a float: with pi written 314/100, a cylinder's volume is `314 r² h / 100` exactly, and a
 * sphere's is `4 × 314 r³ / 300`.
 */
type Exact = readonly [number, number];

/**
 * An exact measure rounded to tenths, as a whole number of tenths.
 *
 * No rounding tie can ever reach this. Every measure in this generator is `k × 314 / d` with
 * `d` in {1, 100, 300}, so ten times it is an even multiple of 157 over an odd denominator,
 * and a tie needs a value ending in exactly one half — `even = odd`, which has no solutions.
 * That is worth knowing because the verifier rounds the same value in floating point from the
 * 3.14 printed in the prompt: two roundings can only disagree on a tie, and there are none.
 */
function tenthsOf([numerator, denominator]: Exact): number {
  return Math.round((numerator * 10) / denominator);
}

const showTenths = (tenths: number): string => (tenths / 10).toFixed(1);

/**
 * Surface area and volume of solids (grade 10). A rectangular prism at level 0, a cylinder
 * from 1, surface area asked as well as offered from 2, wider dimensions at 3, and a sphere
 * or a cone at 4.
 *
 * **Every answer is one decimal place**, including a prism's, whose volume is a whole number.
 * `24` and `24.0` are the same measure spelled two ways, and a question whose right answer has
 * two spellings has no right answer — so there is one spelling.
 *
 * **The other measure of the same solid is always on screen**: the surface area where the
 * volume was asked and the volume where the surface area was. A cone is the exception in both
 * directions — it is only ever asked for its volume, because its surface needs a slant height
 * and `√(r² + h²)` is irrational for nearly every pair a child would be handed — so for a cone
 * the mandatory wrong reading is instead **the one third dropped**, which is the mistake that
 * skill is for. Either way the draw is thrown away when that reading rounds to the answer,
 * never backfilled: `pickDistinct` would quietly put an off-by-a-tenth in its place and the
 * question would stop testing what it exists to test.
 */
export function solidMeasure(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const dimMax = SOLID_DIM_MAX[lvl];
  const shapes = SOLID_SHAPES[lvl];
  let prompt = "", key = "";
  let answerTenths = 0, otherTenths = 0;
  let wrongTenths: number[] = [];
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    const shape = shapes[randInt(rng, 0, shapes.length - 1)];
    const wantVolume = shape === "cone" || !SOLID_ASKS_SURFACE[lvl] || rng() < 0.5;
    const measure = wantVolume ? "volume" : "surface area";
    let volume: Exact, surface: Exact, others: Exact[];
    if (shape === "prism") {
      const l = randInt(rng, 2, dimMax), w = randInt(rng, 2, dimMax), h = randInt(rng, 2, dimMax);
      volume = [l * w * h, 1];
      surface = [2 * (l * w + l * h + w * h), 1];
      others = wantVolume
        ? [[l * w, 1], [2 * (l + w + h), 1]]                    // two of the three sides; the edges
        : [[l * w + l * h + w * h, 1], [2 * (l + w + h), 1]];   // the doubling forgotten; the edges
      prompt = `A rectangular prism is ${l} by ${w} by ${h}. What is its ${measure}?`;
      key = `prism${l}x${w}x${h}${wantVolume ? "v" : "s"}`;
    } else if (shape === "cylinder") {
      const r = randInt(rng, 2, Math.min(dimMax, 8)), h = randInt(rng, 2, dimMax);
      volume = [314 * r * r * h, 100];
      surface = [628 * r * (r + h), 100];
      others = wantVolume
        ? [[314 * 4 * r * r * h, 100], [628 * r * h, 100]]      // the diameter used as the radius; the ends left off
        : [[314 * r * (r + h), 100], [628 * r * h, 100]];       // the doubling forgotten; the ends left off
      prompt = `A cylinder has radius ${r} and height ${h}. What is its ${measure}? Use 3.14 for pi.`;
      key = `cylinder${r}x${h}${wantVolume ? "v" : "s"}`;
    } else if (shape === "sphere") {
      const r = randInt(rng, 2, 6);
      volume = [4 * 314 * r * r * r, 300];
      surface = [4 * 314 * r * r, 100];
      others = wantVolume
        ? [[4 * 314 * 8 * r * r * r, 300], [314 * r * r * r, 100]]  // the diameter used as the radius; the 4/3 dropped
        : [[4 * 314 * 4 * r * r, 100], [314 * r * r, 100]];         // the diameter used as the radius; the 4 dropped
      prompt = `A sphere has radius ${r}. What is its ${measure}? Use 3.14 for pi.`;
      key = `sphere${r}${wantVolume ? "v" : "s"}`;
    } else {
      const r = randInt(rng, 2, 6), h = randInt(rng, 2, 8);
      volume = [314 * r * r * h, 300];
      surface = [314 * r * r * h, 100];                           // NOT a cone's surface; see below
      others = [[314 * r * r * h, 100], [314 * 4 * r * r * h, 300]]; // the third dropped; the diameter used as the radius
      prompt = `A cone has radius ${r} and height ${h}. What is its volume? Use 3.14 for pi.`;
      key = `cone${r}x${h}v`;
    }
    // For a cone `surface` holds the third-dropped reading rather than a surface area, which
    // is what makes this one line say "the mandatory wrong reading" for all four solids.
    answerTenths = tenthsOf(wantVolume ? volume : surface);
    otherTenths = tenthsOf(wantVolume ? surface : volume);
    wrongTenths = others.map(tenthsOf);
    drawn = otherTenths !== answerTenths;
  }
  if (!drawn) throw new Error(`could not draw a solid with two different measures at level ${level}`);

  const answer = showTenths(answerTenths);
  const nudges = [answerTenths + 10, answerTenths - 10, answerTenths + 1, answerTenths - 1, answerTenths * 2]
    .filter((t) => t > 0)
    .map(showTenths);
  const distractors = pickDistinct([showTenths(otherTenths), ...wrongTenths.filter((t) => t > 0).map(showTenths), ...nudges], answer);
  if (distractors.length !== 3) throw new Error(`could not build three wrong measures for ${prompt}`);

  return makeQuestion(
    skillId,
    key,
    prompt,
    answer,
    distractors,
    rng,
    // "three point one four" and "pi" as words, the same way the grade-7 circle generator says
    // them: the symbol is never on screen and must never be spoken as one.
    prompt.replace("Use 3.14 for pi.", "Use three point one four for pi."),
  );
}

// ---------------------------------------------------------------------------
// Distance and midpoint
// ---------------------------------------------------------------------------

/** Midpoint joins at level 1; before that this skill only asks for a distance. */
const DIST_ASKS_MIDPOINT = [false, true, true, true, true];
/** How far the first point may sit from the origin, per level. */
const DIST_ORIGIN_MAX = [5, 6, 8, 10, 12];
/** Negative coordinates join at level 3. */
const DIST_NEGATIVE = [false, false, false, true, true];
/** How far a triple may be scaled, and the largest distance in play, per level. */
const DIST_SCALE_MAX = [1, 1, 1, 1, 2];
const DIST_HYP_MAX = [13, 17, 25, 29, 60];

/** "(1, 2)" — a point as it is written on screen. */
const point = (x: number, y: number): string => `(${x}, ${y})`;
/** "the point 1, 2" — a point as it is spoken, with no bracket and no bare minus sign. */
const spokenPoint = (x: number, y: number): string => `the point ${speakInt(x)}, ${speakInt(y)}`;

/**
 * Distance and midpoint (grade 10). **The two points always differ by the legs of a
 * Pythagorean triple**, imported from `generators/middle.ts` for the reason the table exists:
 * the distance between two points picked freely is irrational and cannot be one of four
 * choices.
 *
 * The midpoint is asked from level 1 and **the midpoint is offered as a wrong answer to every
 * distance question**, which the plan asks for. It is a weak distractor — a point among three
 * numbers is visibly the odd one out — and it is on screen anyway, because the mistake it
 * names is real: a child who works the midpoint formula when the question said distance has
 * told you exactly what they did not read.
 *
 * Three midpoint draws are thrown away. Two points that sum to the origin make "the halving
 * forgotten" the answer; a midpoint whose two coordinates are equal makes "the coordinates
 * swapped" the answer; and the remaining collisions are found by rendering all four choices
 * and insisting they differ, rather than by being enumerated here.
 */
export function distMidpoint(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const origin = DIST_ORIGIN_MAX[lvl];
  const low = DIST_NEGATIVE[lvl] ? -origin : 0;
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0, hypotenuse = 0;
  let wantDistance = true;
  let drawn = false;
  for (let attempt = 0; attempt < 600 && !drawn; attempt++) {
    const [p, q, r] = PYTHAGOREAN_TRIPLES[randInt(rng, 0, PYTHAGOREAN_TRIPLES.length - 1)];
    const scale = randInt(rng, 1, DIST_SCALE_MAX[lvl]);
    if (r * scale > DIST_HYP_MAX[lvl]) continue;
    const flip = rng() < 0.5;
    const signX = DIST_NEGATIVE[lvl] && rng() < 0.5 ? -1 : 1;
    const signY = DIST_NEGATIVE[lvl] && rng() < 0.5 ? -1 : 1;
    x1 = randInt(rng, low, origin);
    y1 = randInt(rng, low, origin);
    x2 = x1 + (flip ? q : p) * scale * signX;
    y2 = y1 + (flip ? p : q) * scale * signY;
    hypotenuse = r * scale;
    wantDistance = !DIST_ASKS_MIDPOINT[lvl] || rng() < 0.5;
    drawn = wantDistance || ((x1 + x2 !== 0 || y1 + y2 !== 0) && (x1 + x2) !== (y1 + y2));
  }
  if (!drawn) throw new Error(`could not draw a pair of points at level ${level}`);

  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const midpoint = point(mx, my);
  const answer = wantDistance ? String(hypotenuse) : midpoint;
  const candidates = wantDistance
    ? [
      midpoint,                                        // the midpoint worked when the distance was asked
      // A distance is never negative, so a negative near-miss is a choice that announces itself.
      ...[x1 + y1 + x2 + y2, Math.abs(x2 - x1), Math.abs(y2 - y1)].filter((v) => v > 0).map(String),
      ...numericDistractors(hypotenuse, rng, 1),
    ]
    : [
      point(x1 + x2, y1 + y2),                         // the halving forgotten
      point(my, mx),                                   // the coordinates swapped
      point(x2 - x1, y2 - y1),                         // the difference rather than the middle
      String(hypotenuse),                              // the distance, when the midpoint was asked
      point(mx + 1, my),
      point(mx, my + 1),
    ];

  const measure = wantDistance ? `the distance between ${point(x1, y1)} and ${point(x2, y2)}` : `the midpoint of ${point(x1, y1)} and ${point(x2, y2)}`;
  const spoken = wantDistance ? `the distance between ${spokenPoint(x1, y1)} and ${spokenPoint(x2, y2)}` : `the midpoint of ${spokenPoint(x1, y1)} and ${spokenPoint(x2, y2)}`;
  const distractors = pickDistinct(candidates, answer);
  if (distractors.length !== 3) throw new Error(`could not build three wrong readings for ${measure}`);
  return makeQuestion(
    skillId,
    `${wantDistance ? "d" : "m"}${x1},${y1},${x2},${y2}`,
    `What is ${measure}?`,
    answer,
    distractors,
    rng,
    `What is ${spoken}?`,
  );
}

// ---------------------------------------------------------------------------
// Grade 11 — Algebra II
// ---------------------------------------------------------------------------

/** How far a root may sit from zero, per level. */
const QUAD_ROOT_LOW = [1, 1, -3, -6, -9];
const QUAD_ROOT_HIGH = [5, 7, 7, 9, 9];

/**
 * Quadratics with whole roots (grade 11). The equation is built from its roots and printed
 * expanded, so the question a child answers is the one the plan names; the leading coefficient
 * is 1 until level 4, where it is 2 or 3 and the roots have to survive a division.
 *
 * Four draws are thrown away, and the first is the one the plan calls out by name:
 *
 *  - **A repeated root.** "The larger root" means nothing when both roots are the same number,
 *    and the smaller root — this skill's mandatory wrong answer — would BE the answer.
 *  - **A root of zero**, which prints `x² - 5x + 0` and is `x(x - 5)` written the long way.
 *  - **Roots that cancel**, `p = -q`, which prints `x² - 9 = 0` with no middle term at all and
 *    makes "both signs flipped" the answer.
 *
 * "The sum of the roots" is offered too and is not guarded at the draw: it equals the larger
 * root only when the smaller is zero, which is already thrown away.
 */
export function quadFormula(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  let p = 0, q = 0, a = 1;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    a = lvl >= 4 ? randInt(rng, 2, 3) : 1;
    p = randInt(rng, QUAD_ROOT_LOW[lvl], QUAD_ROOT_HIGH[lvl]);
    q = randInt(rng, QUAD_ROOT_LOW[lvl], QUAD_ROOT_HIGH[lvl]);
    drawn = p !== q && p !== 0 && q !== 0 && p + q !== 0;
  }
  if (!drawn) throw new Error(`could not draw a quadratic with two whole roots at level ${level}`);

  const larger = Math.max(p, q), smaller = Math.min(p, q);
  const b = -a * (p + q), c = a * p * q;
  const middle = `${b < 0 ? "-" : "+"} ${Math.abs(b) === 1 ? "" : Math.abs(b)}x`;
  const candidates = [
    String(smaller),      // the smaller root
    String(-smaller),     // the larger root with both signs flipped
    String(p + q),        // the sum of the roots
    String(p * q),
    ...numericDistractors(larger, rng),
  ];

  return makeQuestion(
    skillId,
    `${a},${b},${c}`,
    `Solve: ${a === 1 ? "" : a}x² ${middle} ${signed(c)} = 0. What is the larger root?`,
    String(larger),
    pickDistinct(candidates, String(larger)),
    rng,
    // "x squared", never `x²`: a screen reader says the superscript as a separate number.
    `Solve: ${a === 1 ? "" : `${a} `}x squared ${b < 0 ? "minus" : "plus"} ${Math.abs(b) === 1 ? "" : `${Math.abs(b)} `}x ${spokenSign(c)}, equals 0. What is the larger root?`,
  );
}

// ---------------------------------------------------------------------------
// Polynomial arithmetic
// ---------------------------------------------------------------------------

/** Largest number inside a factor, per level. */
const POLY_SPAN = [5, 5, 8, 5, 8];
/** Negatives inside a factor join at level 1; a trinomial factor joins at level 3. */
const POLY_NEGATIVE = [false, true, true, true, true];
const POLY_TRINOMIAL = [false, false, false, true, true];

/** "x squared", "x", "" — a power as it is spoken, never as a superscript. */
const POWER_SPOKEN = ["", "x", "x squared", "x cubed"];

/**
 * A polynomial in descending powers, monic, with a coefficient of one left unwritten and a
 * coefficient of zero not written at all: `[1, -2, -15]` is `x² - 2x - 15`.
 *
 * **The dropped zero is the point.** "The middle term forgotten" is the FOIL shortcut error
 * this skill exists to catch, and it is spelled `x² - 15` rather than `x² + 0x - 15` — so the
 * renderer has to drop it here, once, rather than at three call sites.
 */
function polynomial(coefficients: number[]): string {
  const degree = coefficients.length - 1;
  let out = "";
  for (let i = 0; i < coefficients.length; i++) {
    const coefficient = coefficients[i];
    if (coefficient === 0) continue;
    const power = degree - i;
    const size = Math.abs(coefficient);
    const body = power === 0 ? String(size) : `${size === 1 ? "" : size}x${power === 2 ? "²" : power === 3 ? "³" : ""}`;
    out = out === "" ? `${coefficient < 0 ? "-" : ""}${body}` : `${out} ${coefficient < 0 ? "-" : "+"} ${body}`;
  }
  return out === "" ? "0" : out;
}

/** The same polynomial spoken: "x squared minus 2 x minus 15". */
function spokenPolynomial(coefficients: number[]): string {
  const degree = coefficients.length - 1;
  let out = "";
  for (let i = 0; i < coefficients.length; i++) {
    const coefficient = coefficients[i];
    if (coefficient === 0) continue;
    const power = degree - i;
    const size = Math.abs(coefficient);
    const body = power === 0 ? String(size) : `${size === 1 ? "" : `${size} `}${POWER_SPOKEN[power]}`;
    out = out === "" ? `${coefficient < 0 ? "negative " : ""}${body}` : `${out} ${coefficient < 0 ? "minus" : "plus"} ${body}`;
  }
  return out === "" ? "0" : out;
}

/**
 * Polynomial arithmetic (grade 11). Two binomials at levels 0-2, a trinomial times a binomial
 * at 3 and 4.
 *
 * **Every coefficient of the product is non-zero**, and that is a guard rather than a taste:
 * all three of this skill's characteristic mistakes change exactly one coefficient — the
 * middle term's sign, the middle term dropped, the constant's sign — and each of them is the
 * answer again the moment the coefficient it changes is zero.
 */
export function polyOps(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const span = POLY_SPAN[lvl];
  const draw = () => {
    let value = 0;
    do {
      value = randInt(rng, -span, span);
    } while (value === 0 || (!POLY_NEGATIVE[lvl] && value < 0));
    return value;
  };

  let first: number[] = [], second: number[] = [], product: number[] = [];
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    if (POLY_TRINOMIAL[lvl]) {
      const b = draw(), c = draw(), d = draw();
      first = [1, b, c];
      second = [1, d];
      product = [1, b + d, c + b * d, c * d];
    } else {
      const p = draw(), r = draw();
      first = [1, p];
      second = [1, r];
      product = [1, p + r, p * r];
    }
    drawn = product.slice(1).every((coefficient) => coefficient !== 0);
  }
  if (!drawn) throw new Error(`could not draw a product with no missing term at level ${level}`);

  const last = product.length - 1;
  const flipMiddle = product.map((v, i) => (i === last - 1 ? -v : v));
  const dropMiddle = product.map((v, i) => (i === last - 1 ? 0 : v));
  const flipConstant = product.map((v, i) => (i === last ? -v : v));
  const candidates = [
    polynomial(flipMiddle),    // the middle term's sign wrong
    polynomial(dropMiddle),    // the middle term forgotten — the FOIL shortcut error
    polynomial(flipConstant),  // the constant's sign wrong
    polynomial(product.map((v, i) => (i === last ? v + 1 : v))),
  ];

  return makeQuestion(
    skillId,
    `(${polynomial(first)})(${polynomial(second)})`.replace(/ /g, ""),
    `Expand: (${polynomial(first)})(${polynomial(second)})`,
    polynomial(product),
    pickDistinct(candidates, polynomial(product)),
    rng,
    `Expand: the quantity ${spokenPolynomial(first)}, times the quantity ${spokenPolynomial(second)}`,
  );
}

// ---------------------------------------------------------------------------
// Radicals
// ---------------------------------------------------------------------------

/** The perfect square pulled out, per level: level N may draw from the first N + 1 of these. */
const RADICAL_FACTORS = [4, 9, 16, 25, 36];
/**
 * What may be left under the root. Every one of these is SQUARE-FREE — no square divides any
 * of them — which is what makes `a√b` fully simplified and makes the largest square factor of
 * `f × b` exactly `f`, for every `f` in the table above.
 */
const RADICAL_SQUARE_FREE = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15];

/**
 * Radicals (grade 11). The answer is `a√b` with `b` square-free, or a bare integer when the
 * radicand is a perfect square.
 *
 * **A perfect square is never 4.** `√4` is `2`, and half of 4 is also 2, so the "halved rather
 * than rooted" reading would be the answer. The rest of the collisions cannot happen: the
 * un-simplified `√n` and the under-simplified `d√(n/d²)` are both real square roots of `n` and
 * are told apart from the answer only by whether what is left under the root is square-free.
 * That is exactly the assertion the verifier must carry, and this generator offers those two
 * readings precisely so that a verifier missing it would be caught.
 */
export function radicalOps(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const factors = RADICAL_FACTORS.slice(0, lvl + 1);
  const square = factors[randInt(rng, 0, factors.length - 1)];
  const root = RADICAL_FACTORS.indexOf(square) + 2;
  const perfect = square > 4 && rng() < 0.2;
  const free = perfect ? 1 : RADICAL_SQUARE_FREE[randInt(rng, 0, RADICAL_SQUARE_FREE.length - 1)];
  const radicand = square * free;

  // A square factor smaller than the one that should come out: "9 pulled from 72 as 4".
  const underSimplified: string[] = [];
  for (let d = 2; d * d < square; d++) {
    if (radicand % (d * d) === 0) underSimplified.push(`${d}√${radicand / (d * d)}`);
  }

  // A different square-free radicand, for the same-coefficient distractor below.
  const otherFree = RADICAL_SQUARE_FREE.find((f) => f !== free) ?? free + 1;

  const answer = free === 1 ? String(root) : `${root}√${free}`;
  const candidates = perfect
    ? [
      `√${radicand}`,             // left un-simplified
      ...underSimplified,         // the wrong square factor pulled out
      String(radicand),           // the radicand handed back as if it were its own root
      ...whole(radicand, 2),      // halved rather than rooted
      String(root * 2),
      String(root + 1),
    ]
    : [
      // FIRST, so it is always offered: a wrong answer wearing the right coefficient.
      // Without it a child could answer the whole skill without simplifying anything — at
      // level 0 the only square factor is 4, so every answer reads `2√something`, and the
      // other three choices were an integer, a bare root, and a different coefficient.
      // Picking the one that starts with 2 scored 100%. Same shape as the halves question
      // that was answerable by "it must be under 1": a question a child can pass by looking.
      `${root}√${otherFree}`,
      `√${radicand}`,             // left un-simplified
      ...underSimplified,         // the wrong square factor pulled out
      `${square}√${free}`,        // the factor pulled out without taking its root
      String(root),               // the whole root read off as an integer
      `${root + 1}√${free}`,
    ];

  const distractors = pickDistinct(candidates, answer);
  if (distractors.length !== 3) throw new Error(`could not build three wrong simplifications of ${radicand}`);
  return makeQuestion(
    skillId,
    String(radicand),
    `Simplify: √${radicand}`,
    answer,
    distractors,
    rng,
    // `√` is banned from spoken text and this is why: "the square root of 72" is what a child
    // on read-aloud needs to hear. The answer `6√2` speaks as "6 times the square root of 2".
    `Simplify: the square root of ${radicand}`,
  );
}

// ---------------------------------------------------------------------------
// Logarithms
// ---------------------------------------------------------------------------

/** Which bases each level may draw. Base 10 joins at level 2. */
const LOG_BASES: readonly number[][] = [[2, 3, 5], [2, 3, 5], [2, 3, 5, 10], [2, 3, 5, 10], [2, 3, 5, 10]];
/** Largest exponent, per level. */
const LOG_EXP_MAX = [4, 6, 6, 6, 6];
/**
 * Which bases may be asked with a NEGATIVE exponent — a unit fraction for an argument. Phased
 * in across the top two rungs rather than switched on at once, because a rung that adds only a
 * handful of new questions is barely a rung: a child promoted into it is handed the pool they
 * just left while their mastery number climbs.
 */
const LOG_NEGATIVE_BASES: readonly number[][] = [[], [], [], [2, 3], [2, 3, 5, 10]];
/**
 * Largest argument in play. `log(1000000)` is an exercise in counting zeros rather than a
 * harder question about logarithms, so base 10 stops at five.
 */
const LOG_ARG_MAX = 100000;

/** How each base is written. Base 10 is written with no subscript at all, by convention. */
const LOG_SUBSCRIPT: Record<number, string> = { 2: "₂", 3: "₃", 5: "₅", 10: "" };

/**
 * Logarithms (grade 11). The argument is always a whole power of the base, so the answer is a
 * whole number; from level 3 the exponent may be negative and the argument is then a unit
 * fraction, which is where a child first has to read `log₂(1/8)` as `-3`.
 *
 * **The base is this skill's mandatory wrong answer** — a child who answers `2` to `log₂(32)`
 * has told you exactly which number they read — so a draw where the base and the exponent are
 * the same number is thrown away. `log₃(27)` is 3, and offering 3 as the mistake would offer
 * the answer.
 *
 * `log(1000)` rather than `log₁₀(1000)`, matching the convention every textbook uses. The
 * read-aloud says the base anyway: an implicit 10 is a convention on the page and not
 * something a child listening should have to already know.
 */
export function logRules(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const bases = LOG_BASES[lvl];
  let base = 2, exponent = 1, power = 1;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    base = bases[randInt(rng, 0, bases.length - 1)];
    const size = randInt(rng, 1, LOG_EXP_MAX[lvl]);
    exponent = LOG_NEGATIVE_BASES[lvl].includes(base) && rng() < 0.45 ? -size : size;
    power = base ** size;
    drawn = power <= LOG_ARG_MAX && base !== exponent;
  }
  if (!drawn) throw new Error(`could not draw a logarithm at level ${level}`);

  const argument = exponent < 0 ? `1/${power}` : String(power);
  const candidates = [
    String(base),                                                  // the base read off as the answer
    ...(exponent < 0 ? [String(-exponent)] : whole(power, base)),   // the minus dropped; the argument divided by the base
    String(exponent + 1),
    String(exponent - 1),
    ...numericDistractors(exponent, rng),
  ];

  return makeQuestion(
    skillId,
    `${base}:${argument}`,
    `What is log${LOG_SUBSCRIPT[base]}(${argument})?`,
    String(exponent),
    pickDistinct(candidates, String(exponent)),
    rng,
    `What is log base ${base} of ${exponent < 0 ? `1 over ${power}` : power}?`,
  );
}

// ---------------------------------------------------------------------------
// Function composition
// ---------------------------------------------------------------------------

/** Largest coefficient, constant and input, per level. */
const COMPOSE_COEF_MAX = [3, 4, 5, 5, 5];
const COMPOSE_CONST_MAX = [5, 6, 8, 8, 8];
const COMPOSE_INPUT_MAX = [5, 8, 10, 10, 10];
/** Negative constants join at level 3; negative coefficients and inputs at level 4. */
const COMPOSE_NEGATIVE_CONST = [false, false, false, true, true];
const COMPOSE_NEGATIVE_ALL = [false, false, false, false, true];

/** "2x + 1", "x - 3", "-2x + 5" — a linear function as it is written. */
const linear = (slope: number, constant: number): string => `${leadTerm(slope, "x")} ${signed(constant)}`;
/** The same function spoken: "2 x plus 1", "negative x minus 3". */
const spokenLinear = (slope: number, constant: number): string =>
  `${slope === 1 ? "" : slope === -1 ? "negative " : `${speakInt(slope)} `}x ${spokenSign(constant)}`;

/**
 * Function composition (grade 11). Always the inner function first — `f(g(4))` — because
 * deciding which one goes first IS the skill, and **`g(f(4))` is always on screen**: a child
 * who works the outer function first has told you exactly what they did.
 *
 * Three draws are thrown away, one per wrong reading this skill promises to offer:
 *
 *  - **`f(g(n)) = g(f(n))`**, which happens when `d(a - 1) = b(c - 1)` — at `a = c = 1`, for
 *    instance, where both compositions are `n + b + d`. The order would make no difference and
 *    the mandatory distractor would be the answer.
 *  - **`g(n) = n`**, which makes `f(g(n))` and `f(n)` the same number.
 *  - **`f(g(n)) = g(n)`**, which makes the inner value alone the answer.
 *
 * Neither function is ever constant: a coefficient of zero prints `0x + 1` and composes with
 * nothing.
 */
export function fnCompose(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const coefficient = () => randInt(rng, 1, COMPOSE_COEF_MAX[lvl]) * (COMPOSE_NEGATIVE_ALL[lvl] && rng() < 0.4 ? -1 : 1);
  const constant = () => randInt(rng, 1, COMPOSE_CONST_MAX[lvl]) * (COMPOSE_NEGATIVE_CONST[lvl] && rng() < 0.5 ? -1 : 1);

  let a = 1, b = 1, c = 1, d = 1, at = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    a = coefficient();
    b = constant();
    c = coefficient();
    d = constant();
    at = randInt(rng, COMPOSE_NEGATIVE_ALL[lvl] ? -COMPOSE_INPUT_MAX[lvl] : 0, COMPOSE_INPUT_MAX[lvl]);
    const inner = c * at + d;
    const answer = a * inner + b;
    drawn = answer !== c * (a * at + b) + d && answer !== a * at + b && answer !== inner;
  }
  if (!drawn) throw new Error(`could not draw a composition worth asking at level ${level}`);

  const inner = c * at + d;
  const answer = a * inner + b;
  const candidates = [
    String(c * (a * at + b) + d),   // g(f(n)) — the order reversed
    String(a * at + b),             // f(n) alone
    String(inner),                  // g(n) alone
    ...numericDistractors(answer, rng),
  ];

  return makeQuestion(
    skillId,
    `${a},${b},${c},${d},${at}`,
    `If f(x) = ${linear(a, b)} and g(x) = ${linear(c, d)}, what is f(g(${at}))?`,
    String(answer),
    pickDistinct(candidates, String(answer)),
    rng,
    `If f of x equals ${spokenLinear(a, b)} and g of x equals ${spokenLinear(c, d)}, what is f of g of ${speakInt(at)}?`,
  );
}

// ---------------------------------------------------------------------------
// Grade 12 — Precalculus and statistics
// ---------------------------------------------------------------------------

/**
 * The special angles, with the cosine and sine of each **written out as the string a child
 * writes**, never computed.
 *
 * `Math.cos(Math.PI / 3)` is `0.5000000000000001`, and a question whose right answer is a
 * rounding error has no right answer — so no trigonometric function is called here any more
 * than it is in `trigRatios` above. The radian column is the same angle's other spelling, and
 * the angle 0 has none: "0 radians" is just 0, and printing it twice would be two prompts
 * asking one question.
 */
type SpecialAngle = { readonly degrees: number; readonly radians: string; readonly cos: string; readonly sin: string };

const UNIT_CIRCLE: readonly SpecialAngle[] = [
  { degrees: 0, radians: "", cos: "1", sin: "0" },
  { degrees: 30, radians: "π/6", cos: "√3/2", sin: "1/2" },
  { degrees: 45, radians: "π/4", cos: "√2/2", sin: "√2/2" },
  { degrees: 60, radians: "π/3", cos: "1/2", sin: "√3/2" },
  { degrees: 90, radians: "π/2", cos: "0", sin: "1" },
  { degrees: 120, radians: "2π/3", cos: "-1/2", sin: "√3/2" },
  { degrees: 135, radians: "3π/4", cos: "-√2/2", sin: "√2/2" },
  { degrees: 150, radians: "5π/6", cos: "-√3/2", sin: "1/2" },
  { degrees: 180, radians: "π", cos: "-1", sin: "0" },
  { degrees: 210, radians: "7π/6", cos: "-√3/2", sin: "-1/2" },
  { degrees: 225, radians: "5π/4", cos: "-√2/2", sin: "-√2/2" },
  { degrees: 240, radians: "4π/3", cos: "-1/2", sin: "-√3/2" },
  { degrees: 270, radians: "3π/2", cos: "0", sin: "-1" },
  { degrees: 300, radians: "5π/3", cos: "1/2", sin: "-√3/2" },
  { degrees: 315, radians: "7π/4", cos: "√2/2", sin: "-√2/2" },
  { degrees: 330, radians: "11π/6", cos: "√3/2", sin: "-1/2" },
];

/** Every value the circle takes, as a tail of plausible wrong readings. */
const UNIT_CIRCLE_VALUES = ["1/2", "√2/2", "√3/2", "-1/2", "-√2/2", "-√3/2", "0", "1", "-1"];

/**
 * How far around the circle each level may reach, as a count of the table above: quadrant I,
 * then II, then the whole circle.
 */
const UNIT_CIRCLE_REACH = [5, 9, 16, 16, 16];
/**
 * How far around the circle each level may ask in RADIANS, same count, zero meaning degrees
 * only. This is the second axis and the better one: levels 0-2 widen the angle, and levels 3
 * and 4 change the spelling rather than reaching for angles that do not exist. A special angle
 * in radians is a different piece of reading from the same angle in degrees, and it is half of
 * what this skill is named for.
 */
const UNIT_CIRCLE_RADIAN_REACH = [0, 0, 0, 9, 16];

/** "-√3/2" from "√3/2", and back. Zero has no other sign, and comes back unchanged. */
const negated = (value: string): string =>
  value === "0" ? "0" : value.startsWith("-") ? value.slice(1) : `-${value}`;

/** "5π/6" said aloud: "5 pi over 6". `π` and `/` are both banned from spoken text. */
function spokenRadians(radians: string): string {
  const m = /^(\d*)π(?:\/(\d+))?$/.exec(radians);
  if (!m) throw new Error(`not an angle in radians: ${radians}`);
  const head = m[1] === "" ? "pi" : `${m[1]} pi`;
  return m[2] === undefined ? head : `${head} over ${m[2]}`;
}

/**
 * The unit circle (grade 12). Quadrant I at level 0, quadrant II from 1, the whole circle from
 * 2, and radians from 3 — quadrants I and II at level 3, all four at level 4.
 *
 * **The other function is this skill's mandatory wrong answer**: the sine where the cosine was
 * asked, and the cosine where the sine was. A child who reads the wrong coordinate off the
 * point has told you exactly what they did.
 *
 * It is offered at every angle but two, and those two are named rather than redrawn. At 45° and
 * 225° the sine and the cosine ARE the same number, so there is no wrong reading to offer — and
 * throwing those draws away would cost level 0 two of its ten questions to buy an assertion
 * that is already true. The sign flipped is offered the same way and fails on the same terms:
 * an answer of 0 has no other sign. Neither gap is silent — `high.test.ts` asserts that the
 * co-function is on screen at every angle where the two differ, that the sign flip is on screen
 * whenever the answer is not zero, and that the exceptions are exactly those angles and no
 * others. A `toContain` with nothing standing behind it is the failure this file is built to
 * avoid, and a conditional one that says exactly when it applies is not that.
 */
export function unitCircle(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const radianReach = UNIT_CIRCLE_RADIAN_REACH[lvl];
  // Index 0 is the angle 0, which has no radian spelling, so a radian draw starts at 1.
  const useRadians = radianReach > 0 && rng() < 0.5;
  const entry = useRadians
    ? UNIT_CIRCLE[randInt(rng, 1, radianReach - 1)]
    : UNIT_CIRCLE[randInt(rng, 0, UNIT_CIRCLE_REACH[lvl] - 1)];

  const wantCosine = rng() < 0.5;
  const answer = wantCosine ? entry.cos : entry.sin;
  const other = wantCosine ? entry.sin : entry.cos;
  const ratio = wantCosine ? "cos" : "sin";
  const candidates = [
    other,             // the other coordinate of the same point — the defining error
    negated(answer),   // the right value in the wrong quadrant
    negated(other),
    ...UNIT_CIRCLE_VALUES,
  ];

  const angle = useRadians ? entry.radians : `${entry.degrees}°`;
  const spokenAngle = useRadians ? spokenRadians(entry.radians) : `${entry.degrees} degrees`;
  return makeQuestion(
    skillId,
    // The angle's SPELLING is part of the key: `cos(60°)` and `cos(π/3)` are one question
    // asked two ways, and two prompts sharing one id is a question that can be asked twice.
    `${ratio}${angle}`,
    `What is ${ratio}(${angle})?`,
    answer,
    pickDistinct(candidates, answer),
    rng,
    `What is the ${wantCosine ? "cosine" : "sine"} of ${spokenAngle}?`,
  );
}

// ---------------------------------------------------------------------------
// Arithmetic and geometric sequences
// ---------------------------------------------------------------------------

/**
 * Largest first term, per level. The geometric rungs start lower than the arithmetic ones and
 * are held there by the cap on the term itself: `9 × 3⁷` is 19683 and never gets drawn.
 */
const SEQ_START_MAX = [9, 12, 15, 6, 9];
/** Largest common difference, per level; the geometric rungs use the ratio cap instead. */
const SEQ_DIFF_MAX = [5, 8, 9, 0, 0];
/** Largest term index in play, per level. */
const SEQ_TERM_MAX = [8, 10, 12, 8, 8];
/** Geometric from level 3, a negative common difference from 2, a negative ratio at 4. */
const SEQ_GEOMETRIC = [false, false, false, true, true];
const SEQ_NEGATIVE_DIFF = [false, false, true, false, false];
const SEQ_NEGATIVE_RATIO = [false, false, false, false, true];
/**
 * The ratio and the term index are both capped hard, and the term itself is capped on top of
 * them. `4 × 3⁷` is 8748 and `6 × 3⁷` is 13122: numbers a child copies out rather than reasons
 * about, and four near-misses around one of them is an exercise in reading digits.
 */
const SEQ_RATIO_MAX = 3;
const SEQ_TERM_VALUE_MAX = 6000;

/** "7th", "12th" — and "21st", should a level ever reach that far. */
function ordinal(n: number): string {
  const rest = n % 100, last = n % 10;
  const suffix = rest >= 11 && rest <= 13 ? "th" : last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

/** The same ordinal spoken. A screen reader says "7th" as "seventh" on a good day and "seven th" on a bad one. */
const ORDINAL_WORDS: Record<number, string> = {
  5: "fifth", 6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth",
  10: "tenth", 11: "eleventh", 12: "twelfth",
};

/**
 * Arithmetic and geometric sequences (grade 12). Arithmetic at levels 0-2, with a negative
 * common difference from 2; geometric at 3 and 4, with a negative ratio at 4 — which is the
 * rung where the terms start alternating in sign and the shape of the question changes rather
 * than its size.
 *
 * **The off-by-one term is this skill's mandatory wrong answer.** `a + nd` instead of
 * `a + (n - 1)d` is the mistake the nth-term formula exists to prevent, and it is never the
 * answer here: the two differ by `d`, which is never zero, and by a factor of `r`, which is
 * never one. The first term is never 0 for the same reason, in the geometric case: every term
 * of a sequence starting at zero is zero.
 *
 * **The sum is offered and the draw is thrown away when it equals the term.** With a negative
 * common difference a partial sum can land exactly on a later term, and a mandatory wrong
 * answer that is quietly the right one is the failure `pickDistinct` hides by backfilling.
 */
export function sequences(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const geometric = SEQ_GEOMETRIC[lvl];
  let start = 0, step = 0, index = 5, answer = 0, sum = 0, offByOne = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 600 && !drawn; attempt++) {
    index = randInt(rng, 5, SEQ_TERM_MAX[lvl]);
    if (geometric) {
      start = randInt(rng, 2, SEQ_START_MAX[lvl]);
      step = randInt(rng, 2, SEQ_RATIO_MAX) * (SEQ_NEGATIVE_RATIO[lvl] && rng() < 0.5 ? -1 : 1);
      answer = start * step ** (index - 1);
      offByOne = start * step ** index;
      sum = (start * (step ** index - 1)) / (step - 1);
    } else {
      start = randInt(rng, 1, SEQ_START_MAX[lvl]);
      step = randInt(rng, 2, SEQ_DIFF_MAX[lvl]) * (SEQ_NEGATIVE_DIFF[lvl] && rng() < 0.5 ? -1 : 1);
      answer = start + (index - 1) * step;
      offByOne = start + index * step;
      sum = (index * (2 * start + (index - 1) * step)) / 2;
    }
    drawn = Math.abs(answer) <= SEQ_TERM_VALUE_MAX && Math.abs(offByOne) <= SEQ_TERM_VALUE_MAX * 3 && sum !== answer;
  }
  if (!drawn) throw new Error(`could not draw a sequence at level ${level}`);

  const candidates = [
    String(offByOne),                              // n steps taken instead of n - 1
    String(sum),                                   // the first n terms added up instead
    String(geometric ? start * step : start + step),  // the step applied once — the second term
    ...numericDistractors(answer, rng),
  ];

  const kind = geometric ? "geometric" : "arithmetic";
  const named = geometric ? "ratio" : "difference";
  return makeQuestion(
    skillId,
    `${geometric ? "g" : "a"}${start},${step},${index}`,
    `An ${kind} sequence starts at ${start} with common ${named} ${step}. What is the ${ordinal(index)} term?`,
    String(answer),
    pickDistinct(candidates, String(answer)),
    rng,
    `An ${kind} sequence starts at ${start} with common ${named} ${speakInt(step)}. What is the ${ORDINAL_WORDS[index]} term?`,
  );
}

// ---------------------------------------------------------------------------
// Probability
// ---------------------------------------------------------------------------

/** The colours a bag may hold, in the order they are printed. */
const MARBLE_COLORS = ["red", "blue", "green"];
/** How many colours are in the bag, and how many marbles of each, per level. */
const PROB_COLORS = [2, 2, 3, 2, 3];
const PROB_COUNT_MAX = [5, 9, 9, 6, 6];
/** Two draws, with replacement, from level 3. */
const PROB_DRAWS = [1, 1, 1, 2, 2];

/** "3 red and 5 blue", "3 red, 2 blue and 4 green" — the bag as a child reads it. */
function bagText(counts: number[]): string {
  const parts = counts.map((count, i) => `${count} ${MARBLE_COLORS[i]}`);
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Probability of simple events (grade 12). One draw at levels 0-2 — a third colour joins at 2,
 * which is what makes "the part over the whole" mean something a two-colour bag cannot teach —
 * and two independent draws with replacement from 3.
 *
 * **The complement is this skill's mandatory wrong answer**, and an equal split makes it the
 * right one: 3 red and 3 blue is `1/2` whichever way a child reads it. That draw is thrown away
 * at every level, including the two-draw ones where `t² - r² = r²` has no whole-number solution
 * and it could not have collided — one rule about the bag is easier to hold than two.
 *
 * **The part over the other part** is offered beside it, which is the same misreading pointed
 * the other way, and it can never be the answer: `r/o = r/t` needs `r = 0`, and the bag always
 * holds at least one of every colour.
 */
export function probability(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const colors = PROB_COLORS[lvl];
  const draws = PROB_DRAWS[lvl];
  let counts: number[] = [];
  let asked = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    counts = Array.from({ length: colors }, () => randInt(rng, 1, PROB_COUNT_MAX[lvl]));
    asked = randInt(rng, 0, colors - 1);
    const total = counts.reduce((sum, c) => sum + c, 0);
    drawn = counts[asked] !== total - counts[asked];
  }
  if (!drawn) throw new Error(`could not draw a bag at level ${level}`);

  const total = counts.reduce((sum, c) => sum + c, 0);
  const favourable = counts[asked];
  const other = total - favourable;
  const answer = draws === 1 ? frac(favourable, total) : frac(favourable * favourable, total * total);
  const candidates = draws === 1
    ? [
      frac(other, total),                                              // the complement
      frac(favourable, other),                                         // the part over the other part
      String(favourable),                                              // the count alone, with no whole to compare it to
      frac(favourable + 1, total),
      frac(favourable, total + 1),
    ]
    : [
      frac(total * total - favourable * favourable, total * total),    // the complement
      frac(favourable * favourable, other * other),                    // the part over the other part
      frac(favourable, total),                                         // one draw's probability, the second draw forgotten
      frac(2 * favourable, total),                                     // the two draws added rather than multiplied
      frac(favourable * favourable + 1, total * total),
    ];

  const question = draws === 1
    ? `What is the probability of drawing ${MARBLE_COLORS[asked]}?`
    : `One marble is drawn and put back, then another is drawn. What is the probability that both are ${MARBLE_COLORS[asked]}?`;
  // The prompt is already every word: no symbol on it needs spelling out, so the spoken form
  // is the prompt itself rather than a second copy that could drift from it.
  const prompt = `A bag has ${bagText(counts)} marbles. ${question}`;
  return makeQuestion(skillId, `${draws}:${counts.join("-")}:${MARBLE_COLORS[asked]}`, prompt, answer, pickDistinct(candidates, answer), rng, prompt);
}

// ---------------------------------------------------------------------------
// Rational expressions
// ---------------------------------------------------------------------------

/**
 * Largest number inside a factor, per level. The difference-of-squares rungs reach further than
 * the general ones because they have less to vary: a numerator built from one number has only
 * that number to move, while `(x + p)(x + q)` has two.
 */
const RATIONAL_SPAN = [15, 15, 20, 9, 9];
/** A denominator of `(x - a)` joins at level 1; a numerator that is not a difference of squares at 3. */
const RATIONAL_BOTH_SIGNS = [false, true, true, true, true];
const RATIONAL_GENERAL = [false, false, false, true, true];
/** Negative factors — and so a numerator whose middle term can go either way — at level 4. */
const RATIONAL_NEGATIVE = [false, false, false, false, true];

/**
 * Rational expressions (grade 12). `(x² - 9)/(x + 3)` at levels 0-2, where the numerator is a
 * difference of squares and the denominator is one of its two factors; a general factorisation
 * from 3, with negative factors at 4.
 *
 * **There is no domain restriction on the prompt, and that is a decision rather than an
 * oversight.** `(x² - 9)/(x + 3)` is `x - 3` for every x but -3, and a mathematician writes the
 * restriction down. A child at this level is being asked to simplify, the four choices differ
 * by their algebra and never by their domain, and "for x ≠ -3" on every question in the panel
 * is a line of noise a reader learns to skip. If this skill ever asks which values are excluded,
 * that is a different question and wants a different prompt.
 *
 * **Two of the three wrong readings would otherwise be the answer, and both are guarded at the
 * draw.** `q ≠ 0` keeps "the constant's sign flipped" wrong, and `p ≠ q` keeps "the factor that
 * cancelled, kept instead of the one that stayed" wrong.
 *
 * **The third is the interesting one.** Dividing the numerator's terms by the denominator's one
 * at a time — `x²/x` and `pq/p` — gives `x + q`, which is the ANSWER, identically, for every
 * monic quadratic over one of its own factors. It is a real thing children do and it cannot be
 * offered as a wrong answer in this question shape at any level, so the term-cancelling reading
 * offered here is the other one: the constants cancelled where they stand and the rest of the
 * numerator left alone, `(x² + 5x + 6)/(x + 2)` read as `x² + 5x + 3`. That one is a degree too
 * high and can never be the answer.
 */
export function rationalExpr(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const span = RATIONAL_SPAN[lvl];
  // `p` is the factor that cancels and `q` the one that stays, so the answer is always `x + q`.
  // A difference of squares is the case `q = -p`, which is why it needs no branch of its own.
  let p = 0, q = 0;
  let drawn = false;
  for (let attempt = 0; attempt < 400 && !drawn; attempt++) {
    if (RATIONAL_GENERAL[lvl]) {
      const sign = () => (RATIONAL_NEGATIVE[lvl] && rng() < 0.5 ? -1 : 1);
      p = randInt(rng, 1, span) * sign();
      q = randInt(rng, 1, span) * sign();
    } else {
      p = randInt(rng, 2, span) * (RATIONAL_BOTH_SIGNS[lvl] && rng() < 0.5 ? -1 : 1);
      q = -p;
    }
    drawn = p !== 0 && q !== 0 && p !== q;
  }
  if (!drawn) throw new Error(`could not draw a rational expression at level ${level}`);

  const numerator = [1, p + q, p * q];
  const answer = polynomial([1, q]);
  const candidates = [
    polynomial([1, -q]),              // the sign of the constant flipped
    polynomial([1, p + q, q]),        // the constants cancelled where they stand, not the factor
    polynomial(numerator),            // the numerator handed back unfactored
    polynomial([1, p]),               // the factor that cancelled, kept instead of the one that stayed
    polynomial([1, q + 1]),
  ];
  const distractors = pickDistinct(candidates, answer);
  if (distractors.length !== 3) throw new Error(`could not build three wrong simplifications of ${numerator} over ${p}`);

  const denominator = polynomial([1, p]);
  return makeQuestion(
    skillId,
    `${polynomial(numerator)}/${denominator}`.replace(/ /g, ""),
    `Simplify: (${polynomial(numerator)}) / (${denominator})`,
    answer,
    distractors,
    rng,
    // "all over", never `/`: a screen reader says the slash as "slash" or as nothing at all.
    `Simplify: ${spokenPolynomial(numerator)}, all over ${spokenPolynomial([1, p])}`,
  );
}

// ---------------------------------------------------------------------------
// Exponential and logarithmic equations
// ---------------------------------------------------------------------------

/** Which bases each level may draw. Base 10 joins at level 1. */
const LOG_EQ_BASES: readonly number[][] = [[2, 3, 5], [2, 3, 5, 10], [2, 3, 5, 10], [2, 3, 5, 10], [2, 3, 5, 10]];
/** Largest exponent, per level. */
const LOG_EQ_EXP_MAX = [5, 6, 6, 6, 6];
/**
 * The three shapes above the first, each a rung: the equation written as a logarithm from
 * level 2, a unit fraction for the power from 3, and a shifted exponent from 4.
 *
 * Bases and exponents alone cannot make five rungs here — four bases and six exponents is
 * twenty-odd questions, and widening either one only counts zeros — so four of the five rungs
 * are a different shape rather than a wider range. Solving `log₂(x) = 5` is genuinely the other
 * direction from solving `2ˣ = 32`, and `2^(x - 2) = 8` is the first one where the exponent is
 * not the answer.
 */
const LOG_EQ_ASKS_LOG = [false, false, true, true, true];
const LOG_EQ_NEGATIVE = [false, false, false, true, true];
const LOG_EQ_SHIFT = [false, false, false, false, true];
/** `10^6` is an exercise in counting zeros rather than a harder question about exponents. */
const LOG_EQ_ARG_MAX = 100000;

/**
 * Exponential and logarithmic equations (grade 12). `2ˣ = 64` at levels 0-1, `log₂(x) = 5` from
 * 2, a unit fraction for the power from 3, and a shifted exponent — `2^(x - 2) = 8` — at 4.
 *
 * **The base is this skill's mandatory wrong answer**, in both directions: a child who answers
 * `2` to `2ˣ = 64` has told you which number they read. Any draw whose answer IS the base is
 * thrown away, which covers `3ˣ = 27` in the one frame and `log₂(x) = 1` in the other.
 *
 * `log(x) = 5` rather than `log₁₀(x) = 5`, matching the convention every textbook uses and the
 * grade-11 logarithm generator above. The read-aloud says the base anyway.
 */
export function logEq(level: number, rng: Rng, skillId: string): Question {
  const lvl = L(level);
  const bases = LOG_EQ_BASES[lvl];
  let base = 2, exponent = 1, power = 1, shift = 0;
  let asksLog = false;
  let answer = "";
  let drawn = false;
  for (let attempt = 0; attempt < 600 && !drawn; attempt++) {
    base = bases[randInt(rng, 0, bases.length - 1)];
    const size = randInt(rng, 1, LOG_EQ_EXP_MAX[lvl]);
    exponent = LOG_EQ_NEGATIVE[lvl] && rng() < 0.4 ? -size : size;
    power = base ** size;
    asksLog = LOG_EQ_ASKS_LOG[lvl] && rng() < 0.5;
    shift = LOG_EQ_SHIFT[lvl] && !asksLog && rng() < 0.5 ? randInt(rng, 1, 3) * (rng() < 0.5 ? -1 : 1) : 0;
    answer = asksLog
      ? (exponent < 0 ? `1/${power}` : String(power))
      : String(exponent - shift);
    drawn = power <= LOG_EQ_ARG_MAX && answer !== String(base);
  }
  if (!drawn) throw new Error(`could not draw an exponential equation at level ${level}`);

  const argument = exponent < 0 ? `1/${power}` : String(power);
  const candidates = asksLog
    ? [
      String(base),                                                   // the base read off as the answer
      exponent < 0 ? String(power) : `1/${power}`,                    // the sign of the exponent lost
      String(base * Math.abs(exponent)),                              // the base multiplied by the exponent, not raised to it
      String(power * base),
      String(power + 1),
    ]
    : [
      String(base),                                                   // the base read off as the answer
      ...(exponent < 0 ? [String(-exponent)] : whole(power, base)),    // the minus dropped; the power divided by the base once
      ...(shift === 0 ? [] : [String(exponent)]),                     // the shift left in the exponent
      ...numericDistractors(exponent - shift, rng),
    ];

  const left = asksLog
    ? `log${LOG_SUBSCRIPT[base]}(x)`
    : `${base}^${shift === 0 ? "x" : `(x ${signed(shift)})`}`;
  const right = asksLog ? String(exponent) : argument;
  const spokenLeft = asksLog
    ? `log base ${base} of x`
    : `${base} to the power ${shift === 0 ? "x" : `of the quantity x ${spokenSign(shift)},`}`;
  const spokenRight = asksLog
    ? speakInt(exponent)
    : (exponent < 0 ? `1 over ${power}` : String(power));

  return makeQuestion(
    skillId,
    // Taken off the prompt itself, so the id cannot name anything the prompt does not.
    `${left}=${right}`.replace(/ /g, ""),
    `Solve: ${left} = ${right}`,
    answer,
    pickDistinct(candidates, answer),
    rng,
    `Solve: ${spokenLeft} equals ${spokenRight}`,
  );
}
