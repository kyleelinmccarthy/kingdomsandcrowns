/**
 * A rune run's skill and words (slice 6, R-I1). Server-only: it draws from the rune pools, which hold
 * every word. Pure otherwise: the seed and the words met lately come in, so one seed is one run.
 *
 * A rune object is fixed any time by a `world` run of ONE word (`runeObjectRun`), drawn for the
 * object's effect at the hero's language skill (`runeSkill`); `startRuneObjectRun`
 * (`actions/rune-objects.ts`) puts them on the shared start skeleton, `startLockRun`. I11 adds the
 * binding of a language side quest's words to village objects here.
 */
import { kindForSkill, TASK_KINDS } from "@/lib/tasks/registry";
import { drawRuneFor } from "@/lib/tasks/runes/draw";
import type { TaskKind } from "@/lib/tasks/types";
import type { RuneObject } from "@/lib/realm/rune-objects";
import { chooseSkills, type BuiltRun, type ProfileLike } from "./deed-engine";
import { seededRng } from "./drill-generators";
import { focusWindow } from "./focus";
import type { Grade } from "./grade-levels";
import type { Skill } from "./skills";

const EMPTY: BuiltRun = { skillIds: [], questions: [] };

const presentsRune = (s: Skill): boolean => TASK_KINDS.rune.presents(s.id);

/**
 * The language skill a rune is drawn at: the grown-up's first focus pick in the hero's window
 * (`focusWindow`, a grade either side) that a rune pool presents, else the nearest grade's own that
 * one does (so grade 1 is `spell-g1`, never `lang-g1`, R-I7). Null only if no pool presents any.
 */
export function runeSkill(grade: Grade, focusSkillIds: readonly string[]): Skill | null {
  const window = focusWindow({ language: grade });
  const focus = focusSkillIds.map((id) => window.find((s) => s.id === id)).find((s): s is Skill => s !== undefined && presentsRune(s));
  return focus ?? chooseSkills({ area: "language" }, grade, presentsRune)[0] ?? null;
}

/**
 * One rune of the object's effect, at `level`, bound to the object (its id and its broken label: it
 * is part of the question, never the answer, R-I2). Entries in `avoid` (`<poolId>/<entryId>`, met
 * lately) are taken last. Empty with the grown-up's runes off (`enabledKinds`), or for a skill no
 * rune pool presents: never a choice question.
 */
export function runeObjectRun(input: {
  skill: Skill;
  level: number;
  object: RuneObject;
  seed: number;
  /** The hands-on kinds the grown-up has left on (`enabledHandsOnKinds`). */
  enabledKinds: ReadonlySet<TaskKind>;
  profile: ProfileLike;
  avoid: ReadonlySet<string>;
}): BuiltRun {
  const { skill, object } = input;
  if (kindForSkill("rune", skill.id, input.enabledKinds) !== "rune") return EMPTY;
  const task = drawRuneFor(skill, input.level, object.effect, seededRng(input.seed), input.avoid);
  if (!task) return EMPTY;
  return { skillIds: [skill.id], questions: [{ ...task, object: { id: object.id, label: object.label } }] };
}
