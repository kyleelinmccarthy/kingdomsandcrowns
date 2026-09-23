/**
 * NUMBERS BEFORE STRINGS, for the HUD's per-frame writes.
 *
 * Every DOM write the driver makes is guarded by a compare against the last string written —
 * but the string has to be BUILT to be compared, and a template with a few `toFixed` calls is
 * garbage every frame whether or not it changes. So the driver first compares the numbers the
 * string would be made of, already rounded to the precision the string shows, against the ones
 * it used last time, and only builds the string when one of them moved. A child standing still
 * then costs a few number compares and no allocation at all.
 *
 * Each slot holds up to five numbers. Keys start as NaN, which equals nothing, so the first
 * frame always writes.
 */

export const KEY_WIDTH = 5;

export type PaintKeys = Float64Array;

export function makePaintKeys(slots: number): PaintKeys {
  return new Float64Array(Math.max(1, slots) * KEY_WIDTH).fill(Number.NaN);
}

/** True, and remembered, when any of the numbers differs from the slot's last; false when all match. */
export function keyChanged(keys: PaintKeys, slot: number, a: number, b = 0, c = 0, d = 0, e = 0): boolean {
  const o = slot * KEY_WIDTH;
  if (keys[o] === a && keys[o + 1] === b && keys[o + 2] === c && keys[o + 3] === d && keys[o + 4] === e) return false;
  keys[o] = a;
  keys[o + 1] = b;
  keys[o + 2] = c;
  keys[o + 3] = d;
  keys[o + 4] = e;
  return true;
}

/** Forgets a slot, so its next `keyChanged` is true whatever it is given (a plate hidden and shown again). */
export function forgetKey(keys: PaintKeys, slot: number): void {
  keys[slot * KEY_WIDTH] = Number.NaN;
}
