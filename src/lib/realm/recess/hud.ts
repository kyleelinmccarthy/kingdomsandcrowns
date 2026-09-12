export type RecessTally = { gleams: number; laps: number; bestLapMs: number | null };

/**
 * The HUD's recess prop: the tally once recess has ever produced one this session, and null
 * until then. It is a gate and nothing else — the pill reads `gleams` and `laps`, and D6.4
 * deleted the running lap clock from it, so there is no longer a lap to hold or to clear.
 * Slice 12 brings the lap record back with its own design and its own lifetime.
 */
export function hudRecessFor(recess: RecessTally, recessActive: boolean): RecessTally | null {
  return recessActive || recess.laps > 0 || recess.gleams > 0 ? recess : null;
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
