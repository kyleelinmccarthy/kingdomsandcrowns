import type { AgeMode } from "./age-mode";
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

/**
 * The grade an age mode stands for, for a hero who has neither a grade nor a birth
 * year. Each is the grade `bandForGrade` maps back onto the band `bandForHero` gave
 * that mode, so such a hero keeps exactly the content they already had rather than
 * being silently demoted.
 */
const AGE_MODE_GRADE: Record<AgeMode, Grade> = { elementary: "3", middle: "6", high: "9" };

/**
 * The hero's own grade, before any subject gap: what a grown-up set, else their age,
 * else the grade their age mode stands for. `child.grade` is a plain nullable text
 * column, so a value off the ladder is not trusted — it falls through like no grade.
 * Exported because it decides which year of work a child is handed.
 *
 * It lives here, in a plain util with no database import, rather than beside the engine
 * that uses it: the Settings panel has to anchor its grade gaps on exactly this grade,
 * and a client component cannot import the engine's module. Two implementations of this
 * rule is the bug — a gap picked against one anchor and applied to the other.
 */
export function ownGradeOf(
  grade: string | null,
  birthYear: number | null,
  ageMode: AgeMode,
  today: Date = new Date(),
): Grade {
  if (grade !== null && (GRADES as readonly string[]).includes(grade)) return grade as Grade;
  const modeGrade = AGE_MODE_GRADE[ageMode];
  // `ageMode` is stored once at sign-up and never recomputed as a child ages, so an
  // age estimate can disagree with it. The estimate is used only where it refines the
  // band the hero is already in; outside it, the mode wins. Otherwise a deploy alone
  // could hand a nine-year-old grades 4-5 work, and this app's rule is that only a
  // grown-up setting a real grade moves a child up.
  const estimated = estimateGrade(birthYear, today);
  if (estimated !== null && bandForGrade(estimated) === bandForGrade(modeGrade)) return estimated;
  return modeGrade;
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
