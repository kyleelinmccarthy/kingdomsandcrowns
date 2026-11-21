/**
 * The trail (slice 5, R-H5): a reading clue answered by searching one of the village's anchors.
 * Server-only, like the registry: a trail task holds its answer and redirects, and the pools that
 * `presents` reads (H4) hold every answer.
 *
 * The leak rule: the view is empty. The clue is the task's `prompt` (and `readAloud`), which
 * `toClientTask` sends; the answer, the redirects and the trail it came from never leave the server,
 * and the response is checked here, never in the browser. Any anchor is a well-formed response
 * (R-H6), so a pick tells the browser nothing about which one is right. The second-chance line is the
 * redirect for the place searched (`retryLine`); the answer's place is sent as `reveal` only once the
 * clue is resolved and missed (R-H1).
 */
import { anchorLabel, isAnchorId } from "@/lib/realm/anchors";
import { TASK_CODECS, TRAIL_MAX_CHARS } from "./codecs";
import { TRAIL_UNKNOWN_ANSWER, trailAnswerText } from "./trail-copy";
import type { TaskKindDef } from "./types";

export const trailKind: TaskKindDef<"trail"> = {
  // Built from nothing, so no field of the task can ride along.
  toView: () => ({}),
  // Strict: a string of at most TRAIL_MAX_CHARS that is one of the anchors' own ids. Never trimmed or coerced.
  parseResponse: (raw) => (typeof raw === "string" && raw.length <= TRAIL_MAX_CHARS && isAnchorId(raw) ? raw : null),
  encode: TASK_CODECS.trail.encode,
  decode: TASK_CODECS.trail.decode,
  isCorrect: (t, r) => r === t.answer,
  // A wrong place works like the other puzzles (owner, R-H1).
  allowsSecondChance: () => true,
  sameResponse: TASK_CODECS.trail.sameResponse,
  // A stored clue whose answer left the catalog still has words, and never throws (Review Focus 4).
  answerText: (t) => (isAnchorId(t.answer) ? trailAnswerText(anchorLabel(t.answer)) : TRAIL_UNKNOWN_ANSWER),
  feedback: (t, r) => (r === t.answer ? "none" : "wrong_place"),
  // No pool presents a skill until H4 brings them (`trailPoolFor`), so no run changes yet.
  presents: () => false,
  reveal: (t) => t.answer,
  retryLine: (t, r) => t.redirects?.[r] ?? t.redirect,
};
