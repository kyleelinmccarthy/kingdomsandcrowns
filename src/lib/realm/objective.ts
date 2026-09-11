export type Objective = {
  buildingId: string;
  villagerId: string | null;   // null only if the catalogs ever disagree
  label: string;               // "Village Well"
  villagerName: string | null; // "Old Bram"
  done: number;
  total: number;
};

export type ObjectiveState =
  | { kind: "unknown" }                        // no kingdom data: the load failed
  | { kind: "complete" }                       // every building raised
  | { kind: "next"; objectives: Objective[] }; // 1..limit, best first

/** Work in progress leads, untouched buildings follow, finished ones rest at the end. */
export function objectiveRank(b: { done: number; complete: boolean }): 0 | 1 | 2 {
  return b.complete ? 2 : b.done > 0 ? 0 : 1;
}

/**
 * A stable sort by objectiveRank, and nothing else: deed-picker.tsx imports this, so the Side Quests
 * page and the world order their sites the same way. objectiveState adds the higher-done tie-break on
 * top of this rank; the list on the Side Quests page deliberately does not.
 */
export function rankBuildings<T extends { done: number; complete: boolean }>(buildings: T[]): T[] {
  return [...buildings].sort((a, b) => objectiveRank(a) - objectiveRank(b));
}
