import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { bandForHero, type ContentBand } from "@/lib/utils/content-bands";
import { BUILDINGS, buildingProgress } from "@/lib/utils/kingdom";
import { deedsForBuilding, deedStory } from "@/lib/utils/deeds";
import type { SkillArea } from "@/lib/utils/skills";
import type { GameIconName } from "@/components/game-icon";

export type BuildingOverview = {
  id: string; label: string; description: string; icon: GameIconName;
  done: number; total: number; complete: boolean;
  deeds: { id: string; title: string; story: string; area: SkillArea }[];
};

export type HeroBand = { band: ContentBand; enabled: boolean; tone: "gentle" | "monsters" };

/** The hero's content band, Realm switch, and story tone; shared by the Deeds page and the Realm. */
export async function loadHeroBand(childId: string): Promise<HeroBand> {
  const rows = await db
    .select({ grade: schema.child.grade, ageMode: schema.child.ageMode })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  if (!rows[0]) throw new Error("Hero not found.");
  const settings = await loadRealmSettings(childId);
  return { band: bandForHero(rows[0].grade, rows[0].ageMode), enabled: settings.enabled, tone: settings.toneMode };
}

/** Every building with its progress and deeds, from raw progress rows. Pure, so the shape is testable without a database. */
export function buildKingdomOverview(progress: { buildingId: string; deedsDone: number }[], tone: "gentle" | "monsters"): BuildingOverview[] {
  const doneBy = new Map(progress.map((p) => [p.buildingId, p.deedsDone]));
  return BUILDINGS.map((b) => {
    const { done, total, complete } = buildingProgress(doneBy.get(b.id) ?? 0, b);
    return {
      id: b.id, label: b.label, description: b.description, icon: b.icon, done, total, complete,
      deeds: deedsForBuilding(b.id).map((d) => ({ id: d.id, title: d.title, story: deedStory(d, tone), area: d.area })),
    };
  });
}

export async function loadKingdomOverview(childId: string): Promise<HeroBand & { buildings: BuildingOverview[] }> {
  const hero = await loadHeroBand(childId);
  const progress = await db
    .select({ buildingId: schema.kingdomProgress.buildingId, deedsDone: schema.kingdomProgress.deedsDone })
    .from(schema.kingdomProgress)
    .where(eq(schema.kingdomProgress.childId, childId));
  return { ...hero, buildings: buildKingdomOverview(progress, hero.tone) };
}
