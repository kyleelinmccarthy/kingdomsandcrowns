/**
 * FNV-1a. Small, dependency-free (no filesystem), and good enough to spread item ids over a seed space.
 * Shared by the drill blind pass, the sort blind pass and the sort drawer (opaque item ids).
 */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A 32-bit number as 8 lower-case hex characters, zero-padded: how an opaque id or a sheet code is written. */
export const hex8 = (n: number): string => n.toString(16).padStart(8, "0");
