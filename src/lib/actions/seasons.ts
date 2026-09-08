"use server";

import { revalidatePath } from "next/cache";
import { requireChildAccess } from "@/lib/auth/access";
import { ensureSeason } from "@/lib/services/season-sync";
import { loadSeasons, markCeremonySeen as markSeen } from "@/lib/services/crowns";
import { pendingCeremony, type SeasonWithCeremony } from "@/lib/utils/seasons";

/** The open season, completed history (newest first), and the ceremony waiting to be held, if any. A hero may read their own. */
export async function getSeasons(
  childId: string
): Promise<{ open: SeasonWithCeremony | null; history: SeasonWithCeremony[]; pending: SeasonWithCeremony | null }> {
  await requireChildAccess(childId);
  await ensureSeason(childId);
  const seasons = await loadSeasons(childId);
  return {
    open: seasons.find((s) => s.completedAt === null) ?? null,
    history: seasons.filter((s) => s.completedAt !== null),
    pending: pendingCeremony(seasons),
  };
}

/** The hero has seen the ceremony (or a family member dismissed the card). Hero or parent. */
export async function markCeremonySeen(childId: string, seasonId: string): Promise<void> {
  await requireChildAccess(childId, { write: true });
  await markSeen(childId, seasonId);
  revalidatePath("/tavern");
  revalidatePath("/loot");
  revalidatePath("/realm");
  revalidatePath("/settings");
}
