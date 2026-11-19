// What a finished quest made, as its card tells it. Pure and client-safe.
import { nearestPlanHint, planHint, planState } from "@/lib/realm/improvements";
import { isMaterialId, materialPhrase, type MaterialId } from "@/lib/realm/materials";
import { activePin } from "@/lib/realm/works-state";

/** `made` is "+1 Ink · the Library's Reading Wing needs 3 more" (the hint is optional); `minutes` is the Realm minutes the quest earned, only when a grown-up turned that on. */
export type QuestReward = { made: string | null; minutes: number | null };

/** The assignments with each one's reward attached (an assignment with none is returned as it is). */
export function withRewards<T extends { assignment: { id: string } }>(
  assignments: T[],
  rewards: Record<string, QuestReward>,
): (T & { rewards?: QuestReward })[] {
  return assignments.map((a) => (Object.hasOwn(rewards, a.assignment.id) ? { ...a, rewards: rewards[a.assignment.id] } : a));
}

/**
 * The "+1 Ink · the Library's Reading Wing needs 3 more" line for each earned row, by the quest
 * that earned it. The hint says where the material can go: the active pin if it wants it, else the
 * nearest plan that does; timber, which fills any gap, points at the nearest short plan overall.
 * A row with no quest, or a material the catalog lacks, says nothing.
 */
export function rewardLines(
  earned: readonly { materialId: string; amount: number; sourceAssignmentId: string | null }[],
  input: { built: Record<string, number>; raised: ReadonlySet<string>; balance: Record<MaterialId, number> },
  pinned: string | null,
): Map<string, string> {
  const plans = planState(input);
  const pin = activePin({ built: input.built, pinned });
  const out = new Map<string, string>();
  for (const r of earned) {
    if (!r.sourceAssignmentId || !isMaterialId(r.materialId)) continue;
    const hint = r.materialId === "timber" ? nearestPlanHint(plans) : planHint(r.materialId, plans, pin);
    out.set(r.sourceAssignmentId, `+${materialPhrase(r.amount, r.materialId)}${hint ? ` · ${hint}` : ""}`);
  }
  return out;
}

/**
 * A `.catch` for a read the page can do without: logs the failure once, then answers `fallback`.
 * The page degrades to showing less, but the log says why.
 */
export function orElse<T>(what: string, fallback: T): (error: unknown) => T {
  return (error) => {
    console.error(`Could not read ${what}`, error);
    return fallback;
  };
}
