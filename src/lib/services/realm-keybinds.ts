import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { keymapFrom, type Keymap } from "@/lib/realm3d/keymap";

/**
 * The keybinds for whoever is looking: the hero's own (`visitorUserId` null), or a visiting
 * grown-up's own, kept per grown-up (`realm_visitor_keybinds`). No row, or a null one, is the
 * defaults — the Realm's other loaders create the hero's row, and this read never needs to.
 * `keymapFrom` cleans whatever is stored.
 */
export async function loadRealmKeybinds(childId: string, visitorUserId: string | null): Promise<Keymap> {
  if (visitorUserId !== null) {
    const rows = await db
      .select({ keybinds: schema.realmVisitorKeybinds.keybinds })
      .from(schema.realmVisitorKeybinds)
      .where(eq(schema.realmVisitorKeybinds.userId, visitorUserId))
      .limit(1);
    return keymapFrom(rows[0]?.keybinds ?? null);
  }
  const rows = await db
    .select({ keybinds: schema.realmSettings.keybinds })
    .from(schema.realmSettings)
    .where(eq(schema.realmSettings.childId, childId))
    .limit(1);
  return keymapFrom(rows[0]?.keybinds ?? null);
}
