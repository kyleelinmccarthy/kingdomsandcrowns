/**
 * The bench's words that both sides read: the server writes them (`measure.ts`) and the browser
 * reads them back (the bench surface). Client-safe and pure.
 */

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
