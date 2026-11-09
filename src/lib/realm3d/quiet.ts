/**
 * THE QUIET WORLD, as pure rules (spec §4.5, owner's decision 8).
 *
 * A child at 0 minutes in an earning mode still walks in: to talk, to learn, and to earn time
 * back with a side quest. Only the play that minutes pay for rests — troubles, riding and recess.
 * Everything else (spells, buildings, exploring, places, wardrobe, companion, castle) stays on.
 * The composition root reads `quietSurfaces` once and hands each answer to the system it gates,
 * so the rule lives here and nowhere else.
 *
 * A grown-up's visit has no clock and so is never quiet: the caller passes `false` for them.
 */

import { minutesWord } from "@/lib/utils/minutes-copy";

export type QuietSurfaces = { troubles: boolean; riding: boolean; recess: boolean };

const AWAKE: QuietSurfaces = { troubles: true, riding: true, recess: true };
const QUIET: QuietSurfaces = { troubles: false, riding: false, recess: false };

/** Which of the systems minutes pay for are on. Two fixed objects, so a memo or a dep stays stable. */
export function quietSurfaces(quiet: boolean): QuietSurfaces {
  return quiet ? QUIET : AWAKE;
}

/** Where the minutes chip is, while quiet: an invitation, never a refusal. */
export const QUIET_LINE = "Earn play time with a side quest";

/** What the world says as minutes land on a quiet clock. */
export function wakeToast(minutes: number): string {
  return `+${minutes} ${minutesWord(minutes)} — the Realm wakes up!`;
}

/** What a resting system says when the child reaches for it: "The Ring is resting. Earn …". */
export function restingLine(what: string): string {
  return `${what} is resting. ${QUIET_LINE}.`;
}
