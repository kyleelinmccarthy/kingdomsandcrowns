import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { soundFrom, type SoundSettings } from "@/lib/realm3d/sound/settings";

/**
 * The sound settings for whoever is looking: the hero's own when the hero is, a visiting
 * grown-up's own when a grown-up is. No row yet is the defaults — the Realm's other loaders
 * create the row, and this read never needs to.
 */
export async function loadRealmSound(childId: string, visitor: boolean): Promise<SoundSettings> {
  const rows = await db
    .select({ sound: schema.realmSettings.sound, visitorSound: schema.realmSettings.visitorSound })
    .from(schema.realmSettings)
    .where(eq(schema.realmSettings.childId, childId))
    .limit(1);
  const row = rows[0];
  return soundFrom(visitor ? row?.visitorSound ?? null : row?.sound ?? null);
}
