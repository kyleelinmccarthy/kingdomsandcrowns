/**
 * PAUSING, as pure rules: what pauses the game without being asked, and what the pause screen
 * says when it does.
 *
 * A pause already stops a child's minutes (the play clock does not tick while any panel is open).
 * What this adds is the pauses a child never asks for: the tab hidden, the window left, the
 * captured mouse let go, or nobody touching anything for two minutes. Each of them must stop the
 * clock, none of them may open over a panel that is already open, and none of them may get in a
 * visiting grown-up's way — a grown-up spends nothing, so there is nothing to protect.
 */

import type { Viewer } from "./frame";
import { minutesWord } from "@/lib/utils/minutes-copy";

/** Why the game is paused: the child asked (Esc, P, the button), they were away, or nothing moved. */
export type PauseWhy = "you" | "away" | "idle";

/** What can pause the game by itself. `look` is the scene's `onLookFreed`: the captured mouse let go. */
export type AutoTrigger = "hidden" | "blur" | "look" | "idle";

/** How long a child may leave the game untouched before it asks "Are you there?". */
export const IDLE_MS = 2 * 60_000;

/**
 * The most minutes one idle pause gives back: the idle wait in whole minutes, rounded up. The
 * client never asks for more and the server refuses more (`refundIdleMinutes`), so a forged
 * refund can return at most this much of what was really spent, once per `IDLE_MS`.
 */
export const IDLE_REFUND_MAX_MINUTES = Math.ceil(IDLE_MS / 60_000);

/**
 * Whether a trigger pauses the game now, and why; null when it must not.
 *
 * - `playing`: no panel is open. Nothing here ever opens over one.
 * - `clock`: the child's own clock is running. A grown-up has none, so only Esc pauses them.
 * - `focused`: the window has focus and is shown. The browser lets the captured mouse go on Esc
 *   (which never reaches the page) and when the window loses focus; only the first is a pause the
 *   child asked for.
 */
export function autoPause(trigger: AutoTrigger, s: { playing: boolean; clock: boolean; focused: boolean }): PauseWhy | null {
  if (!s.playing) return null;
  if (trigger === "look" && s.focused) return "you";
  if (!s.clock) return null;
  return trigger === "idle" ? "idle" : "away";
}

export type PauseCopy = { title: string; reason: string | null; line: string; resume: string };

const HONEST = "The world waits for you. Your minutes are not ticking.";

/**
 * The pause screen's words: why it paused, when it paused by itself, over the honest line. An idle
 * pause says what it gave back (`refunded`, from the server); while that is still being asked
 * (`undefined`) it says no reason yet rather than one that may change.
 */
export function pauseCopy(why: PauseWhy, viewer: Viewer, heroName: string, refunded?: number): PauseCopy {
  if (viewer === "parent") return { title: "Paused", reason: null, line: `${heroName}'s Realm waits while you look.`, resume: "Resume" };
  if (why === "away") return { title: "Paused", reason: "Paused while you were away — your minutes stopped too.", line: HONEST, resume: "Resume" };
  if (why === "idle") return { title: `Are you there, ${heroName}?`, reason: idleReason(refunded), line: HONEST, resume: "I'm back!" };
  return { title: "Paused", reason: null, line: HONEST, resume: "Resume" };
}

function idleReason(refunded: number | undefined): string | null {
  if (refunded === undefined) return null;
  if (refunded < 1) return "You stepped away, so the Realm paused — your minutes stopped too.";
  return `You stepped away, so the Realm paused and gave back ${refunded} ${minutesWord(refunded)}.`;
}
