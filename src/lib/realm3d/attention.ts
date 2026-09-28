/**
 * Where a villager is looking: at the child, once the child is near enough to be talking to; back
 * the way they stand the rest of the time. One rule for the keeper in a room and the villager out
 * on the green, so a person behaves the same wherever a child meets them.
 *
 * Pure: no `three`. The scene eases toward this with `turnToward` (`controls.ts`).
 */

/** How near the child has to come, in world units, before a villager turns to them. */
export const NOTICE_REACH = 6;

/**
 * The yaw a villager standing at (`x`, `z`) should turn to (`atan2(dx, dz)`, the scene's basis): the
 * child at (`hx`, `hz`) when within `NOTICE_REACH`, else `rest`. A child standing exactly on the
 * villager's spot has no direction, so they keep `rest` rather than spin.
 */
export function noticeFacing(x: number, z: number, rest: number, hx: number, hz: number): number {
  const dx = hx - x;
  const dz = hz - z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= NOTICE_REACH * NOTICE_REACH || d2 === 0) return rest;
  return Math.atan2(dx, dz);
}
