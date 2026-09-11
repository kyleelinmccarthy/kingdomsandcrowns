export type RecessTally = { gleams: number; laps: number; bestLapMs: number | null; lapMs: number | null };

/**
 * The HUD's recess prop: shown once recess has ever produced a tally this
 * session, but the running lap clock only while recess is actually active —
 * it must not linger on screen (or keep counting up) after recess ends.
 */
export function hudRecessFor(recess: RecessTally, recessActive: boolean): RecessTally | null {
  if (!(recessActive || recess.laps > 0 || recess.gleams > 0)) return null;
  return { ...recess, lapMs: recessActive ? recess.lapMs : null };
}

/**
 * The recess pill's one line. Best lap and the running lap are deliberately not here:
 * a best lap that resets when the child walks to the Spellbook is a lie, so slice 1
 * deletes it and slice 12 persists it and brings it back as a record (D6.4).
 */
export function recessPillText(gleams: number, laps: number): string {
  const g = Math.max(0, Math.floor(gleams));
  const l = Math.max(0, Math.floor(laps));
  return `Recess · ${g} ${g === 1 ? "gleam" : "gleams"} · ${l} ${l === 1 ? "lap" : "laps"}`;
}
