import { timeRangesOverlap } from "./schedule-days";
import type { TimeBlock } from "./realm-access";

const TIME = /^\d{2}:\d{2}$/;

export function isValidTimeRange(start: string, end: string): boolean {
  return TIME.test(start) && TIME.test(end) && start < end;
}

/**
 * Recess uses plain overlap, not `timeRangesConflict`: two classes may share
 * one slot on purpose, but a recess sitting on a class would leave no honest
 * answer to "is it class or recess at 9:30?"
 */
export function findRecessConflict(
  candidate: TimeBlock,
  classBlocks: TimeBlock[],
  recessBlocks: TimeBlock[]
): TimeBlock | null {
  const hit = [...classBlocks, ...recessBlocks].find((b) =>
    timeRangesOverlap(candidate.startTime, candidate.endTime, b.startTime, b.endTime)
  );
  return hit ?? null;
}
