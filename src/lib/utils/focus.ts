import { gradeIndex, type Grade } from "./grade-levels";
import { SKILLS, findSkill, type Skill, type SkillArea } from "./skills";

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
 * One skill a grown-up may pick, as plain data a server page can hand to the client panel.
 * `trailOnly`: the skill has no multiple choice and is played only as reading trails (`read-g6`,
 * `read-g9`), so with the Reading trails switch off a pick of it is never drawn; the panel says so
 * beside the box rather than hiding it (H3). `runeOnly` is the same for a skill played only as rune
 * spellcraft (`spell-g1`, R-I7): with that switch off a pick of it is never drawn.
 */
export type FocusOption = { id: string; label: string; area: SkillArea; grade: Grade; trailOnly?: true; runeOnly?: true };

/** The window as panel options. A window skill is offered at exactly one grade, so it is that one. */
export function focusOptions(window: readonly Skill[]): FocusOption[] {
  return window.map(({ id, label, area, grades, source }) => ({
    id, label, area, grade: grades[0],
    ...(source.kind === "trail" ? { trailOnly: true as const } : {}),
    ...(source.kind === "rune" ? { runeOnly: true as const } : {}),
  }));
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

/** The strands the focus skills belong to, each once: what the Realm's beacon leans toward. */
export function focusAreasOf(ids: readonly string[]): SkillArea[] {
  const areas: SkillArea[] = [];
  for (const id of ids) {
    const area = findSkill(id)?.area;
    if (area && !areas.includes(area)) areas.push(area);
  }
  return areas;
}
