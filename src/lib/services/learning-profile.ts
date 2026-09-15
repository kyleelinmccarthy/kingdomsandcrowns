import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * A hero's learning-profile row, read-only. Memoized per request the same way the
 * auth lookups in `@/lib/auth` are: one render can ask for it from the Realm bundle,
 * from a side-quest start, and from the grade-per-strand lookup, and production's
 * database is remote — without this each caller is another round trip.
 *
 * Read-only on purpose. The insert-if-missing path lives in the learning-profile
 * actions and writes; a write must never sit behind a per-request cache. A hero with
 * no row yet reads as null, which `profileFromRow` turns into the defaults.
 */
export const loadLearningProfileRow = cache(async function loadLearningProfileRow(
  childId: string,
): Promise<typeof schema.learningProfile.$inferSelect | null> {
  const rows = await db
    .select()
    .from(schema.learningProfile)
    .where(eq(schema.learningProfile.childId, childId))
    .limit(1);
  return rows[0] ?? null;
});
