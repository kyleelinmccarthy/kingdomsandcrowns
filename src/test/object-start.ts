/**
 * A world object's start (`startWorldLockRun`, `startRuneObjectRun`) answers a run, or `{ held: true }`
 * for an object that already holds (smoke I12). `asRun` wraps one for a test that expects a run, so
 * it reads the run's fields directly and fails plainly if the object held instead; a test of the held
 * answer itself calls the action.
 */
import { isHeld, type ObjectRunStart, type RunStart } from "@/lib/utils/deed-run-types";

export const HELD = { held: true } as const;

export function asRun<A extends unknown[]>(start: (...args: A) => Promise<ObjectRunStart>): (...args: A) => Promise<RunStart> {
  return async (...args) => {
    const answer = await start(...args);
    if (isHeld(answer)) throw new Error("Expected a run, but the object holds.");
    return answer;
  };
}
