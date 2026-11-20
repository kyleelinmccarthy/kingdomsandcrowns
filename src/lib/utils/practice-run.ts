/**
 * A Puzzle practice run's tasks (R-F8): three logic locks from the hero's logic skill at their own
 * grade, started from the Side Quests page. Pure. Logic has one skill per band, reached for any grade
 * by the walk `chooseSkills` makes, so there is nothing to select: the run is that skill's locks,
 * drawn at the hero's mastery of it. It is the deed engine's own draw (`drawForSkill`, `applyProfile`)
 * without a deed, as a build run is.
 *
 * With the grown-up's lock switch off a logic skill is played as choice, and it has no choice
 * questions (R-F7), so the run comes back empty; the action refuses before it gets here.
 */
import { kindForSkill } from "@/lib/tasks/registry";
import type { TaskKind } from "@/lib/tasks/types";
import { applyProfile, chooseSkills, drawForSkill, type BuiltRun, type ProfileLike } from "./deed-engine";
import { seededRng } from "./drill-generators";
import type { Grade } from "./grade-levels";
import { MASTERY_MAX } from "./mastery";

export const PRACTICE_RUN = { tasks: 3 } as const;

export function buildPracticeRun(input: {
  /** The hero's logic grade: their own grade, with no offset (`gradesFor`). */
  grade: Grade;
  masteryBySkill: Record<string, number>;
  seed: number;
  /** The hands-on kinds the grown-up has left on (`enabledHandsOnKinds`). */
  enabledKinds: ReadonlySet<TaskKind>;
  profile: ProfileLike;
}): BuiltRun {
  const rng = seededRng(input.seed);
  const [skill] = chooseSkills({ area: "logic" }, input.grade);
  if (!skill) return { skillIds: [], questions: [] };
  const level = Math.min(input.masteryBySkill[skill.id] ?? 0, MASTERY_MAX);
  const kind = kindForSkill("lock", skill.id, input.enabledKinds);
  const questions = drawForSkill(skill, level, PRACTICE_RUN.tasks, rng, [], new Set(), new Set(), kind);
  if (questions.length === 0) return { skillIds: [], questions: [] };
  return { skillIds: [skill.id], questions: applyProfile(questions, input.profile, rng) };
}
