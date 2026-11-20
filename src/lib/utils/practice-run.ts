/**
 * A Puzzle practice run's tasks (R-F8): three logic locks from the hero's logic skill at their own
 * grade, started from the Side Quests page. Pure. Logic has one skill per band, reached for any grade
 * by the walk `chooseSkills` makes, so there is nothing to select: the run is that skill's locks,
 * drawn at the hero's mastery of it. A grown-up's logic focus skill is drawn instead, when the hero is
 * within its window (`focusWindow`: a grade either side). It is the deed engine's own draw (`drawForSkill`, `applyProfile`)
 * without a deed, as a build run is.
 *
 * With the grown-up's lock switch off a logic skill is played as choice, and it has no choice
 * questions (R-F7), so the run comes back empty; the action refuses before it gets here.
 *
 * `lockRun` is the draw every lock run shares (RG-j): Puzzle practice, a chest or vault door, and a
 * Tower floor.
 */
import { kindForSkill } from "@/lib/tasks/registry";
import type { TaskKind } from "@/lib/tasks/types";
import { applyProfile, chooseSkills, drawForSkill, type BuiltRun, type ProfileLike } from "./deed-engine";
import { seededRng } from "./drill-generators";
import { focusWindow } from "./focus";
import type { Grade } from "./grade-levels";
import { MASTERY_MAX } from "./mastery";
import type { Skill } from "./skills";

export const PRACTICE_RUN = { tasks: 3 } as const;

const EMPTY: BuiltRun = { skillIds: [], questions: [] };

/**
 * `count` locks of one skill at `level`, from `seed`. Locks only: a skill no lock presents, or the
 * grown-up's lock switch off (`enabledKinds`), gives an empty run, never a choice question.
 */
export function lockRun(input: {
  skill: Skill;
  level: number;
  count: number;
  seed: number;
  /** The hands-on kinds the grown-up has left on (`enabledHandsOnKinds`). */
  enabledKinds: ReadonlySet<TaskKind>;
  profile: ProfileLike;
}): BuiltRun {
  const { skill } = input;
  if (kindForSkill("lock", skill.id, input.enabledKinds) !== "lock") return EMPTY;
  const rng = seededRng(input.seed);
  const questions = drawForSkill(skill, input.level, input.count, rng, [], new Set(), new Set(), "lock");
  if (questions.length === 0) return EMPTY;
  return { skillIds: [skill.id], questions: applyProfile(questions, input.profile, rng) };
}

export function buildPracticeRun(input: {
  /** The hero's logic grade: their own grade, with no offset (`gradesFor`). */
  grade: Grade;
  masteryBySkill: Record<string, number>;
  seed: number;
  /** The hands-on kinds the grown-up has left on (`enabledHandsOnKinds`). */
  enabledKinds: ReadonlySet<TaskKind>;
  profile: ProfileLike;
  /** The grown-up's focus picks (`loadFocusSkillIds`); the first logic one in the hero's window is practised. */
  focusSkillIds?: readonly string[];
}): BuiltRun {
  const skill = practiceSkill(input.grade, input.focusSkillIds ?? []);
  if (!skill) return EMPTY;
  const level = Math.min(input.masteryBySkill[skill.id] ?? 0, MASTERY_MAX);
  return lockRun({ skill, level, count: PRACTICE_RUN.tasks, seed: input.seed, enabledKinds: input.enabledKinds, profile: input.profile });
}

/** The logic skill a practice run draws: the first logic focus pick in the hero's window, else their own grade's. */
export function practiceSkill(grade: Grade, focusSkillIds: readonly string[]): Skill | undefined {
  const window = focusWindow({ logic: grade });
  const focus = focusSkillIds.map((id) => window.find((s) => s.id === id)).find((s) => s !== undefined);
  return focus ?? chooseSkills({ area: "logic" }, grade)[0];
}
