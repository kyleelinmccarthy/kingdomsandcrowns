/**
 * A side quest's "question" is a typed task. The kind decides how it is shown,
 * answered and graded; the run flow around it does not change per kind.
 *
 * To add a kind: widen `TaskKind`, add one key to each `…ByKind` map below
 * (and to `FeedbackCode` if it gives coded feedback), then add its definition
 * to `TASK_KINDS` in `registry.ts`. The compiler points at everything else.
 */
import type { Question } from "@/lib/utils/drill-generators";

export type TaskKind = "choice" | "measure";

/** Choice is today's `Question`; stored runs have no `kind`, which reads as "choice". */
export type ChoiceTask = Question & { kind?: "choice" };

/** What a cut's number measures, so the bench names it ("Area in square feet", "How many stones?"). */
export type Quantity = "length" | "area" | "volume" | "count" | "weight";

/** A length as stored: a decimal or "a/b" string (a `Rational` is bigint and will not serialise). */
export type MeasurePiece = { label: string; value: string };

/**
 * A bench task: assemble pieces to a mark, or cut a board to a length. The solution (`answer`,
 * `solution`) and the notation `bridge` stay on the server; the bridge is sent only once the task
 * is solved right.
 */
export type MeasureTask = {
  kind: "measure"; id: string; skillId: string; prompt: string; readAloud?: string;
  mode: "assemble" | "cut"; unit: string;                       // "" when unitless
  pieces?: MeasurePiece[]; target?: MeasurePiece;               // assemble: offered pieces and the mark
  answer?: string; tolerance?: string;                          // cut: solution value; tolerance default "0"
  step?: string; maxLength?: string;                            // cut: the stepper's increment and the ruler's length (view-safe)
  quantity?: Quantity;                                          // cut: what the number measures (view-safe); absent reads as a length
  solution?: number[];                                          // assemble: one valid subset, for answerText/bridge only
  bridge: string;                                               // e.g. "1/2 + 1/4 = 3/4"
  explain?: string;
};

/** What the bench is shown: labels and the cut's tools, never a value, the answer or the bridge. */
export type MeasureView = {
  mode: MeasureTask["mode"]; unit: string; pieces?: string[]; target?: string; step?: string; maxLength?: string;
  quantity?: Quantity;
};

/** Assemble: the chosen piece indices (unique, sorted). Cut: the length as typed. */
export type MeasureResponse = number[] | string;

/** The server-side task, answer and all, per kind. */
export type TaskByKind = { choice: ChoiceTask; measure: MeasureTask };
/** What the client is shown to render a task: never the answer. */
export type ViewByKind = { choice: { choices: string[] }; measure: MeasureView };
/** What the child hands back, per kind. */
export type ResponseByKind = { choice: string; measure: MeasureResponse };

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

/** A coded, kind-specific note on a response: measure says which way a wrong length is off. */
export type FeedbackCode = "none" | "too_long" | "too_short";

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
  /** The worked notation behind a task, sent only once it is solved right, built from the response that solved it. A kind without one leaves it out. */
  bridge?(t: TaskByKind[K], r: ResponseByKind[K]): string;
}
