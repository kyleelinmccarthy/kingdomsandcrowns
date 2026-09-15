import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { effectiveGrade, estimateGrade, GRADES, type Grade } from "@/lib/utils/grade-levels";
import { profileFromRow } from "@/lib/utils/learning-profile";
import { BUILDINGS, buildingProgress } from "@/lib/utils/kingdom";
import { deedsForBuilding, deedStory } from "@/lib/utils/deeds";
import type { SkillArea } from "@/lib/utils/skills";
import type { GameIconName } from "@/components/game-icon";

export type BuildingOverview = {
  id: string; label: string; description: string; icon: GameIconName;
  done: number; total: number; complete: boolean;
  deeds: { id: string; title: string; story: string; area: SkillArea }[];
};

export type HeroLevels = {
  /** The hero's own grade, before any subject gap. */
  ownGrade: Grade;
  /** The grade each strand is actually taught at: the hero's grade plus that strand's gap. */
  grades: Record<SkillArea, Grade>;
  enabled: boolean;
  tone: "gentle" | "monsters";
};

/** The hero's own grade: what a grown-up set, else their age, else the middle of the ladder. */
function ownGradeOf(grade: string | null, birthYear: number | null): Grade {
  if (grade !== null && (GRADES as readonly string[]).includes(grade)) return grade as Grade;
  return estimateGrade(birthYear, new Date()) ?? "3";
}

/** The hero's grade per strand, Realm switch, and story tone; shared by the Deeds page and the Realm. */
export async function loadHeroLevels(childId: string): Promise<HeroLevels> {
  const rows = await db
    .select({ grade: schema.child.grade, birthYear: schema.child.birthYear })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  if (!rows[0]) throw new Error("Hero not found.");
  const [settings, profileRows] = await Promise.all([
    loadRealmSettings(childId),
    db.select().from(schema.learningProfile).where(eq(schema.learningProfile.childId, childId)).limit(1),
  ]);
  // Read through the profile util, never off the raw row: it is what turns a corrupt
  // or fractional stored offset into 0 rather than letting it reach the engine.
  const { subjectOffsets } = profileFromRow(profileRows[0] ?? null);
  const ownGrade = ownGradeOf(rows[0].grade, rows[0].birthYear);
  const grades = {
    math: effectiveGrade(ownGrade, subjectOffsets.math),
    reading: effectiveGrade(ownGrade, subjectOffsets.reading),
    language: effectiveGrade(ownGrade, subjectOffsets.language),
    science: effectiveGrade(ownGrade, subjectOffsets.science),
  };
  return { ownGrade, grades, enabled: settings.enabled, tone: settings.toneMode };
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

export async function loadKingdomOverview(childId: string): Promise<HeroLevels & { buildings: BuildingOverview[] }> {
  const hero = await loadHeroLevels(childId);
  const progress = await db
    .select({ buildingId: schema.kingdomProgress.buildingId, deedsDone: schema.kingdomProgress.deedsDone })
    .from(schema.kingdomProgress)
    .where(eq(schema.kingdomProgress.childId, childId));
  return { ...hero, buildings: buildKingdomOverview(progress, hero.tone) };
}
