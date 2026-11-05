import type { BuildingOverview } from "@/lib/services/deeds";
import type { Stars } from "@/lib/utils/deed-scoring";

export type KingdomState = { tone: "gentle" | "monsters"; buildings: BuildingOverview[] };
export type BuildingProgress = { done: number; total: number; complete: boolean };

/**
 * Applies a finished deed's building progress. `rose` is true only when the
 * building went from unfinished to complete in this step, which is when the
 * world should raise it. The building's stars, and the finished deed's new best and crown, travel with it
 * so the board shows them when the child comes back to the villager without a reload.
 */
export function applyDeedResult(
  state: KingdomState,
  buildingId: string,
  result: BuildingProgress & { stars?: number; maxStars?: number },
  deed?: { id: string; bestStars: Stars; crowned?: boolean },
): { state: KingdomState; rose: boolean } {
  const index = state.buildings.findIndex((b) => b.id === buildingId);
  if (index === -1) return { state, rose: false };
  const before = state.buildings[index];
  const rose = !before.complete && result.complete;
  const buildings = state.buildings.slice();
  buildings[index] = {
    ...before,
    done: result.done, total: result.total, complete: result.complete,
    stars: result.stars ?? before.stars, maxStars: result.maxStars ?? before.maxStars,
    deeds: deed
      ? before.deeds.map((d) => (d.id === deed.id ? { ...d, bestStars: deed.bestStars, crowned: deed.crowned ?? d.crowned } : d))
      : before.deeds,
  };
  return { state: { ...state, buildings }, rose };
}
