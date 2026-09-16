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

/** The grades each old band covered. Kept as data so the expansion below is checkable by eye. */
export const BAND_GRADES = {
  k1: ["K", "1"],
  g23: ["2", "3"],
  g45: ["4", "5"],
  g68: ["6", "7", "8"],
  g912: ["9", "10", "11", "12"],
} as const satisfies Record<string, readonly Grade[]>;

const k1 = [...BAND_GRADES.k1];
const g23 = [...BAND_GRADES.g23];
const g45 = [...BAND_GRADES.g45];
const g68 = [...BAND_GRADES.g68];
const g912 = [...BAND_GRADES.g912];

export const SKILLS: Skill[] = [
  { id: "add-10", label: "Addition within 10", area: "math", grades: k1, source: gen("add") },
  { id: "sub-10", label: "Subtraction within 10", area: "math", grades: k1, source: gen("sub") },
  { id: "add-20", label: "Addition within 20", area: "math", grades: g23, source: gen("add") },
  { id: "sub-20", label: "Subtraction within 20", area: "math", grades: g23, source: gen("sub") },
  { id: "add-100", label: "Addition within 100", area: "math", grades: g23, source: gen("add") },
  { id: "mul-facts", label: "Multiplication facts", area: "math", grades: g45, source: gen("mul") },
  { id: "div-facts", label: "Division facts", area: "math", grades: g45, source: gen("div") },
  { id: "place-value", label: "Place value", area: "math", grades: g45, source: gen("place-value") },
  { id: "fractions-compare", label: "Comparing fractions", area: "math", grades: g68, source: gen("fractions-compare") },
  { id: "integer-ops", label: "Integer operations", area: "math", grades: g68, source: gen("integer-ops") },
  { id: "percent-of", label: "Percent of a number", area: "math", grades: g912, source: gen("percent-of") },
  { id: "one-step-eq", label: "One-step equations", area: "math", grades: g912, source: gen("one-step-eq") },
  // Grades K and 1, keyed to the grade the skill map gives them rather than to a band.
  // The eleven rows above keep their band grades until Task 13 re-points them all at once.
  { id: "count-seq", label: "Counting and number order", area: "math", grades: ["K"], source: gen("count-seq") },
  { id: "compare-num", label: "Comparing numbers", area: "math", grades: ["K"], source: gen("compare-num") },
  { id: "ten-more-less", label: "Ten more, ten less", area: "math", grades: ["1"], source: gen("ten-more-less") },
  { id: "compare-num-100", label: "Comparing two-digit numbers", area: "math", grades: ["1"], source: gen("compare-num") },
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
