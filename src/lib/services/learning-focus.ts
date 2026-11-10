import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { loadHeroLevels } from "@/lib/services/deeds";
import { focusWindow, validFocus } from "@/lib/utils/focus";

/**
 * The skills a grown-up asked this hero to focus on, as they stand now. Memoized per request like
 * the other learning reads: a side quest and a riddle stone can both ask in one render, and
 * production's database is remote.
 *
 * Only picks still inside the hero's window come back, judged against their grades today. A
 * promotion therefore sets a pick aside without deleting it, and a settings page can offer the
 * grown-up a fresh choice. No auth here: callers are the hero's own server-side paths; the write
 * is the action's.
 */
export const loadFocusSkillIds = cache(async function loadFocusSkillIds(childId: string): Promise<string[]> {
  const [rows, levels] = await Promise.all([
    db
      .select({ skillId: schema.learningFocus.skillId })
      .from(schema.learningFocus)
      .where(eq(schema.learningFocus.childId, childId))
      .orderBy(schema.learningFocus.createdAt, schema.learningFocus.skillId),
    loadHeroLevels(childId),
  ]);
  return validFocus(
    rows.map((r) => r.skillId),
    focusWindow(levels.grades),
  );
});
