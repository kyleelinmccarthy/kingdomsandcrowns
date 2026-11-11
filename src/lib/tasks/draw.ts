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
import type { Task, TaskKind } from "./types";

export type TaskDrawer = (skill: Skill, level: number, rng: Rng) => Task | null;

/** The drawer for each kind that is not a choice. Empty until a second kind exists. */
export const TASK_DRAWERS: { [K in Exclude<TaskKind, "choice">]: TaskDrawer } = {};

// Tests only: stand-ins keyed by a kind string, so the draw path can be exercised before a second
// kind is registered. Empty in production.
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
