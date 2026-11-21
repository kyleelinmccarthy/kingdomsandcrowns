import { taskHint } from "@/lib/utils/skill-hints";
import { choiceKind } from "./choice";
import { lockKind } from "./lock";
import { measureKind } from "./measure";
import { trailKind } from "./trail";
import type { ClientTask, Task, TaskKind, TaskKindDef } from "./types";

export type * from "./types";

/** The extension point: a new kind adds one entry here (and a key to each map in types.ts). */
export const TASK_KINDS: { [K in TaskKind]: TaskKindDef<K> } = {
  choice: choiceKind,
  measure: measureKind,
  lock: lockKind,
  trail: trailKind,
};

/** Typed accessor over `TASK_KINDS`. */
export function taskDef<K extends TaskKind>(kind: K): TaskKindDef<K> {
  return TASK_KINDS[kind];
}

/** Whether `k` names a kind this build knows (a stored run from a newer deploy may not). Own keys only. */
export function isRegisteredKind(k: unknown): k is TaskKind {
  return typeof k === "string" && Object.prototype.hasOwnProperty.call(TASK_KINDS, k);
}

/**
 * The definition for a task, whatever its kind: the one place the kind-to-definition correlation is
 * cast. `taskDef(kindOf(t))` has no single `K` once a second kind exists, so it cannot type-check;
 * the cast is sound because `TASK_KINDS[kindOf(t)]` is built for exactly the task shapes `t` can
 * hold, and method bivariance lets each `TaskKindDef<K>` stand as a `TaskKindDef<TaskKind>`. Use
 * this at every site that has a task, not a kind.
 */
export function taskDefOf(t: Task): TaskKindDef<TaskKind> {
  return TASK_KINDS[kindOf(t)] as TaskKindDef<TaskKind>;
}

/** Stored runs predate kinds, so an absent `kind` is a choice task. */
export function kindOf(t: Task): TaskKind {
  return t.kind ?? "choice";
}

/** What leaves the server: the view only, never `answer` or `explain`. */
export function toClientTask(t: Task): ClientTask {
  const kind = kindOf(t);
  // Built explicitly so nothing but the named fields can reach the client. The cast stands for the
  // kind/view correlation (see `taskDefOf`).
  return { kind, id: t.id, skillId: t.skillId, prompt: t.prompt, readAloud: t.readAloud, view: taskDefOf(t).toView(t) } as ClientTask;
}

/** Grade a response as stored in the database; a response that will not decode is wrong. */
export function isTaskCorrect(t: Task, stored: string): boolean {
  const def = taskDefOf(t);
  const r = def.decode(stored);
  return r === null ? false : def.isCorrect(t, r);
}

/**
 * The line an open second chance shows (R-H7): the kind's own line for the first pick (a trail's
 * redirect for the place searched) when it has one and the stored pick decodes; otherwise the task's
 * hint. The one source for both a fresh answer's result and a resumed run's `pending.hint`.
 */
export function secondChanceHint(t: Task, firstPick: string | null | undefined): string {
  const def = taskDefOf(t);
  const pick = def.retryLine && typeof firstPick === "string" ? def.decode(firstPick) : null;
  return pick !== null && def.retryLine ? def.retryLine(t, pick) : taskHint(t);
}

/** The mechanic a skill is played with: `mechanic` if it suits the skill and is enabled, else choice. */
export function kindForSkill(mechanic: TaskKind, skillId: string, enabled: ReadonlySet<TaskKind>): TaskKind {
  if (!TASK_KINDS[mechanic].presents(skillId)) return "choice";
  return mechanic === "choice" || enabled.has(mechanic) ? mechanic : "choice";
}
