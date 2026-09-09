"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { validateRealmSettingsPatch, type RealmSettings } from "@/lib/utils/realm-settings";

/** A hero may read their own settings; the Realm page will need them. */
export async function getRealmSettings(childId: string): Promise<RealmSettings> {
  await requireChildAccess(childId);
  return loadRealmSettings(childId);
}

export async function updateRealmSettings(childId: string, patch: Partial<RealmSettings>): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can change Realm settings.");
  const clean = validateRealmSettingsPatch(patch);
  await loadRealmSettings(childId);
  await db
    .update(schema.realmSettings)
    .set({ ...clean, updatedAt: new Date() })
    .where(eq(schema.realmSettings.childId, childId));
  revalidatePath("/settings");
}

/** The hero has seen the how-to-play card (or a grown-up closed it for them). Hero or parent. */
export async function markRealmHelpSeen(childId: string): Promise<void> {
  await requireChildAccess(childId, { write: true });
  await loadRealmSettings(childId);
  const now = new Date();
  await db.update(schema.realmSettings).set({ helpSeenAt: now, updatedAt: now }).where(eq(schema.realmSettings.childId, childId));
}

/** Shows the card again on the hero's next visit. Grown-ups only. */
export async function resetRealmHelp(childId: string): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can change Realm settings.");
  await loadRealmSettings(childId);
  await db.update(schema.realmSettings).set({ helpSeenAt: null, updatedAt: new Date() }).where(eq(schema.realmSettings.childId, childId));
  revalidatePath("/settings");
}
