import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { soundFrom, type SoundSettings } from "@/lib/realm3d/sound/settings";

/**
 * The sound settings for whoever is looking: the hero's own (`visitorUserId` null), or a visiting
 * grown-up's own, kept per grown-up (`realm_visitor_sound`). No row yet is the defaults — the
 * Realm's other loaders create the hero's row, and this read never needs to.
 */
export async function loadRealmSound(childId: string, visitorUserId: string | null): Promise<SoundSettings> {
  if (visitorUserId !== null) {
    const rows = await db
      .select({ sound: schema.realmVisitorSound.sound })
      .from(schema.realmVisitorSound)
      .where(eq(schema.realmVisitorSound.userId, visitorUserId))
      .limit(1);
    return soundFrom(rows[0]?.sound ?? null);
  }
  const rows = await db
    .select({ sound: schema.realmSettings.sound })
    .from(schema.realmSettings)
    .where(eq(schema.realmSettings.childId, childId))
    .limit(1);
  return soundFrom(rows[0]?.sound ?? null);
}
