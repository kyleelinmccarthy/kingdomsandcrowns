import { DEEDS } from "@/lib/utils/deeds";
import { BUILDINGS, findBuilding } from "@/lib/utils/kingdom";
import type { SkillArea } from "@/lib/utils/skills";
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
  | { kind: "complete" }                       // every building built and every star earned
  | { kind: "next"; objectives: Objective[] }  // 1..limit, best first
  | { kind: "stars"; objectives: Objective[] }; // every building built; done/total are its stars

/** The kinds that name somewhere to go: the card, the ! and the map all read these alike. */
export function hasObjectives(s: ObjectiveState): s is Extract<ObjectiveState, { objectives: Objective[] }> {
  return s.kind === "next" || s.kind === "stars";
}

/**
 * Work in progress leads, untouched buildings follow, finished ones rest at the end.
 *
 * Exported for its test rather than for a caller: `rankBuildings` (which deed-picker.tsx uses)
 * and `objectiveState` are both written in terms of it, so this is where the three-way order
 * is pinned once. There is deliberately no `pickObjective`-style second entry point: a
 * convenience wrapper with its own hardwired limit is a place for the tracked-objective count
 * to drift away from `Surfaces.trackedObjectives`.
 */
export function objectiveRank(b: { done: number; complete: boolean }): 0 | 1 | 2 {
  return b.complete ? 2 : b.done > 0 ? 0 : 1;
}

/**
 * A stable sort by objectiveRank, and nothing else: deed-picker.tsx imports this, so the Side Quests
 * page and the world order their sites the same way. objectiveState adds the higher-done tie-break on
 * top of this rank; the list on the Side Quests page deliberately does not.
 */
export function rankBuildings<T extends { id: string; done: number; complete: boolean }>(
  buildings: T[],
  focusAreas: ReadonlySet<SkillArea> = new Set(),
): T[] {
  const leans = focusLean(focusAreas);
  return [...buildings].sort((a, b) => objectiveRank(a) - objectiveRank(b) || leans(a.id) - leans(b.id));
}

/**
 * 0 for a building with a deed in a strand a grown-up asked to focus on, 1 for the rest: a tie-break
 * only, so it is read after every other rule and never reorders buildings that already differ.
 */
function focusLean(focusAreas: ReadonlySet<SkillArea>): (buildingId: string) => 0 | 1 {
  if (focusAreas.size === 0) return () => 1;
  const wanted = new Set(DEEDS.filter((d) => focusAreas.has(d.area)).map((d) => d.buildingId));
  return (id) => (wanted.has(id) ? 0 : 1);
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
export function objectiveState(buildings: SiteProgress[], limit: number, focusAreas: ReadonlySet<SkillArea> = new Set()): ObjectiveState {
  // Ids with no catalog entry have no site in the world either (layout.ts skips them).
  const known = buildings.filter((b) => ORDER.has(b.id));
  if (known.length === 0) return { kind: "unknown" };
  const open = known.filter((b) => !b.complete);
  if (open.length === 0) return starsState(known, limit);
  const leans = focusLean(focusAreas);
  const ranked = open.sort(
    (a, b) =>
      objectiveRank(a) - objectiveRank(b) || b.done - a.done || leans(a.id) - leans(b.id) ||
      (ORDER.get(a.id) ?? 0) - (ORDER.get(b.id) ?? 0),
  );
  return { kind: "next", objectives: ranked.slice(0, clampLimit(limit)).map(toObjective) };
}

const starsLeft = (b: SiteProgress) => (b.maxStars ?? 0) - (b.stars ?? 0);

/**
 * After the last building rises there is still something worth doing: the most stars still to earn
 * first. Callers that send no stars (the flat Realm) see "complete" as before.
 */
function starsState(built: SiteProgress[], limit: number): ObjectiveState {
  const open = built.filter((b) => starsLeft(b) > 0);
  if (open.length === 0) return { kind: "complete" };
  const ranked = open.sort((a, b) => starsLeft(b) - starsLeft(a) || (ORDER.get(a.id) ?? 0) - (ORDER.get(b.id) ?? 0));
  return { kind: "stars", objectives: ranked.slice(0, clampLimit(limit)).map((p) => ({ ...toObjective(p), done: p.stars ?? 0, total: p.maxStars ?? 0 })) };
}

/**
 * The rise toast, with the next objective folded in so two toasts never queue: one 4-second toast
 * instead of two.
 */
export function riseToast(label: string, next: ObjectiveState): string {
  const stands = `The ${label} stands.`;
  // Interim: slice 13 (the record of the work) owns the final completion line and moves it with its test.
  if (next.kind === "complete") return `${stands} Every building is built.`;
  if (next.kind === "unknown") return stands;
  const [objective] = next.objectives;
  if (!objective) return stands;
  if (next.kind === "stars") return `${stands} Every building is built — there are stars to earn at the ${objective.label}.`;
  if (!objective.villagerName) return `${stands} Next: the ${objective.label}.`;
  return `${stands} Next: the ${objective.label}, with ${objective.villagerName}.`;
}

/** The read-aloud line, written for speech. Unknown says nothing: the problem lane already speaks for it. */
export function objectiveSpeech(state: ObjectiveState): string | null {
  if (state.kind === "unknown") return null;
  // Interim: slice 13 owns the final completion line and moves it with its test.
  if (state.kind === "complete") return "Every building is built. Nothing is waiting.";
  const [objective] = state.objectives;
  if (!objective) return null;
  if (state.kind === "stars") {
    const where = `Every building stands. There are stars to earn at the ${objective.label}.`;
    return objective.villagerName ? `${where} ${objective.villagerName} is waiting.` : where;
  }
  const where = `Your next ${SIDE_QUEST_LOWER} is at the ${objective.label}.`;
  return objective.villagerName ? `${where} ${objective.villagerName} is waiting.` : where;
}
