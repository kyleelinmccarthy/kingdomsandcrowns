"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { soundFrom, soundToStored } from "@/lib/realm3d/sound/settings";

/**
 * Saves the pause menu's sound settings. A hero writes their own, on their Realm's row, which
 * needs write access to themselves. A grown-up visiting writes THEIR own, kept per grown-up
 * (`realm_visitor_sound`): turning the music down on a visit never turns it down for the child,
 * the other parent or the tutor. That writes nothing of the child's, so read access to the child
 * is enough — a view-only member can still set their own volume. Which row is decided here from
 * who is asking, never from the client. Anything malformed is cleaned to valid settings rather
 * than refused: it is a volume slider.
 */
export async function saveRealmSound(childId: string, settings: unknown): Promise<void> {
  const stored = soundToStored(soundFrom(settings));
  const now = new Date();
  const { access } = await requireChildAccess(childId);
  if (!isChildActor(access)) {
    await db
      .insert(schema.realmVisitorSound)
      .values({ userId: access.userId, sound: stored, updatedAt: now })
      .onConflictDoUpdate({ target: schema.realmVisitorSound.userId, set: { sound: stored, updatedAt: now } });
    return;
  }
  await requireChildAccess(childId, { write: true });
  await loadRealmSettings(childId);
  await db.update(schema.realmSettings).set({ sound: stored, updatedAt: now }).where(eq(schema.realmSettings.childId, childId));
}
