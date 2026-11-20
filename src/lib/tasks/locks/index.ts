/**
 * The locks: one generator per skill the `lock` kind presents, keyed by skill id. Server-only, like
 * the registry: a generator knows its solutions.
 *
 * Each band registers its `logic-*` skills here: K-4 (`logic-k1`, `logic-g23`, in `k4.ts`) so far,
 * the older bands to come (F3), and the science and vocabulary sort pools after them (F6). A skill
 * with no entry presents as `choice`, so a run draws exactly as before (ruling RF-a). Generators are
 * seeded and pure (the `Rng` only, never `Math.random`), and each task id encodes its parameters, so
 * one id is one puzzle.
 */
import type { Rng } from "@/lib/utils/drill-generators";
import type { LockTask } from "../types";
import { G58_LOCKS } from "./g58";
import { K4_LOCKS } from "./k4";

/** One lock for `skillId` at mastery `level`, or null when it has none to give at this rung. */
export type LockGenerator = (level: number, rng: Rng, skillId: string) => LockTask | null;

export const LOCKS: Record<string, LockGenerator> = { ...K4_LOCKS, ...G58_LOCKS };

/** The lock generator for a skill, if it has one. Own keys only: "toString" is no skill. */
export function lockFor(skillId: string): LockGenerator | undefined {
  return Object.prototype.hasOwnProperty.call(LOCKS, skillId) ? LOCKS[skillId] : undefined;
}
