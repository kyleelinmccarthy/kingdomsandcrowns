"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { keymapFrom, keymapToStored } from "@/lib/realm3d/keymap";

/**
 * Saves the Realm's keybinds. A hero writes their own, on their Realm's row, which needs write
 * access to themselves. A grown-up visiting writes THEIR own, kept per grown-up
 * (`realm_visitor_keybinds`): rebinding a key on a visit never rebinds it for the child, the other
 * parent or the tutor. That writes nothing of the child's, so read access to the child is enough —
 * a view-only member can still set their own keys. Which row is decided here from who is asking,
 * never from the client. Anything malformed is cleaned to a valid keymap rather than refused, and
 * a keymap that is all defaults is stored as null (a reset).
 */
export async function saveRealmKeybinds(childId: string, raw: unknown): Promise<void> {
  const stored = keymapToStored(keymapFrom(raw));
  const now = new Date();
  const { access } = await requireChildAccess(childId);
  if (!isChildActor(access)) {
    await db
      .insert(schema.realmVisitorKeybinds)
      .values({ userId: access.userId, keybinds: stored, updatedAt: now })
      .onConflictDoUpdate({ target: schema.realmVisitorKeybinds.userId, set: { keybinds: stored, updatedAt: now } });
    return;
  }
  await requireChildAccess(childId, { write: true });
  await loadRealmSettings(childId);
  await db.update(schema.realmSettings).set({ keybinds: stored, updatedAt: now }).where(eq(schema.realmSettings.childId, childId));
}
