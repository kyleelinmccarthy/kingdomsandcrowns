/**
 * The bench's words that both sides read: the server writes them (`measure.ts`) and the browser
 * reads them back (the bench surface). Client-safe and pure.
 */
import type { Quantity } from "./types";

/** A label without its unit: "4 blocks" is "4", "1/2 ft" is "1/2". The notation reads as sums, not as words. */
export const bareLabel = (label: string) => label.replace(/\s+[A-Za-z][A-Za-z.\s]*$/, "");

/**
 * A missed assemble task's answer, already a sentence: "Pieces that add up to 9 blocks, like 1 + 8 = 9."
 * The villager says it as it is, knowing the task answered was an assemble one (`attemptFeedback`).
 */
export const assembleReveal = (targetLabel: string, bridge: string) => `Pieces that add up to ${targetLabel}, like ${bridge}.`;

/** One of a unit: "feet" is "foot", "square feet" is "square foot", "blocks" is "block". */
const singular = (unit: string) => (unit.endsWith("feet") ? `${unit.slice(0, -4)}foot` : unit.replace(/s$/, ""));

/**
 * A missed cut's answer, bare with its unit ("7 blocks", "1 foot", "9.42 feet"), in the notation the
 * task was written in. The worked equation is the explanation's to say, so a miss says it once.
 */
export const cutReveal = (answer: string, unit: string) => (unit ? `${answer} ${answer === "1" ? singular(unit) : unit}` : answer);

/** The noun and the hint's "a"/"an" for each quantity a cut can measure; a count is asked "How many?". */
const MEASURES: Record<Exclude<Quantity, "count">, { noun: string; a: string }> = {
  length: { noun: "Length", a: "a length" },
  area: { noun: "Area", a: "an area" },
  volume: { noun: "Volume", a: "a volume" },
  weight: { noun: "Weight", a: "a weight" },
};

export type CutWords = {
  /** The box's label: "Length in feet", "Area in square feet", "How many stones?". */
  label: string;
  /** Said under the box when what is typed is no number. */
  hint: string;
  /** The button: a length is cut, anything else is set. */
  verb: "Cut it" | "Set it";
  /** The drawing's spoken name: a ruler with the board cut for a length, a scale for anything else. */
  gauge(max: string, typed?: string): string;
};

/**
 * What the cut surface calls its number, from what the task measures (a task with none is a
 * length, as every cut was before quantities were named). An area, a volume, a weight or a count is
 * never called a length.
 */
export function cutWords(quantity: Quantity | undefined, unit: string): CutWords {
  const q = quantity ?? "length";
  const inUnit = unit ? ` in ${unit}` : "";
  if (q === "length") {
    return {
      label: `Length${inUnit}`, hint: "Write a length like 3, 1/2 or 0.5.", verb: "Cut it",
      gauge: (max, typed) => `A ruler${inUnit}, to ${max}${typed ? `, the board cut at ${typed}` : ""}`,
    };
  }
  const scale = (max: string, typed?: string) => `A scale${inUnit}, to ${max}${typed ? `, set at ${typed}` : ""}`;
  if (q === "count") return { label: unit ? `How many ${unit}?` : "How many?", hint: "Write a number like 3 or 12.", verb: "Set it", gauge: scale };
  const { noun, a } = MEASURES[q];
  return { label: `${noun}${inUnit}`, hint: `Write ${a} like 3, 1/2 or 0.5.`, verb: "Set it", gauge: scale };
}
