import type { ContentBand } from "./content-bands";

/** K-12 as a ladder. K is index 0, so an offset is plain integer arithmetic. */
export const GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;
export type Grade = (typeof GRADES)[number];

export type SubjectOffsets = { math: number; reading: number; language: number; science: number };
export const NO_OFFSETS: SubjectOffsets = { math: 0, reading: 0, language: 0, science: 0 };

export function gradeIndex(g: Grade): number {
  return GRADES.indexOf(g);
}

export function gradeAt(i: number): Grade {
  return GRADES[Math.max(0, Math.min(GRADES.length - 1, i))];
}

/**
 * The grade a strand is actually taught at. The OFFSET is what is stored, so a promotion
 * changes the child's grade and nothing else: "+1 math" follows them up the ladder by
 * itself. Only this derived grade clamps — the stored offset is left alone, so a child
 * clamped at K climbs back into range when they are promoted.
 */
export function effectiveGrade(childGrade: Grade, offset: number): Grade {
  return gradeAt(gradeIndex(childGrade) + Math.trunc(offset));
}

/** A child with only a birth year: roughly age minus five, on the ladder. Shown as estimated. */
export function estimateGrade(birthYear: number | null, today: Date): Grade | null {
  if (birthYear === null || !Number.isFinite(birthYear)) return null;
  return gradeAt(today.getFullYear() - birthYear - 5);
}

/** The grade, then each easier one nearest-first, then each harder one. Never handed harder work first. */
export function nearestGrades(g: Grade): Grade[] {
  const i = gradeIndex(g);
  const below = GRADES.slice(0, i).slice().reverse();
  const above = GRADES.slice(i + 1);
  return [g, ...below, ...above];
}

/**
 * Today's content is authored per band, so a grade has to reach the band that covers it.
 * This is the one bridge between the new grade axis and the old content, and it exists
 * only until the content plans key items by grade.
 */
export function bandForGrade(g: Grade): ContentBand {
  const i = gradeIndex(g);
  if (i <= 1) return "k1";
  if (i <= 3) return "g23";
  if (i <= 5) return "g45";
  if (i <= 8) return "g68";
  return "g912";
}

/** Parent-facing. Never rendered anywhere a child can read it. */
export function gapLabel(childGrade: Grade, offset: number): string {
  const grade = effectiveGrade(childGrade, offset);
  const actual = gradeIndex(grade) - gradeIndex(childGrade);
  if (actual !== Math.trunc(offset)) {
    return `Grade ${grade} · the ${gradeIndex(grade) === 0 ? "lowest" : "highest"} level`;
  }
  if (actual === 0) return `Grade ${grade} · at grade level`;
  return `Grade ${grade} · ${Math.abs(actual)} ${actual > 0 ? "ahead" : "behind"}`;
}
