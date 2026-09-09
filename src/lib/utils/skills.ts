import type { ContentBand } from "./content-bands";
import type { SpellSchool } from "./spell-schools";

export type SkillArea = "math" | "reading" | "language" | "science";

export type SkillSource = { kind: "generator"; generatorId: string } | { kind: "pool"; poolId: string };

export type Skill = { id: string; label: string; area: SkillArea; band: ContentBand; source: SkillSource };

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
  language: { label: "Language", color: "#a855f7" },
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

export const SKILLS: Skill[] = [
  { id: "add-10", label: "Addition within 10", area: "math", band: "k1", source: gen("add") },
  { id: "sub-10", label: "Subtraction within 10", area: "math", band: "k1", source: gen("sub") },
  { id: "add-20", label: "Addition within 20", area: "math", band: "g23", source: gen("add") },
  { id: "sub-20", label: "Subtraction within 20", area: "math", band: "g23", source: gen("sub") },
  { id: "add-100", label: "Addition within 100", area: "math", band: "g23", source: gen("add") },
  { id: "mul-facts", label: "Multiplication facts", area: "math", band: "g45", source: gen("mul") },
  { id: "div-facts", label: "Division facts", area: "math", band: "g45", source: gen("div") },
  { id: "place-value", label: "Place value", area: "math", band: "g45", source: gen("place-value") },
  { id: "fractions-compare", label: "Comparing fractions", area: "math", band: "g68", source: gen("fractions-compare") },
  { id: "integer-ops", label: "Integer operations", area: "math", band: "g68", source: gen("integer-ops") },
  { id: "percent-of", label: "Percent of a number", area: "math", band: "g912", source: gen("percent-of") },
  { id: "one-step-eq", label: "One-step equations", area: "math", band: "g912", source: gen("one-step-eq") },
  { id: "sight-k1", label: "Sight words", area: "reading", band: "k1", source: pool("sight-words-k1") },
  { id: "sight-g23", label: "Sight words", area: "reading", band: "g23", source: pool("sight-words-g23") },
  { id: "spell-g23", label: "Spelling", area: "language", band: "g23", source: pool("spelling-g23") },
  { id: "spell-g45", label: "Spelling", area: "language", band: "g45", source: pool("spelling-g45") },
  { id: "vocab-g45", label: "Vocabulary", area: "language", band: "g45", source: pool("vocab-g45") },
  { id: "vocab-g68", label: "Vocabulary", area: "language", band: "g68", source: pool("vocab-g68") },
  { id: "vocab-g912", label: "Vocabulary", area: "language", band: "g912", source: pool("vocab-g912") },
  { id: "science-k1", label: "Science facts", area: "science", band: "k1", source: pool("science-k1") },
  { id: "science-g23", label: "Science facts", area: "science", band: "g23", source: pool("science-g23") },
  { id: "science-g45", label: "Science facts", area: "science", band: "g45", source: pool("science-g45") },
  { id: "science-g68", label: "Science facts", area: "science", band: "g68", source: pool("science-g68") },
  { id: "science-g912", label: "Science facts", area: "science", band: "g912", source: pool("science-g912") },
];

export function skillsFor(area: SkillArea, band: ContentBand): Skill[] {
  return SKILLS.filter((s) => s.area === area && s.band === band);
}

export function findSkill(id: string): Skill | null {
  return SKILLS.find((s) => s.id === id) ?? null;
}

export function skillForPool(poolId: string): Skill | null {
  return SKILLS.find((s) => s.source.kind === "pool" && s.source.poolId === poolId) ?? null;
}
