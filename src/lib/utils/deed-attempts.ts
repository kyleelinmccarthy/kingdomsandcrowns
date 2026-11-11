import { isTaskCorrect, taskDefOf, type Task } from "@/lib/tasks/registry";
import type { QuestionOutcome } from "./deed-scoring";
import { ALREADY_ANSWERED, ANSWER_FIRST, NO_SECOND_TRIES, PICK_SHOWN, TRY_DIFFERENT } from "./deed-refusals";

/** `second`: null = no second try, "" = gave up, otherwise the retry as given. */
export type AttemptRecord = { first: string | null; second: string | null };

export type QuestionStatus = "unanswered" | "right-first" | "open" | "right-second" | "missed";

/** Whether the run and the task's kind both allow a retry (a two-choice question never does: one wrong pick would leave only the answer). */
export function secondChanceAllowed(t: Task, runAllows: boolean): boolean {
  return runAllows && taskDefOf(t).allowsSecondChance(t);
}

export function statusOf(t: Task, rec: AttemptRecord, runAllows: boolean): QuestionStatus {
  if (rec.first === null) return "unanswered";
  if (isTaskCorrect(t, rec.first)) return "right-first";
  if (!secondChanceAllowed(t, runAllows)) return "missed";
  if (rec.second === null) return "open";
  return isTaskCorrect(t, rec.second) ? "right-second" : "missed";
}

export function outcomeOf(status: QuestionStatus): QuestionOutcome | null {
  switch (status) {
    case "right-first":
      return "first";
    case "right-second":
      return "second";
    case "missed":
      return "miss";
    default:
      return null;
  }
}

/** Old rows have no second tries; a short or empty list reads as nulls. */
export function records(
  responses: (string | null)[],
  secondTries: (string | null)[],
): AttemptRecord[] {
  return responses.map((first, i) => ({ first, second: secondTries[i] ?? null }));
}

export function refuseRetry(t: Task, rec: AttemptRecord, runAllows: boolean, raw: unknown): string | null {
  if (rec.first === null) return ANSWER_FIRST;
  if (isTaskCorrect(t, rec.first)) return ALREADY_ANSWERED;
  if (!secondChanceAllowed(t, runAllows)) return NO_SECOND_TRIES;
  if (rec.second !== null) return ALREADY_ANSWERED;
  const def = taskDefOf(t);
  const picked = def.parseResponse(raw, t);
  // "" is how the server records a give-up, so it can never be a real retry.
  if (picked === null || def.encode(picked) === "") return PICK_SHOWN;
  const before = def.decode(rec.first);
  if (before !== null && def.sameResponse(picked, before)) return TRY_DIFFERENT;
  return null;
}

export function refuseGiveUp(t: Task, rec: AttemptRecord, runAllows: boolean): string | null {
  return statusOf(t, rec, runAllows) === "open" ? null : ALREADY_ANSWERED;
}

/** Where a resumed run reopens: the first question still waiting, else the last. */
export function resumeIndex(statuses: QuestionStatus[]): number {
  const i = statuses.findIndex((s) => s === "unanswered" || s === "open");
  return i === -1 ? Math.max(statuses.length - 1, 0) : i;
}
