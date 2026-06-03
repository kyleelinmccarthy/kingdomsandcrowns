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
