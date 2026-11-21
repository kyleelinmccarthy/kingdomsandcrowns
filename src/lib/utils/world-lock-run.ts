/**
 * Which skill a chest's or vault door's lock draws (PC-G4, RG-o). Server-side: it asks the task
 * registry which skills a lock presents. Pure otherwise.
 *
 *   logic             the skill Puzzle practice would draw (`practiceSkill`), so the grown-up's
 *                     logic focus counts here too.
 *   language/science  the first skill, walking `nearestGrades` from the hero's grade in that strand
 *                     but staying inside that grade's own band, that a lock presents (a sort pool
 *                     credits it). Found through the catalog, never by building an id. A band with
 *                     no such skill (a K-3 hero's language) gives the logic lock instead, never a
 *                     choice question.
 */
import { TASK_KINDS } from "@/lib/tasks/registry";
import { bandSkill } from "./band-skill";
import type { Grade } from "./grade-levels";
import { practiceSkill } from "./practice-run";
import type { Skill, SkillArea } from "./skills";
import type { WorldObject } from "@/lib/realm/world-objects";

/** `grade` is the grade the skill was found at, which names the run's band. */
export type WorldLockPick = { skill: Skill; grade: Grade };

function sortSkill(area: "language" | "science", grade: Grade): WorldLockPick | null {
  return bandSkill(area, grade, (s) => TASK_KINDS.lock.presents(s.id));
}

export function worldLockSkill(
  object: Pick<WorldObject, "draws">,
  grades: Record<SkillArea, Grade>,
  focusSkillIds: readonly string[],
): WorldLockPick | null {
  if (object.draws !== "logic") {
    const sort = sortSkill(object.draws, grades[object.draws]);
    if (sort) return sort;
  }
  const skill = practiceSkill(grades.logic, focusSkillIds);
  return skill ? { skill, grade: grades.logic } : null;
}
