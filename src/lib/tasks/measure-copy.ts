/**
 * The bench's words that both sides read: the server writes them (`measure.ts`) and the browser
 * reads them back (the bench surface, the villager's feedback). Client-safe and pure.
 */

/** A label without its unit: "4 blocks" is "4", "1/2 ft" is "1/2". The notation reads as sums, not as words. */
export const bareLabel = (label: string) => label.replace(/\s+[A-Za-z][A-Za-z.\s]*$/, "");

const ASSEMBLE_REVEAL_LEAD = "Pieces that add up to ";

/** A missed assemble task's answer, already a sentence: "Pieces that add up to 9 blocks, like 1 + 8 = 9." */
export const assembleReveal = (targetLabel: string, bridge: string) => `${ASSEMBLE_REVEAL_LEAD}${targetLabel}, like ${bridge}.`;

/** Whether an answer is `assembleReveal`'s sentence, to be said as it is rather than as "The answer was …". */
export const isAssembleReveal = (answer: string) => answer.startsWith(ASSEMBLE_REVEAL_LEAD);
