"use server";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import { ensureSeason } from "@/lib/services/season-sync";
import type { SeasonRecord } from "@/lib/utils/seasons";

function toRecord(row: typeof schema.season.$inferSelect): SeasonRecord {
  return {
    id: row.id,
    grade: row.grade,
    ordinal: row.ordinal,
    startDate: row.startDate,
    endDate: row.endDate,
    crownId: row.crownId,
  };
}

/** The open season plus completed history, newest first. A hero may read their own. */
export async function getSeasons(
  childId: string
): Promise<{ open: SeasonRecord | null; history: SeasonRecord[] }> {
  await requireChildAccess(childId);
  await ensureSeason(childId);
  const rows = await db
    .select()
    .from(schema.season)
    .where(eq(schema.season.childId, childId))
    .orderBy(desc(schema.season.ordinal));
  const openRow = rows.find((r) => r.completedAt === null);
  return {
    open: openRow ? toRecord(openRow) : null,
    history: rows.filter((r) => r.completedAt !== null).map(toRecord),
  };
}
