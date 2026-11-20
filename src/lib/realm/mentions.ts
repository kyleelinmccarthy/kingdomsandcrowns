// What a villager says about the hero's real work. Pure and client-safe: no db, no DOM.
import { hashId } from "@/lib/utils/hash";
import type { MaterialId } from "./materials";
import { villagerById } from "./villagers";

/** A quest the hero finished lately: what a villager may have heard about. */
export type RecentQuest = { assignmentId: string; title: string; material: MaterialId };

export type Mention = { line: string; assignmentId: string };

const TOKEN = "{quest}";
/** The longest title a villager will say; a longer one is cut and ends in an ellipsis. */
const MAX_TITLE = 60;
const ELLIPSIS = "…";
/**
 * The title's own quotes. The talk panel already wraps the whole speech in double quotes, so a
 * title inside it takes single ones (a quote within a quote), and never a second “ beside the first.
 */
const OPEN = "‘";
const CLOSE = "’";

function sayable(title: string): string {
  const t = title.trim();
  return t.length <= MAX_TITLE ? t : `${t.slice(0, MAX_TITLE - 1).trimEnd()}${ELLIPSIS}`;
}

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
  // A quest with no title is never mentioned: "I hear you finished a quest" says nothing.
  const candidates = recent.filter((r) => r.title.trim() !== "" && !said.has(r.assignmentId) && (villager.mentions[r.material]?.length ?? 0) > 0);
  if (candidates.length === 0) return null;
  const quest = candidates[hashId(`${date}:${villagerId}`) % candidates.length];
  const lines = villager.mentions[quest.material] ?? [];
  const template = lines[hashId(`${date}:${villagerId}:${quest.assignmentId}`) % lines.length];
  return { line: mentionLine(template, quest.title), assignmentId: quest.assignmentId };
}

/**
 * A villager's line (`{quest}` bare in it) with the title said in it: cut to 60 characters and
 * wrapped once, in single quotes. A title that already ends its own sentence (".", "?", "!" or the
 * cut's "…") drops the stop or comma the line puts after it, so "‘Done.’." or "‘Why?’," never shows.
 */
export function mentionLine(template: string, title: string): string {
  const said = sayable(title);
  const line = /[.?!…]$/.test(said) ? template.replace(/\{quest\}[.,!?]/, TOKEN) : template;
  // A function replacer, so a title like "$&" is never read as a replacement pattern.
  return line.replace(TOKEN, () => `${OPEN}${said}${CLOSE}`);
}
