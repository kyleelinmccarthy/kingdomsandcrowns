/**
 * Drawing, per kind. Server-only, like the registry: a drawer holds generators with the answers in.
 *
 * Choice is not here. Every skill still has a choice generator or a pool, and `drawForSkill` keeps
 * that path (with its prompt-aware dedupe and identity-case dodge) as it was. A kind that plays a
 * skill some other way registers a drawer for it: one task per call, or `null` when it has none to
 * give at this rung.
 */
import type { Rng } from "@/lib/utils/drill-generators";
import type { Skill } from "@/lib/utils/skills";
import { benchFor } from "./bench";
import { lockFor } from "./locks";
import { drawTrailClues } from "./trails/draw";
import type { Task, TaskKind } from "./types";

export type TaskDrawer = (skill: Skill, level: number, rng: Rng) => Task | null;

/** The drawer for each kind that is not a choice. */
export const TASK_DRAWERS: { [K in Exclude<TaskKind, "choice">]: TaskDrawer } = {
  // The bench's generator for the skill; none (a skill the bench does not hold) draws nothing.
  measure: (skill, level, rng) => benchFor(skill.id)?.(level, rng, skill.id) ?? null,
  // The skill's lock: a logic generator, or a draw from the sort pool that credits it (`lockFor`); none draws nothing.
  lock: (skill, level, rng) => lockFor(skill.id)?.(level, rng, skill.id) ?? null,
  // One clue of the skill's trail pool (none when no pool credits it). A run draws its clues whole, in order, through `TASK_RUN_DRAWERS`.
  trail: (skill, level, rng) => drawTrailClues(skill, level, 1, rng, new Set(), new Set())[0] ?? null,
  // No rune pool exists yet (I4 draws from them), so a rune draws nothing.
  rune: () => null,
};

/**
 * A kind that draws a run's tasks together, in order (a trail's clues, R-H9), rather than one per
 * call: `count` tasks for the skill, none of the ids in `exclude`, and the keys in `avoid` (trails met
 * lately, R-H11) only once nothing else is left.
 */
export type RunDrawer = (skill: Skill, level: number, count: number, rng: Rng, exclude: ReadonlySet<string>, avoid: ReadonlySet<string>) => Task[];

/** The run drawer for each kind that has one: a trail's clues are drawn whole, in order (R-H9). */
export const TASK_RUN_DRAWERS: Partial<Record<Exclude<TaskKind, "choice">, RunDrawer>> = { trail: drawTrailClues };

/** The run drawer a kind draws with, if it has one. Own keys only. */
export function runDrawerFor(kind: string): RunDrawer | undefined {
  return Object.prototype.hasOwnProperty.call(TASK_RUN_DRAWERS, kind) ? (TASK_RUN_DRAWERS as Record<string, RunDrawer>)[kind] : undefined;
}

// Tests only: stand-ins keyed by a kind string, so the draw path can be exercised with a kind that
// has no real drawer. Empty in production.
const overrides = new Map<string, TaskDrawer>();

/** Tests only. Registers (or, with `null`, removes) a drawer for `kind`; always reset it afterwards. */
export function __setDrawerForTest(kind: string, drawer: TaskDrawer | null): void {
  if (drawer) overrides.set(kind, drawer);
  else overrides.delete(kind);
}

/** The drawer a non-choice kind draws with, if it has one. */
export function drawerFor(kind: string): TaskDrawer | undefined {
  return overrides.get(kind) ?? (Object.prototype.hasOwnProperty.call(TASK_DRAWERS, kind) ? (TASK_DRAWERS as Record<string, TaskDrawer>)[kind] : undefined);
}
