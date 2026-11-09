/**
 * What a finished side quest pays in Realm play time: its stars × the grown-up's minutes per star,
 * up to the day's side-quest limit (spec 2026-11-09 §4.3). Pure; the server's `paySideQuest`
 * (`services/realm-play.ts`) decides with it under the child's lock and writes the `practice` row.
 */
import { opensDays } from "./realm-day";
import type { RealmSettings } from "./realm-settings";

export type SideQuestPay = {
  minutes: number;
  /** The day's side-quest limit is reached (with this pay): the card says so, gently. */
  full: boolean;
};

export const NO_SIDE_QUEST_PAY: SideQuestPay = { minutes: 0, full: false };

/**
 * `paidToday` is the day's `practice` minutes so far (`practicePaidToday`). Pays nothing where
 * minutes mean nothing — a Realm turned off, or a mode that never reads the balance (§4.7, the
 * same rule that opens days); a limit of 0 is "pay off", never "full".
 */
export function sideQuestPay(
  stars: number,
  s: Pick<RealmSettings, "enabled" | "accessMode" | "minutesPerStar" | "sideQuestDailyCapMinutes">,
  paidToday: number,
): SideQuestPay {
  if (!opensDays(s)) return NO_SIDE_QUEST_PAY;
  const cap = Math.max(0, s.sideQuestDailyCapMinutes);
  const minutes = Math.max(0, Math.min(stars * s.minutesPerStar, cap - paidToday));
  return { minutes, full: cap > 0 && paidToday + minutes >= cap };
}
