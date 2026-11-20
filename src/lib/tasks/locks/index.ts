/**
 * The locks: one generator per skill the `lock` kind presents, keyed by skill id. Server-only, like
 * the registry: a generator knows its solutions.
 *
 * Empty until the generators land (F2, F3: the `logic-*` skills) and the sort pools are drawn
 * (F6: science and vocabulary skills), so until then no skill presents as a lock and every run
 * draws exactly as before (ruling RF-a). Generators are seeded and pure (the `Rng` only, never
 * `Math.random`), and each task id encodes its parameters, so one id is one puzzle.
 */
import type { Rng } from "@/lib/utils/drill-generators";
import type { LockTask } from "../types";

/** One lock for `skillId` at mastery `level`, or null when it has none to give at this rung. */
export type LockGenerator = (level: number, rng: Rng, skillId: string) => LockTask | null;

export const LOCKS: Record<string, LockGenerator> = {};

/** The lock generator for a skill, if it has one. Own keys only: "toString" is no skill. */
export function lockFor(skillId: string): LockGenerator | undefined {
  return Object.prototype.hasOwnProperty.call(LOCKS, skillId) ? LOCKS[skillId] : undefined;
}
