import { choiceKind } from "./choice";
import type { ClientTask, Task, TaskKind, TaskKindDef } from "./types";

export type * from "./types";

/** The extension point: a new kind adds one entry here (and a key to each map in types.ts). */
export const TASK_KINDS: { [K in TaskKind]: TaskKindDef<K> } = {
  choice: choiceKind,
};

/** Typed accessor over `TASK_KINDS`. */
export function taskDef<K extends TaskKind>(kind: K): TaskKindDef<K> {
  return TASK_KINDS[kind];
}

/** Stored runs predate kinds, so an absent `kind` is a choice task. */
export function kindOf(t: Task): TaskKind {
  return t.kind ?? "choice";
}

/** What leaves the server: the view only, never `answer` or `explain`. */
export function toClientTask(t: Task): ClientTask {
  const kind = kindOf(t);
  // Built explicitly so nothing but the named fields can reach the client.
  return { kind, id: t.id, skillId: t.skillId, readAloud: t.readAloud, view: taskDef(kind).toView(t) };
}

/** Grade a response as stored in the database; a response that will not decode is wrong. */
export function isTaskCorrect(t: Task, stored: string): boolean {
  const def = taskDef(kindOf(t));
  const r = def.decode(stored);
  return r === null ? false : def.isCorrect(t, r);
}

/** The mechanic a skill is played with: `mechanic` if it suits the skill and is enabled, else choice. */
export function kindForSkill(mechanic: TaskKind, skillId: string, enabled: ReadonlySet<TaskKind>): TaskKind {
  if (!TASK_KINDS[mechanic].presents(skillId)) return "choice";
  return mechanic === "choice" || enabled.has(mechanic) ? mechanic : "choice";
}
