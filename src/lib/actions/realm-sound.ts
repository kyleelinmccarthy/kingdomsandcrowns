"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { soundFrom, soundToStored } from "@/lib/realm3d/sound/settings";

/**
 * Saves the pause menu's sound settings. A hero writes their own; a grown-up visiting writes
 * THEIR own (`visitor_sound`), so turning the music down on a visit never turns it down for the
 * child. Which column is decided here from who is asking, never from the client. Anything
 * malformed is cleaned to valid settings rather than refused: it is a volume slider.
 */
export async function saveRealmSound(childId: string, settings: unknown): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  const stored = soundToStored(soundFrom(settings));
  await loadRealmSettings(childId);
  const now = new Date();
  await db
    .update(schema.realmSettings)
    .set(isChildActor(access) ? { sound: stored, updatedAt: now } : { visitorSound: stored, updatedAt: now })
    .where(eq(schema.realmSettings.childId, childId));
}
