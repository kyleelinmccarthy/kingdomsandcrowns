import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { BUILDINGS } from "@/lib/utils/kingdom";

/**
 * What the world still owes the hero about their kingdom (D13.6): the buildings that stand but have
 * not yet been shown rising, and whether the retro-completion migration is why (so the toast can say
 * their side quests already finished it). Callers have authorized the child.
 */
export async function loadRises(childId: string): Promise<{ unannounced: string[]; regraded: boolean }> {
  const [rows, flags] = await Promise.all([
    db
      .select({ buildingId: schema.kingdomProgress.buildingId })
      .from(schema.kingdomProgress)
      .where(and(
        eq(schema.kingdomProgress.childId, childId),
        isNotNull(schema.kingdomProgress.completedAt),
        isNull(schema.kingdomProgress.announcedAt),
      )),
    db
      .select({ regradedAt: schema.realmSettings.regradedAt })
      .from(schema.realmSettings)
      .where(eq(schema.realmSettings.childId, childId))
      .limit(1),
  ]);
  const waiting = new Set(rows.map((r) => r.buildingId));
  // The kingdom's own order, and only buildings the catalog still has (the world draws no others).
  return { unannounced: BUILDINGS.filter((b) => waiting.has(b.id)).map((b) => b.id), regraded: flags[0]?.regradedAt != null };
}

/**
 * Stamps `announced_at` (the server's clock) on the hero's own raised-and-unannounced rows among `buildingIds`:
 * a row still rising, already announced (its first time stands) or another hero's is left alone.
 * The caller has authorized the hero and checked the ids.
 */
export async function announceBuildings(childId: string, buildingIds: string[]): Promise<void> {
  if (buildingIds.length === 0) return;
  await db
    .update(schema.kingdomProgress)
    .set({ announcedAt: new Date() })
    .where(and(
      eq(schema.kingdomProgress.childId, childId),
      inArray(schema.kingdomProgress.buildingId, buildingIds),
      isNotNull(schema.kingdomProgress.completedAt),
      isNull(schema.kingdomProgress.announcedAt),
    ));
}
