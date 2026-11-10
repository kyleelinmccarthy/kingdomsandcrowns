import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { loadHeroLevels } from "@/lib/services/deeds";
import { focusWindow, validFocus } from "@/lib/utils/focus";
import type { Grade } from "@/lib/utils/grade-levels";
import type { SkillArea } from "@/lib/utils/skills";

/**
 * The skills a grown-up asked this hero to focus on, as they stand now. Memoized per request like
 * the other learning reads: a side quest and a riddle stone can both ask in one render, and
 * production's database is remote.
 *
 * Only picks still inside the hero's window come back, judged against their grades today. A
 * promotion therefore sets a pick aside without deleting it, and a settings page can offer the
 * grown-up a fresh choice. No auth here: callers are the hero's own server-side paths; the write
 * is the action's.
 *
 * A caller that already holds the hero's grades (from its own `loadHeroLevels`) passes them, and
 * they are not read again; without them they are read here.
 */
export const loadFocusSkillIds = cache(async function loadFocusSkillIds(
  childId: string,
  grades?: Partial<Record<SkillArea, Grade>>,
): Promise<string[]> {
  const [rows, held] = await Promise.all([
    db
      .select({ skillId: schema.learningFocus.skillId })
      .from(schema.learningFocus)
      .where(eq(schema.learningFocus.childId, childId))
      .orderBy(schema.learningFocus.createdAt, schema.learningFocus.skillId),
    grades ?? loadHeroLevels(childId).then((levels) => levels.grades),
  ]);
  return validFocus(
    rows.map((r) => r.skillId),
    focusWindow(held),
  );
});
