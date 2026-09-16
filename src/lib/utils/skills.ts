import type { Grade } from "./grade-levels";
import type { SpellSchool } from "./spell-schools";

export type SkillArea = "math" | "reading" | "language" | "science";

export type SkillSource = { kind: "generator"; generatorId: string } | { kind: "pool"; poolId: string };

/**
 * `grades` is readonly because the rows below share array objects: every `k1` skill points
 * at the same `k1` array. Mutating one in place would silently move every other skill in
 * that band with it, and the band-closure test would not notice — the result is still a
 * whole band, just attached to skills nobody meant to touch. Build a new array instead.
 */
export type Skill = { id: string; label: string; area: SkillArea; grades: readonly Grade[]; source: SkillSource };

/** Same mapping the subject defaults use, so deeds and schoolwork pull one way. */
export const AREA_SCHOOL: Record<SkillArea, SpellSchool> = {
  reading: "element",
  language: "element",
  math: "form",
  science: "modifier",
};

/** What a child sees on a side quest: the subject's name and chip colour. */
export const AREA_LABELS: Record<SkillArea, { label: string; color: string }> = {
  math: { label: "Math", color: "#3b82f6" },
  reading: { label: "Reading", color: "#22c55e" },
  language: { label: "Language Arts", color: "#a855f7" },
  science: { label: "Science", color: "#f97316" },
};

const SCHOOL_ORDER: SpellSchool[] = ["form", "element", "modifier"];

/** Which subjects feed each spell school, for the "How side quests make magic" lines. */
export function schoolLines(): { school: SpellSchool; areas: SkillArea[] }[] {
  const areas = Object.keys(AREA_SCHOOL) as SkillArea[];
  return SCHOOL_ORDER.map((school) => ({ school, areas: areas.filter((a) => AREA_SCHOOL[a] === school) }));
}

const gen = (generatorId: string): SkillSource => ({ kind: "generator", generatorId });
const pool = (poolId: string): SkillSource => ({ kind: "pool", poolId });

/**
 * Reading, Language Arts and Science are still authored per band, so their rows share these
 * arrays. Math is keyed to single grades by `docs/content/math-skill-map.md` and uses none of
 * them. Plan 3 gives the other three subjects their own maps and these go with it.
 */
const k1: readonly Grade[] = ["K", "1"];
const g23: readonly Grade[] = ["2", "3"];
const g45: readonly Grade[] = ["4", "5"];
const g68: readonly Grade[] = ["6", "7", "8"];
const g912: readonly Grade[] = ["9", "10", "11", "12"];

