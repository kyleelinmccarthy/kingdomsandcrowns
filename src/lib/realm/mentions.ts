// What a villager says about the hero's real work. Pure and client-safe: no db, no DOM.
import { hashId } from "@/lib/utils/hash";
import type { MaterialId } from "./materials";
import { villagerById } from "./villagers";

/** A quest the hero finished lately: what a villager may have heard about. */
export type RecentQuest = { assignmentId: string; title: string; material: MaterialId };

export type Mention = { line: string; assignmentId: string };

const TOKEN = "{quest}";

/**
 * At most one mention for one visit with `villagerId`: a line about a quest in `recent` (newest
 * first) that belongs to this villager's trade (their `mentions` keys) and is not in `said`, the
 * ids already mentioned today. Null when nothing qualifies, and the villager just greets.
 *
 * Deterministic by `(date, villagerId)`, so the same day's visit reads the same, and the day's
 * `said` (fed by the caller after each pick) is what keeps two villagers off the same quest.
 * The title goes in as plain text; the caller renders it as text, never as HTML.
 */
export function pickMention(input: {
  villagerId: string;
  recent: readonly RecentQuest[];
  said: ReadonlySet<string>;
  date: string;
}): Mention | null {
  const { villagerId, recent, said, date } = input;
  const villager = villagerById(villagerId);
  if (!villager) return null;
  const candidates = recent.filter((r) => !said.has(r.assignmentId) && (villager.mentions[r.material]?.length ?? 0) > 0);
  if (candidates.length === 0) return null;
  const quest = candidates[hashId(`${date}:${villagerId}`) % candidates.length];
  const lines = villager.mentions[quest.material] ?? [];
  const template = lines[hashId(`${date}:${villagerId}:${quest.assignmentId}`) % lines.length];
  // A function replacer, so a title like "$&" is never read as a replacement pattern.
  return { line: template.replace(TOKEN, () => quest.title), assignmentId: quest.assignmentId };
}
