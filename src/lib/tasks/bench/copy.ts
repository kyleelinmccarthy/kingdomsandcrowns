/**
 * Copy helpers shared by every bench band. Pure.
 */

/**
 * The article for what follows, by how it is SPOKEN: "an 8-foot beam", "an 11-foot rope", "a 6-foot
 * post". `word` is a number written as digits (optionally with a suffix such as "-foot"), or an
 * ordinary word. A number is read by its leading group of up to three digits (the group before a
 * thousands or millions word), so 8, 11, 18, 80-89 and 800-899, and their thousands, take "an";
 * 110 and 118 ("one hundred ...") take "a".
 */
export function aOrAn(word: string): "a" | "an" {
  const digits = /^\d+/.exec(word);
  if (digits) {
    const whole = digits[0];
    const lead = whole.slice(0, whole.length % 3 === 0 ? 3 : whole.length % 3);
    return lead === "11" || lead === "18" || /^8\d{0,2}$/.test(lead) ? "an" : "a";
  }
  const w = word.toLowerCase();
  if (/^(hour|honest|honou?r|heir)/.test(w)) return "an";
  if (/^(uni|use|usu|uti|eu|one|once)/.test(w)) return "a";
  return /^[aeiou]/.test(w) ? "an" : "a";
}

/** `aOrAn`, capitalised for the start of a sentence. */
export const capitalAOrAn = (word: string): "A" | "An" => (aOrAn(word) === "a" ? "A" : "An");
