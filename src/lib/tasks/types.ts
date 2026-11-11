/**
 * A side quest's "question" is a typed task. The kind decides how it is shown,
 * answered and graded; the run flow around it does not change per kind.
 *
 * To add a kind: widen `TaskKind`, add one key to each `…ByKind` map below
 * (and to `FeedbackCode` if it gives coded feedback), then add its definition
 * to `TASK_KINDS` in `registry.ts`. The compiler points at everything else.
 */
import type { Question } from "@/lib/utils/drill-generators";

export type TaskKind = "choice";

/** Choice is today's `Question`; stored runs have no `kind`, which reads as "choice". */
export type ChoiceTask = Question & { kind?: "choice" };

/** The server-side task, answer and all, per kind. */
export type TaskByKind = { choice: ChoiceTask };
/** What the client is shown to render a task: never the answer. */
export type ViewByKind = { choice: { choices: string[] } };
/** What the child hands back, per kind. */
export type ResponseByKind = { choice: string };

export type Task = TaskByKind[TaskKind];

export type ClientTask = {
  [K in TaskKind]: {
    kind: K;
    id: string;
    skillId: string;
    /** What the child is asked: shown and spoken by the player, whatever the kind. */
    prompt: string;
    readAloud?: string;
    view: ViewByKind[K];
  };
}[TaskKind];

/** A coded, kind-specific note on a response; later kinds widen this. */
export type FeedbackCode = "none";

export interface TaskKindDef<K extends TaskKind> {
  toView(t: TaskByKind[K]): ViewByKind[K];
  /** Validate untrusted input; null when it is not a well-formed response for this task. */
  parseResponse(raw: unknown, t: TaskByKind[K]): ResponseByKind[K] | null;
  /** The response as stored in the database. */
  encode(r: ResponseByKind[K]): string;
  decode(s: string): ResponseByKind[K] | null;
  isCorrect(t: TaskByKind[K], r: ResponseByKind[K]): boolean;
  allowsSecondChance(t: TaskByKind[K]): boolean;
  sameResponse(a: ResponseByKind[K], b: ResponseByKind[K]): boolean;
  /** The right answer in words, for review once the task is resolved. */
  answerText(t: TaskByKind[K]): string;
  feedback(t: TaskByKind[K], r: ResponseByKind[K]): FeedbackCode;
  /** Whether this kind can present the given skill. */
  presents(skillId: string): boolean;
}
