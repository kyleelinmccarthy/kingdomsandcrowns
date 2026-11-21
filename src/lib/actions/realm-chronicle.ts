"use server";

import { isChildActor, requireChildAccess } from "@/lib/auth/access";
import type { LoreId } from "@/lib/realm/lore";
import { loadChronicle, type ChronicleWeek } from "@/lib/services/realm-chronicle";
import { loadFoundPages } from "@/lib/services/realm-world-state";

/**
 * The hero's Chronicle, for the book at the Scribe's lectern in the Realm. Read access only: a
 * grown-up visiting the hero's Realm may read it. `canSeal` says whether this reader may press a
 * seal from the book: a grown-up with edit access, never the hero and never a view-only visitor
 * (`sealEntry` refuses them anyway). It loads when the book opens and never rides along with the
 * Realm's bundle. `lore` is the hero's found pages, in found order (the book's "Found pages"): the
 * same for the hero, a visiting grown-up of either permission, and whatever the locks switch says,
 * since what a hero found stays theirs. The weeks and the pages are read together.
 */
export async function getChronicle(childId: string): Promise<{ weeks: ChronicleWeek[]; canSeal: boolean; lore: { id: LoreId; title: string; text: string }[] }> {
  const { access } = await requireChildAccess(childId);
  const [weeks, lore] = await Promise.all([loadChronicle(childId), loadFoundPages(childId)]);
  return { weeks, canSeal: !isChildActor(access) && access.permission === "edit", lore };
}
