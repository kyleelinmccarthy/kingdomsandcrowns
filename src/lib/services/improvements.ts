import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { materialBalance, type MaterialId } from "@/lib/realm/materials";
import { BUILDINGS, buildingProgress } from "@/lib/utils/kingdom";
import { loadMaterialLedger } from "./realm-materials";

/**
 * What `planState` reads for a hero, from the database: the highest level built of each plan, the
 * core buildings that stand (a building is raised once its quests are done, or once it was ever
 * marked complete), and the materials in hand.
 */
export async function loadPlanInput(childId: string): Promise<{
  built: Record<string, number>;
  raised: Set<string>;
  balance: Record<MaterialId, number>;
}> {
  const [levels, progress, ledger] = await Promise.all([
    db
      .select({ improvementId: schema.realmImprovement.improvementId, level: schema.realmImprovement.level })
      .from(schema.realmImprovement)
      .where(eq(schema.realmImprovement.childId, childId)),
    db
      .select({ buildingId: schema.kingdomProgress.buildingId, deedsDone: schema.kingdomProgress.deedsDone, completedAt: schema.kingdomProgress.completedAt })
      .from(schema.kingdomProgress)
      .where(eq(schema.kingdomProgress.childId, childId)),
    loadMaterialLedger(childId),
  ]);
  const built: Record<string, number> = {};
  for (const r of levels) built[r.improvementId] = Math.max(built[r.improvementId] ?? 0, r.level);
  const raised = new Set<string>();
  for (const row of progress) {
    const building = BUILDINGS.find((b) => b.id === row.buildingId);
    if (building && (row.completedAt !== null || buildingProgress(row.deedsDone, building).complete)) raised.add(building.id);
  }
  return { built, raised, balance: materialBalance(ledger) };
}
