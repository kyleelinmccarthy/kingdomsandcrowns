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
