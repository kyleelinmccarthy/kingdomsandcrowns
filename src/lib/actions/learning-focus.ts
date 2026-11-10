"use server";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { loadHeroLevels } from "@/lib/services/deeds";
import { FOCUS_MAX, focusWindow } from "@/lib/utils/focus";

/**
 * A grown-up replaces a hero's focus skills (up to three). Never the hero themselves: what they
 * are asked more of is a grown-up's call, like their level. The whole set is judged before
 * anything is written, and is then swapped in one `db.batch` (a delete and the inserts in a
 * single libsql transaction), so a refusal or a failure part-way leaves the old set whole.
 */
export async function setFocusSkills(childId: string, skillIds: string[]): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can choose focus skills.");

  if (skillIds.length > FOCUS_MAX) throw new Error("Pick up to three skills.");
  const ids = [...new Set(skillIds)];
  const { grades } = await loadHeroLevels(childId);
  const reachable = new Set(focusWindow(grades).map((s) => s.id));
  if (!ids.every((id) => reachable.has(id))) throw new Error("That skill isn't one this hero can focus on.");

  const now = new Date();
  const del = db.delete(schema.learningFocus).where(eq(schema.learningFocus.childId, childId));
  if (ids.length === 0) {
    await del;
  } else {
    await db.batch([
      del,
      db.insert(schema.learningFocus).values(ids.map((skillId) => ({ id: nanoid(), childId, skillId, createdAt: now }))),
    ]);
  }
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}
