"use server";

import { requireChildAccess } from "@/lib/auth/access";
import { loadChronicle, type ChronicleWeek } from "@/lib/services/realm-chronicle";

/**
 * The hero's Chronicle, for the book at the Scribe's lectern in the Realm. Read access only: a
 * grown-up visiting the hero's Realm may read it (sealing stays on the quest card). It loads when
 * the book opens and never rides along with the Realm's bundle.
 */
export async function getChronicle(childId: string): Promise<ChronicleWeek[]> {
  await requireChildAccess(childId);
  return loadChronicle(childId);
}
