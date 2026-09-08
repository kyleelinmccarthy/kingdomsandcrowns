import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { seasonsToMark, type SeasonWithCeremony } from "@/lib/utils/seasons";

/**
 * Season rows for the client and the ceremony bookkeeping. Plain module, not
 * a "use server" file: callers have already authorized the child.
 */

export function toSeasonWithCeremony(row: typeof schema.season.$inferSelect): SeasonWithCeremony {
  return {
    id: row.id,
    grade: row.grade,
    ordinal: row.ordinal,
    startDate: row.startDate,
    endDate: row.endDate,
    crownId: row.crownId,
    completedAt: row.completedAt?.toISOString() ?? null,
    ceremonySeenAt: row.ceremonySeenAt?.toISOString() ?? null,
  };
}

/** Every season the hero has, newest ordinal first. */
export async function loadSeasons(childId: string): Promise<SeasonWithCeremony[]> {
  const rows = await db.select().from(schema.season).where(eq(schema.season.childId, childId)).orderBy(desc(schema.season.ordinal));
  return rows.map(toSeasonWithCeremony);
}

/**
 * Records that the crown ceremony for `seasonId` has been seen, along with
 * any older completed season still unmarked. Idempotent: marking a season
 * that is already marked changes nothing. Throws when the season is not
 * this hero's.
 */
export async function markCeremonySeen(childId: string, seasonId: string): Promise<void> {
  const seasons = await loadSeasons(childId);
  if (!seasons.some((s) => s.id === seasonId)) throw new Error("That season is not yours.");
  const ids = seasonsToMark(seasons, seasonId);
  if (ids.length === 0) return;
  const now = new Date();
  await db.update(schema.season).set({ ceremonySeenAt: now, updatedAt: now }).where(inArray(schema.season.id, ids));
}
