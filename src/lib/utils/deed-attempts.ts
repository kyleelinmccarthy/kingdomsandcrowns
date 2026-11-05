import type { Question } from "./drill-generators";
import { gradeAnswer } from "./deed-engine";
import type { QuestionOutcome } from "./deed-scoring";
import { SIDE_QUEST_LOWER } from "./side-quest-copy";

/** `second`: null = no second try, "" = gave up, otherwise the retry as given. */
export type AttemptRecord = { first: string | null; second: string | null };

export type QuestionStatus = "unanswered" | "right-first" | "open" | "right-second" | "missed";

/** Two-choice questions (fewerChoices) never get a retry: one wrong pick would leave only the answer. */
export function secondChanceAllowed(q: Pick<Question, "choices">, runAllows: boolean): boolean {
  return runAllows && q.choices.length >= 3;
}

export function statusOf(
  q: Pick<Question, "answer" | "choices">,
  rec: AttemptRecord,
  runAllows: boolean,
): QuestionStatus {
  if (rec.first === null) return "unanswered";
  if (gradeAnswer(q, rec.first)) return "right-first";
  if (!secondChanceAllowed(q, runAllows)) return "missed";
  if (rec.second === null) return "open";
  return gradeAnswer(q, rec.second) ? "right-second" : "missed";
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

export const ALREADY_ANSWERED = "That question has already been answered.";

export function refuseRetry(
  q: Pick<Question, "answer" | "choices">,
  rec: AttemptRecord,
  runAllows: boolean,
  answer: string,
): string | null {
  if (rec.first === null) return "Answer the question first.";
  if (gradeAnswer(q, rec.first)) return ALREADY_ANSWERED;
  if (!secondChanceAllowed(q, runAllows)) return `This ${SIDE_QUEST_LOWER} has no second tries.`;
  if (rec.second !== null) return ALREADY_ANSWERED;
  // "" is how the server records a give-up, so it can never be a real retry.
  const picked = answer.trim();
  if (picked === "" || !q.choices.some((c) => c.trim() === picked)) return "Pick one of the answers shown.";
  if (picked === rec.first.trim()) return "Try a different answer this time.";
  return null;
}

export function refuseGiveUp(
  q: Pick<Question, "answer" | "choices">,
  rec: AttemptRecord,
  runAllows: boolean,
): string | null {
  return statusOf(q, rec, runAllows) === "open" ? null : ALREADY_ANSWERED;
}

/** Where a resumed run reopens: the first question still waiting, else the last. */
export function resumeIndex(statuses: QuestionStatus[]): number {
  const i = statuses.findIndex((s) => s === "unanswered" || s === "open");
  return i === -1 ? Math.max(statuses.length - 1, 0) : i;
}
