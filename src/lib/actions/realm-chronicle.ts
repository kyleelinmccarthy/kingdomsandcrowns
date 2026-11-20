"use server";

import { isChildActor, requireChildAccess } from "@/lib/auth/access";
import { loadChronicle, type ChronicleWeek } from "@/lib/services/realm-chronicle";

/**
 * The hero's Chronicle, for the book at the Scribe's lectern in the Realm. Read access only: a
 * grown-up visiting the hero's Realm may read it. `canSeal` says whether this reader may press a
 * seal from the book: a grown-up with edit access, never the hero and never a view-only visitor
 * (`sealEntry` refuses them anyway). It loads when the book opens and never rides along with the
 * Realm's bundle.
 */
export async function getChronicle(childId: string): Promise<{ weeks: ChronicleWeek[]; canSeal: boolean }> {
  const { access } = await requireChildAccess(childId);
  const weeks = await loadChronicle(childId);
  return { weeks, canSeal: !isChildActor(access) && access.permission === "edit" };
}
