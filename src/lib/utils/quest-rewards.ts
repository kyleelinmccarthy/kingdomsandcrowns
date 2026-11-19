// What a finished quest made, as its card tells it. Pure and client-safe.

/** `made` is "+1 Ink · the Library's Reading Wing needs 3 more" (the hint is optional); `minutes` is the Realm minutes the quest earned, only when a grown-up turned that on. */
export type QuestReward = { made: string | null; minutes: number | null };

/** The assignments with each one's reward attached (an assignment with none is returned as it is). */
export function withRewards<T extends { assignment: { id: string } }>(
  assignments: T[],
  rewards: Record<string, QuestReward>,
): (T & { rewards?: QuestReward })[] {
  return assignments.map((a) => (Object.hasOwn(rewards, a.assignment.id) ? { ...a, rewards: rewards[a.assignment.id] } : a));
}
