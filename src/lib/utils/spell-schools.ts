/** The three schools of magic a discipline can feed. "none" means it feeds nothing. */
export type SpellSchool = "element" | "form" | "modifier";
export type SubjectSchool = SpellSchool | "none";

export const SUBJECT_SCHOOLS: SubjectSchool[] = ["element", "form", "modifier", "none"];

export const SCHOOL_LABELS: Record<SubjectSchool, string> = {
  element: "School of Elements",
  form: "School of Forms",
  modifier: "School of Modifiers",
  none: "No school",
};

// Checked in this order; the first school with a matching word wins, so
// "Art History" is an element discipline. Whole words only: "Smarts" is not art.
const SCHOOL_WORDS: [SpellSchool, string[]][] = [
  ["element", ["reading", "writing", "ela", "english", "history", "language", "spelling", "grammar", "literature"]],
  ["form", ["math", "mathematics", "arithmetic", "algebra", "geometry"]],
  ["modifier", ["science", "art", "music", "biology", "chemistry", "physics"]],
];

/** Best-guess school for a discipline name. Parents can override it later. */
export function defaultSchoolForSubject(name: string): SubjectSchool {
  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (const [school, list] of SCHOOL_WORDS) {
    if (words.some((w) => list.includes(w))) return school;
  }
  return "none";
}

export function isSubjectSchool(v: unknown): v is SubjectSchool {
  return typeof v === "string" && (SUBJECT_SCHOOLS as string[]).includes(v);
}

export function emptySchoolCounts(): Record<SpellSchool, number> {
  return { element: 0, form: 0, modifier: 0 };
}
