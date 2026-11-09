/** "minute" or "minutes", for every line that counts Realm minutes. */
export function minutesWord(n: number): string {
  return n === 1 ? "minute" : "minutes";
}
