"use client";

/**
 * What the villagers have already said today, so the quest a villager mentions is never mentioned
 * again by another (or the same one) that day. Kept per hero and per SERVER day in `sessionStorage`
 * (`realm-mentions:<childId>:<today>` holds a JSON list of assignment ids): a reload in the same tab
 * remembers, a new day starts clean. Every storage access is guarded, and a blocked store degrades
 * to this visit's memory. It is a convenience, never a record.
 */

import { useCallback, useRef } from "react";
import { pickMention, type RecentQuest } from "@/lib/realm/mentions";

export function mentionsKey(childId: string, today: string): string {
  return `realm-mentions:${childId}:${today}`;
}

function readSaid(key: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(key) ?? "null");
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeSaid(key: string, said: ReadonlySet<string>): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify([...said]));
  } catch {
    // Blocked storage: this visit's memory still holds.
  }
}

/**
 * A function that, for a villager's id, returns the line they say about a quest the hero finished
 * (`pickMention`) and marks that quest said for the day, or null: nothing in their trade, nothing
 * unsaid, or no hero or server day to key on. Call it once per conversation, from the hero's own
 * visit; the caller keeps the line for as long as the board is open.
 */
export function useMentions({
  childId,
  today,
  recent,
}: {
  childId: string | null;
  /** The server's day (`bundle.today`), never the device's. */
  today: string | undefined;
  recent: readonly RecentQuest[];
}): (villagerId: string) => string | null {
  const memory = useRef<{ key: string; said: Set<string> } | null>(null);
  return useCallback(
    (villagerId: string) => {
      if (!childId || !today) return null;
      const key = mentionsKey(childId, today);
      if (memory.current?.key !== key) memory.current = { key, said: readSaid(key) };
      const { said } = memory.current;
      const picked = pickMention({ villagerId, recent, said, date: today });
      if (!picked) return null;
      said.add(picked.assignmentId);
      writeSaid(key, said);
      return picked.line;
    },
    [childId, today, recent],
  );
}
