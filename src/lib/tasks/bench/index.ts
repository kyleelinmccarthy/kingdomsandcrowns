/**
 * The bench: one generator per skill the `measure` kind presents (R-C3 names two per grade).
 * Server-only, like the registry: a generator knows its answers.
 *
 * Generators are seeded and pure (the `Rng` only, never `Math.random`), and write every value as a
 * decimal or fraction string. Empty until the bench generators land, so no skill is benched yet.
 */
import type { Rng } from "@/lib/utils/drill-generators";
import type { MeasureTask } from "../types";

/** One bench task for `skillId` at mastery `level`, or null when it has none to give at this rung. */
export type BenchGenerator = (level: number, rng: Rng, skillId: string) => MeasureTask | null;

export const BENCH: Record<string, BenchGenerator> = {};

/** The bench's generator for a skill, if it has one. Own keys only: "toString" is no skill. */
export function benchFor(skillId: string): BenchGenerator | undefined {
  return Object.prototype.hasOwnProperty.call(BENCH, skillId) ? BENCH[skillId] : undefined;
}
