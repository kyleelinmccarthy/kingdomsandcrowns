export const MAX_SPELL_SLOTS = 12;

/** Pages in a hero's spellbook: four to start, one more every ten levels, twelve at most. */
export function spellSlots(level: number): number {
  const safe = Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  return Math.min(MAX_SPELL_SLOTS, 4 + Math.floor(safe / 10));
}
