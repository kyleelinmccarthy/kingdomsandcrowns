import { gradeIndex, type Grade } from "./grade-levels";
import { SKILLS, type Skill, type SkillArea } from "./skills";

/** A grown-up may ask for at most this many focus skills per hero. */
export const FOCUS_MAX = 3;

/** How many times likelier a focus skill is to be drawn than an ordinary one. */
export const FOCUS_WEIGHT = 3;

/**
 * The skills a grown-up may pick from for a hero: each one whose grade is within one step of
 * the grade that hero is taught at in that strand (K and 1 are one step apart). An area missing
 * from `grades` offers nothing, so a half-built map never offers skills at a guessed level. A
 * skill offered at no grade (or at several) is never in the window.
 */
export function focusWindow(grades: Partial<Record<SkillArea, Grade>>): Skill[] {
  return SKILLS.filter((skill) => {
    const at = grades[skill.area];
    if (at === undefined || skill.grades.length !== 1) return false;
    return Math.abs(gradeIndex(skill.grades[0]) - gradeIndex(at)) <= 1;
  });
}

/**
 * The stored picks that still count: known, in the window, no repeats, first three. Lenient on
 * purpose, because it reads what was stored when the window may since have moved; the strict
 * check, which refuses, is the action's.
 */
export function validFocus(ids: readonly string[], window: readonly Skill[]): string[] {
  const allowed = new Set(window.map((s) => s.id));
  const kept: string[] = [];
  for (const id of ids) {
    if (allowed.has(id) && !kept.includes(id)) kept.push(id);
    if (kept.length === FOCUS_MAX) break;
  }
  return kept;
}
