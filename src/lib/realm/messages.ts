/**
 * The Realm's two message lanes.
 *
 * The brief asked for one message at a time under
 * `errors > one-minute banner > ceremony narration > toast > notice`. Taken
 * literally that chain is a bug: `lastMinute` stays true for the whole final
 * minute of a metered visit, so it would swallow every toast and every notice
 * for that minute — and the last minute is exactly when `The Village Well
 * stands.` matters most. So the order is kept and split at its natural seam.
 * Persistent PROBLEMS get the top-centre band; things the game SAYS get the
 * bottom-centre lane above the ability bar. One message in each, never a
 * stack, and the loser of a lane is never destroyed — it stays in its own
 * state and appears the moment the winner clears.
 *
 * A later slice adding a message kind adds it to the union, to the ORDER
 * array and to the tables below. It does not add a lane.
 */

export type ProblemKind = "spriteError" | "kingdomError" | "ceremonyError" | "lastMinute" | "preview";
export type SpeechKind = "ceremony" | "toast" | "notice";

export type RealmProblem = { kind: ProblemKind; text: string; actionLabel: string | null };
export type RealmSpeech = { kind: SpeechKind; text: string; tone: "stage" | "cheer" | "plain" };

export type MessageInput = {
  spriteError: string; // "" when none
  kingdomError: string; // "" when none
  ceremonyError: string; // "" when none
  lastMinute: boolean;
  preview: string | null; // the parent's intro, with the gate note already appended
  ceremonyNotice: string | null;
  toast: string | null;
  notice: string | null;
  calm: boolean; // reducedMotion || lowStimulus: a cheer becomes plain
};

/**
 * The only copy this module owns. Every other string arrives on the input;
 * the last minute arrives as a flag, so the sentence lives here. It is the
 * one the `.realm-hud-banner` paragraph carried before task 9 deletes it.
 */
export const LAST_MINUTE_TEXT = "One minute left in the Realm today.";

export const PROBLEM_ORDER: ProblemKind[] = ["spriteError", "kingdomError", "ceremonyError", "lastMinute", "preview"];

/** Where each problem's text comes from; `null` means that kind is not live. */
const PROBLEM_TEXT: Record<ProblemKind, (input: MessageInput) => string | null> = {
  spriteError: (i) => i.spriteError || null,
  kingdomError: (i) => i.kingdomError || null,
  ceremonyError: (i) => i.ceremonyError || null,
  lastMinute: (i) => (i.lastMinute ? LAST_MINUTE_TEXT : null),
  preview: (i) => i.preview || null,
};

/** The verbatim label on the lane's one button; `null` means the pill has none. */
const PROBLEM_ACTION: Record<ProblemKind, string | null> = {
  spriteError: "Try again",
  kingdomError: "Wake the villagers",
  ceremonyError: "Try again",
  lastMinute: null,
  preview: null,
};

/** The top-centre band: at most one persistent problem, highest priority first. */
export function pickProblem(input: MessageInput): RealmProblem | null {
  for (const kind of PROBLEM_ORDER) {
    const text = PROBLEM_TEXT[kind](input);
    if (text) return { kind, text, actionLabel: PROBLEM_ACTION[kind] };
  }
  return null;
}

export const SPEECH_ORDER: SpeechKind[] = ["ceremony", "toast", "notice"];

/** Where each spoken line comes from; `null` means that kind is not live. */
const SPEECH_TEXT: Record<SpeechKind, (input: MessageInput) => string | null> = {
  ceremony: (i) => i.ceremonyNotice || null,
  toast: (i) => i.toast || null,
  notice: (i) => i.notice || null,
};

/**
 * The lane's voice. A toast cheers, unless the hero asked for less — which
 * preserves the existing `.realm-hud-toast--plain` behaviour exactly.
 */
const SPEECH_TONE: Record<SpeechKind, (input: MessageInput) => RealmSpeech["tone"]> = {
  ceremony: () => "stage",
  toast: (i) => (i.calm ? "plain" : "cheer"),
  notice: () => "plain",
};

/** The bottom-centre lane: at most one thing the game says, highest priority first. */
export function pickSpeech(input: MessageInput): RealmSpeech | null {
  for (const kind of SPEECH_ORDER) {
    const text = SPEECH_TEXT[kind](input);
    if (text) return { kind, text, tone: SPEECH_TONE[kind](input) };
  }
  return null;
}
