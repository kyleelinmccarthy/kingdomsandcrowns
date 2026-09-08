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
