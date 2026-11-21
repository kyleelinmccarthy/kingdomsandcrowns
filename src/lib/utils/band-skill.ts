/**
 * The skill, in one strand, that a hero's band offers and a rule accepts. Pure.
 *
 * Walks `nearestGrades` from the hero's grade (the grade itself, then each easier grade
 * nearest-first, then the harder ones), skips every grade outside the hero's own band
 * (`bandForGrade`), and gives the first skill at a grade in that band that `accept` takes. A band
 * that has none gives `null`, so the caller decides what a hero without one is handed.
 *
 * Found through the catalog, never by building an id. It is the one walk behind a lock's sort skill
 * (`world-lock-run.ts`, RG-o) and the trail run's band skill (R-H9, R-H21).
 */
import { bandForGrade, nearestGrades, type Grade } from "./grade-levels";
import { skillsFor, type Skill, type SkillArea } from "./skills";

/** `grade` is the grade the skill was found at, which names the run's band. */
export type BandSkillPick = { skill: Skill; grade: Grade };

export function bandSkill(area: SkillArea, grade: Grade, accept: (s: Skill) => boolean): BandSkillPick | null {
  const band = bandForGrade(grade);
  for (const g of nearestGrades(grade)) {
    if (bandForGrade(g) !== band) continue;
    const skill = skillsFor(area, g).find(accept);
    if (skill) return { skill, grade: g };
  }
  return null;
}
