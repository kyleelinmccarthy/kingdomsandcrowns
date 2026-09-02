/**
 * Upkeep is gated by two switches: the family's master toggle (off by default)
 * and a per-child toggle (on by default, so flipping the family switch works
 * immediately for every hero and parents opt individual children *out*).
 *
 * Every surface — nav copy, tabs, server actions, assignment generation — asks
 * this one function, so there is no second opinion about whether chores are on.
 */
export function isUpkeepEnabled(
  family: { upkeepEnabled: boolean } | null | undefined,
  child: { upkeepEnabled: boolean } | null | undefined
): boolean {
  return Boolean(family?.upkeepEnabled && child?.upkeepEnabled);
}
