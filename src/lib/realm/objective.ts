import { BUILDINGS, findBuilding } from "@/lib/utils/kingdom";
import { SIDE_QUEST_LOWER } from "@/lib/utils/side-quest-copy";
import { villagerForBuilding } from "./villagers";
import type { SiteProgress } from "./layout";

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

/** BUILDINGS order — the last tie-break, and the reason a brand-new hero always starts at the well. */
const ORDER = new Map(BUILDINGS.map((b, i) => [b.id, i]));

/** The card tracks between one and all eight sites; Surfaces only ever asks for 1 or 3. */
function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 1;
  return Math.min(8, Math.max(1, Math.floor(limit)));
}

function toObjective(p: SiteProgress): Objective {
  const villager = villagerForBuilding(p.id);
  return {
    buildingId: p.id,
    villagerId: villager?.id ?? null,
    // objectiveState filters to catalog ids first, so the id fallback is unreachable; it keeps this total.
    label: findBuilding(p.id)?.label ?? p.id,
    villagerName: villager?.name ?? null,
    done: p.done,
    total: p.total,
  };
}

/**
 * What to do next, best first. An empty `buildings` means the kingdom failed to load — "unknown", never
 * "complete", so a database hiccup can never tell a child their kingdom is finished.
 */
export function objectiveState(buildings: SiteProgress[], limit: number): ObjectiveState {
  // Ids with no catalog entry have no site in the world either (layout.ts skips them).
  const known = buildings.filter((b) => ORDER.has(b.id));
  if (known.length === 0) return { kind: "unknown" };
  const open = known.filter((b) => !b.complete);
  if (open.length === 0) return { kind: "complete" };
  const ranked = open.sort(
    (a, b) => objectiveRank(a) - objectiveRank(b) || b.done - a.done || (ORDER.get(a.id) ?? 0) - (ORDER.get(b.id) ?? 0),
  );
  return { kind: "next", objectives: ranked.slice(0, clampLimit(limit)).map(toObjective) };
}

/** The single primary objective, or null. Convenience over objectiveState(buildings, 1). */
export function pickObjective(buildings: SiteProgress[]): Objective | null {
  const state = objectiveState(buildings, 1);
  if (state.kind !== "next") return null;
  const [objective] = state.objectives;
  return objective ?? null;
}

/**
 * The rise toast, with the next objective folded in so two toasts never queue: one 4-second toast
 * instead of two.
 */
export function riseToast(label: string, next: ObjectiveState): string {
  const stands = `The ${label} stands.`;
  // Interim: slice 13 (the record of the work) owns the final completion line and moves it with its test.
  if (next.kind === "complete") return `${stands} Every building is raised.`;
  if (next.kind === "unknown") return stands;
  const [objective] = next.objectives;
  if (!objective) return stands;
  if (!objective.villagerName) return `${stands} Next: the ${objective.label}.`;
  return `${stands} Next: the ${objective.label}, with ${objective.villagerName}.`;
}

/** The read-aloud line, written for speech. Unknown says nothing: the problem lane already speaks for it. */
export function objectiveSpeech(state: ObjectiveState): string | null {
  if (state.kind === "unknown") return null;
  // Interim: slice 13 owns the final completion line and moves it with its test.
  if (state.kind === "complete") return "Every building is raised. Nothing is waiting.";
  const [objective] = state.objectives;
  if (!objective) return null;
  const where = `Your next ${SIDE_QUEST_LOWER} is at the ${objective.label}.`;
  return objective.villagerName ? `${where} ${objective.villagerName} is waiting.` : where;
}
