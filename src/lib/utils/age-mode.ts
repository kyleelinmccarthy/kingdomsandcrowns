export type AgeMode = "elementary" | "middle" | "high";

export function deriveAgeMode(birthYear: number): AgeMode {
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;

  if (age <= 10) return "elementary";
  if (age <= 14) return "middle";
  return "high";
}

/** Grade options a parent can pick instead of a birth year. */
export const GRADE_OPTIONS = [
  "K",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
] as const;

export type Grade = (typeof GRADE_OPTIONS)[number];

export function isValidGrade(grade: string): grade is Grade {
  return (GRADE_OPTIONS as readonly string[]).includes(grade);
}

/** Map a US grade level to an age band (K–5 elementary, 6–8 middle, 9–12 high). */
export function ageModeFromGrade(grade: string): AgeMode {
  if (grade === "K") return "elementary";
  const n = parseInt(grade, 10);
  if (!Number.isFinite(n)) return "elementary";
  if (n <= 5) return "elementary";
  if (n <= 8) return "middle";
  return "high";
}

/** Kindergarten sorts before "1"; everything else is its number. */
export function gradeIndex(grade: string): number {
  if (grade === "K") return 0;
  const n = parseInt(grade, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Negative when a is the lower grade, zero when equal, positive when higher. */
export function compareGrades(a: string, b: string): number {
  return gradeIndex(a) - gradeIndex(b);
}

/**
 * Resolve age inputs into the stored fields. The parent provides EITHER a birth
 * year or a grade; ageMode is derived from whichever is present.
 */
export function resolveAge(
  birthYear?: number,
  grade?: string
): { birthYear: number | null; grade: string | null; ageMode: AgeMode } {
  if (grade) {
    if (!isValidGrade(grade)) throw new Error("Please choose a valid grade.");
    return { birthYear: null, grade, ageMode: ageModeFromGrade(grade) };
  }
  if (birthYear) {
    return { birthYear, grade: null, ageMode: deriveAgeMode(birthYear) };
  }
  throw new Error("Add a birth year or a grade for this hero.");
}
