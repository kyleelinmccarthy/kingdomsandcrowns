import { TASK_CODECS } from "./codecs";
import type { TaskKindDef } from "./types";

export const MAX_RESPONSE_CHARS = 200;

/**
 * Multiple choice. Responses are the trimmed choice text, so rows stored before
 * kinds existed keep grading exactly as `gradeAnswer` (trimmed equality) does.
 */
export const choiceKind: TaskKindDef<"choice"> = {
  toView: (t) => ({ choices: t.choices }),
  parseResponse: (raw, t) => {
    if (typeof raw !== "string" || raw.length > MAX_RESPONSE_CHARS) return null;
    const r = raw.trim();
    return t.choices.some((c) => c.trim() === r) ? r : null;
  },
  encode: TASK_CODECS.choice.encode,
  decode: TASK_CODECS.choice.decode,
  isCorrect: (t, r) => t.answer.trim() === r.trim(),
  allowsSecondChance: (t) => t.choices.length >= 3,
  sameResponse: TASK_CODECS.choice.sameResponse,
  answerText: (t) => t.answer,
  feedback: () => "none",
  presents: () => true,
};
