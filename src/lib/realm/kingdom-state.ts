import type { BuildingOverview } from "@/lib/services/deeds";

export type KingdomState = { tone: "gentle" | "monsters"; buildings: BuildingOverview[] };
export type BuildingProgress = { done: number; total: number; complete: boolean };

/**
 * Applies a finished deed's building progress. `rose` is true only when the
 * building went from unfinished to complete in this step, which is when the
 * world should raise it.
 */
export function applyDeedResult(state: KingdomState, buildingId: string, result: BuildingProgress): { state: KingdomState; rose: boolean } {
  const index = state.buildings.findIndex((b) => b.id === buildingId);
  if (index === -1) return { state, rose: false };
  const before = state.buildings[index];
  const rose = !before.complete && result.complete;
  const buildings = state.buildings.slice();
  buildings[index] = { ...before, done: result.done, total: result.total, complete: result.complete };
  return { state: { ...state, buildings }, rose };
}