export const SKILLS: Skill[] = [
  { id: "add-10", label: "Addition within 10", area: "math", grades: ["K"], source: gen("add") },
  { id: "sub-10", label: "Subtraction within 10", area: "math", grades: ["K"], source: gen("sub") },
  { id: "add-20", label: "Addition within 20", area: "math", grades: ["1"], source: gen("add") },
  { id: "sub-20", label: "Subtraction within 20", area: "math", grades: ["1"], source: gen("sub") },
  { id: "add-100", label: "Addition within 100", area: "math", grades: ["2"], source: gen("add") },
  { id: "mul-facts", label: "Multiplication facts", area: "math", grades: ["3"], source: gen("mul") },
  { id: "div-facts", label: "Division facts", area: "math", grades: ["3"], source: gen("div") },
  { id: "place-value", label: "Place value", area: "math", grades: ["4"], source: gen("place-value") },
  { id: "integer-ops", label: "Integer operations", area: "math", grades: ["6"], source: gen("integer-ops") },
  { id: "percent-of", label: "Percent of a number", area: "math", grades: ["6"], source: gen("percent-of") },
  { id: "one-step-eq", label: "One-step equations", area: "math", grades: ["9"], source: gen("one-step-eq") },
  /**
   * Offered at no grade: comparing fractions is covered inside `frac-equiv` (grade 4) and
   * `frac-addsub` (grade 5). The row stays and the id is never reused, so the mastery rows
   * children have already earned on it are neither deleted nor silently attached to some
   * other skill. `skillsFor` returns it for no grade, so nothing serves it.
   */
  { id: "fractions-compare", label: "Comparing fractions", area: "math", grades: [], source: gen("fractions-compare") },
  { id: "count-seq", label: "Counting and number order", area: "math", grades: ["K"], source: gen("count-seq") },
  { id: "compare-num", label: "Comparing numbers", area: "math", grades: ["K"], source: gen("compare-num") },
  { id: "ten-more-less", label: "Ten more, ten less", area: "math", grades: ["1"], source: gen("ten-more-less") },
  { id: "compare-num-100", label: "Comparing two-digit numbers", area: "math", grades: ["1"], source: gen("compare-num") },
  { id: "sub-100", label: "Subtraction within 100", area: "math", grades: ["2"], source: gen("sub") },
  { id: "skip-count", label: "Skip counting", area: "math", grades: ["2"], source: gen("skip-count") },
  { id: "time-clock", label: "Telling time", area: "math", grades: ["2"], source: gen("time-clock") },
  { id: "money-coins", label: "Counting money", area: "math", grades: ["2"], source: gen("money-coins") },
  { id: "frac-unit", label: "Unit fractions", area: "math", grades: ["3"], source: gen("frac-unit") },
  { id: "area-perimeter", label: "Area and perimeter", area: "math", grades: ["3"], source: gen("area-perimeter") },
  { id: "round-nearest", label: "Rounding", area: "math", grades: ["3"], source: gen("round-nearest") },
  { id: "mul-multi", label: "Multi-digit multiplication", area: "math", grades: ["4"], source: gen("mul-multi") },
  { id: "div-multi", label: "Division with remainders", area: "math", grades: ["4"], source: gen("div-multi") },
  { id: "frac-equiv", label: "Equivalent fractions", area: "math", grades: ["4"], source: gen("frac-equiv") },
  { id: "factors", label: "Factors and multiples", area: "math", grades: ["4"], source: gen("factors") },
  { id: "frac-addsub", label: "Adding and subtracting fractions", area: "math", grades: ["5"], source: gen("frac-addsub") },
  { id: "frac-mul", label: "Multiplying fractions", area: "math", grades: ["5"], source: gen("frac-mul") },
  { id: "dec-ops", label: "Decimal arithmetic", area: "math", grades: ["5"], source: gen("dec-ops") },
  { id: "volume-prism", label: "Volume of a rectangular prism", area: "math", grades: ["5"], source: gen("volume-prism") },
  { id: "order-ops", label: "Order of operations", area: "math", grades: ["5"], source: gen("order-ops") },
  { id: "ratio-rate", label: "Ratios and unit rates", area: "math", grades: ["6"], source: gen("ratio-rate") },
  { id: "frac-div", label: "Dividing fractions", area: "math", grades: ["6"], source: gen("frac-div") },
  { id: "eval-expr", label: "Evaluating expressions", area: "math", grades: ["6"], source: gen("eval-expr") },
  { id: "proportion", label: "Proportional relationships", area: "math", grades: ["7"], source: gen("proportion") },
  { id: "rational-ops", label: "Operations with rational numbers", area: "math", grades: ["7"], source: gen("rational-ops") },
  { id: "percent-change", label: "Percent increase and decrease", area: "math", grades: ["7"], source: gen("percent-change") },
  { id: "two-step-eq", label: "Two-step equations", area: "math", grades: ["7"], source: gen("two-step-eq") },
  { id: "circle-measure", label: "Circle area and circumference", area: "math", grades: ["7"], source: gen("circle-measure") },
  { id: "linear-eq", label: "Linear equations in one variable", area: "math", grades: ["8"], source: gen("linear-eq") },
  { id: "slope", label: "Slope from two points", area: "math", grades: ["8"], source: gen("slope") },
  { id: "exponent-rules", label: "Properties of exponents", area: "math", grades: ["8"], source: gen("exponent-rules") },
  { id: "pythagorean", label: "The Pythagorean theorem", area: "math", grades: ["8"], source: gen("pythagorean") },
  { id: "sci-notation", label: "Scientific notation", area: "math", grades: ["8"], source: gen("sci-notation") },
  { id: "multi-step-eq", label: "Multi-step equations", area: "math", grades: ["9"], source: gen("multi-step-eq") },
  { id: "systems-eq", label: "Systems of two equations", area: "math", grades: ["9"], source: gen("systems-eq") },
  { id: "factor-quad", label: "Factoring quadratics", area: "math", grades: ["9"], source: gen("factor-quad") },
  { id: "slope-intercept", label: "Slope-intercept form", area: "math", grades: ["9"], source: gen("slope-intercept") },
  { id: "inequalities", label: "Solving inequalities", area: "math", grades: ["9"], source: gen("inequalities") },
  { id: "angle-pairs", label: "Angle relationships", area: "math", grades: ["10"], source: gen("angle-pairs") },
  { id: "similar-tri", label: "Similar and congruent triangles", area: "math", grades: ["10"], source: gen("similar-tri") },
  { id: "trig-ratios", label: "Right-triangle trigonometry", area: "math", grades: ["10"], source: gen("trig-ratios") },
  { id: "solid-measure", label: "Surface area and volume of solids", area: "math", grades: ["10"], source: gen("solid-measure") },
  { id: "dist-midpoint", label: "Distance and midpoint", area: "math", grades: ["10"], source: gen("dist-midpoint") },
  { id: "quad-formula", label: "The quadratic formula", area: "math", grades: ["11"], source: gen("quad-formula") },
  { id: "poly-ops", label: "Polynomial arithmetic", area: "math", grades: ["11"], source: gen("poly-ops") },
  { id: "radical-ops", label: "Radicals and rational exponents", area: "math", grades: ["11"], source: gen("radical-ops") },
  { id: "log-rules", label: "Exponentials and logarithms", area: "math", grades: ["11"], source: gen("log-rules") },
  { id: "fn-compose", label: "Function composition and inverses", area: "math", grades: ["11"], source: gen("fn-compose") },
  { id: "unit-circle", label: "The unit circle and radians", area: "math", grades: ["12"], source: gen("unit-circle") },
  { id: "sequences", label: "Arithmetic and geometric sequences", area: "math", grades: ["12"], source: gen("sequences") },
  { id: "probability", label: "Probability of simple events", area: "math", grades: ["12"], source: gen("probability") },
  { id: "rational-expr", label: "Rational expressions", area: "math", grades: ["12"], source: gen("rational-expr") },
  { id: "log-eq", label: "Logarithmic and exponential equations", area: "math", grades: ["12"], source: gen("log-eq") },
  { id: "sight-k1", label: "Sight words", area: "reading", grades: k1, source: pool("sight-words-k1") },
  { id: "sight-g23", label: "Sight words", area: "reading", grades: g23, source: pool("sight-words-g23") },
  { id: "spell-g23", label: "Spelling", area: "language", grades: g23, source: pool("spelling-g23") },
  { id: "spell-g45", label: "Spelling", area: "language", grades: g45, source: pool("spelling-g45") },
  { id: "vocab-g45", label: "Vocabulary", area: "language", grades: g45, source: pool("vocab-g45") },
  { id: "vocab-g68", label: "Vocabulary", area: "language", grades: g68, source: pool("vocab-g68") },
  { id: "vocab-g912", label: "Vocabulary", area: "language", grades: g912, source: pool("vocab-g912") },
  { id: "science-k1", label: "Science facts", area: "science", grades: k1, source: pool("science-k1") },
  { id: "science-g23", label: "Science facts", area: "science", grades: g23, source: pool("science-g23") },
  { id: "science-g45", label: "Science facts", area: "science", grades: g45, source: pool("science-g45") },
  { id: "science-g68", label: "Science facts", area: "science", grades: g68, source: pool("science-g68") },
  { id: "science-g912", label: "Science facts", area: "science", grades: g912, source: pool("science-g912") },
];

export function skillsFor(area: SkillArea, grade: Grade): Skill[] {
  return SKILLS.filter((s) => s.area === area && s.grades.includes(grade));
}

export function findSkill(id: string): Skill | null {
  return SKILLS.find((s) => s.id === id) ?? null;
}

export function skillForPool(poolId: string): Skill | null {
  return SKILLS.find((s) => s.source.kind === "pool" && s.source.poolId === poolId) ?? null;
}
