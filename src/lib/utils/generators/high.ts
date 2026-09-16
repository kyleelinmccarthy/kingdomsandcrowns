/**
 * Grade 9-12 math: Algebra I, Geometry and Algebra II.
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
