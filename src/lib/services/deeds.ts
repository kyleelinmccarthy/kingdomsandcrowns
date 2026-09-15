import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { loadLearningProfileRow } from "@/lib/services/learning-profile";
import { effectiveGrade, estimateGrade, GRADES, type Grade } from "@/lib/utils/grade-levels";
import { profileFromRow } from "@/lib/utils/learning-profile";
import type { AgeMode } from "@/lib/utils/age-mode";
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

/**
 * The grade an age mode stands for, for a hero who has neither a grade nor a birth
 * year. Each is the grade `bandForGrade` maps back onto the band `bandForHero` gave
 * that mode, so such a hero keeps exactly the content they already had rather than
 * being silently demoted.
 */
const AGE_MODE_GRADE: Record<AgeMode, Grade> = { elementary: "3", middle: "6", high: "9" };

/**
 * The hero's own grade, before any subject gap: what a grown-up set, else their age,
 * else the grade their age mode stands for. `child.grade` is a plain nullable text
 * column, so a value off the ladder is not trusted — it falls through like no grade.
 * Exported because it decides which year of work a child is handed.
 */
export function ownGradeOf(
  grade: string | null,
  birthYear: number | null,
  ageMode: AgeMode,
  today: Date = new Date(),
): Grade {
  if (grade !== null && (GRADES as readonly string[]).includes(grade)) return grade as Grade;
  return estimateGrade(birthYear, today) ?? AGE_MODE_GRADE[ageMode];
}

/** The hero's grade per strand, Realm switch, and story tone; shared by the Deeds page and the Realm. */
export async function loadHeroLevels(childId: string): Promise<HeroLevels> {
  const rows = await db
    .select({ grade: schema.child.grade, birthYear: schema.child.birthYear, ageMode: schema.child.ageMode })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  if (!rows[0]) throw new Error("Hero not found.");
  const [settings, profileRow] = await Promise.all([
    loadRealmSettings(childId),
    loadLearningProfileRow(childId),
  ]);
  // Read through the profile util, never off the raw row: it is what turns a corrupt
  // or fractional stored offset into 0 rather than letting it reach the engine.
  const { subjectOffsets } = profileFromRow(profileRow);
  const ownGrade = ownGradeOf(rows[0].grade, rows[0].birthYear, rows[0].ageMode);
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
