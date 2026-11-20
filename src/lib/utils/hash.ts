/**
 * A small, stable string hash (32-bit FNV-1a). Seeds the troubles' placement and picks a villager's
 * line of the day; the same text always gives the same number, on the server and the client alike.
 */
export function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
