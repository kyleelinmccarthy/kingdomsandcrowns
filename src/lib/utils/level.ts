/** XP needed to climb one level. Level 1 starts at 0 XP. */
export const XP_PER_LEVEL = 100;

/**
 * The one level formula. It used to be inlined in nine places; anything that
 * shows or gates on a level must call this so the rule can change in one spot.
 * Unusable input (negative, NaN) is level 1 rather than an exception, because
 * a display should never crash over a bad counter.
 */
export function levelFromXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return 1;
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}
