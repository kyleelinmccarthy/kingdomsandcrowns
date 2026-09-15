import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { loadLearningProfileRow } from "@/lib/services/learning-profile";
import { bandForGrade, effectiveGrade, estimateGrade, GRADES, type Grade, type SubjectOffsets } from "@/lib/utils/grade-levels";
import { profileFromRow } from "@/lib/utils/learning-profile";
import type { AgeMode } from "@/lib/utils/age-mode";
import { BUILDINGS, buildingProgress } from "@/lib/utils/kingdom";
import { deedsForBuilding, deedStory } from "@/lib/utils/deeds";
import type { ContentBand } from "@/lib/utils/content-bands";
import type { SkillArea } from "@/lib/utils/skills";
import type { GameIconName } from "@/components/game-icon";

export type BuildingOverview = {
  id: string; label: string; description: string; icon: GameIconName;
  done: number; total: number; complete: boolean;
  deeds: { id: string; title: string; story: string; area: SkillArea }[];
};

export type HeroLevels = {
  /**
   * The grade each strand is actually taught at: the hero's own grade moved by that
   * strand's gap. This is the only thing the engine may ask on.
   */
  grades: Record<SkillArea, Grade>;
  /**
   * The hero's own coarse band, for the one page header that needs a single label.
   * Deliberately a `ContentBand` and not a `Grade`: it is not an axis the engine can
   * be asked on, so a call site cannot reach for it instead of `grades[area]` and
   * silently serve every strand the hero's own year.
   */
  band: ContentBand;
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
  const modeGrade = AGE_MODE_GRADE[ageMode];
  // `ageMode` is stored once at sign-up and never recomputed as a child ages, so an
  // age estimate can disagree with it. The estimate is used only where it refines the
  // band the hero is already in; outside it, the mode wins. Otherwise a deploy alone
  // could hand a nine-year-old grades 4-5 work, and this app's rule is that only a
  // grown-up setting a real grade moves a child up.
  const estimated = estimateGrade(birthYear, today);
  if (estimated !== null && bandForGrade(estimated) === bandForGrade(modeGrade)) return estimated;
  return modeGrade;
}

/**
 * Each strand's taught grade: the hero's own grade moved by THAT strand's own gap.
 * Written out one strand per line rather than looped, so a cross-wired strand is a
 * visible edit; pure and exported so the mapping is pinned by tests, because it is
 * the step where a grown-up's setting either reaches the engine or quietly does not.
 */
export function gradesFor(ownGrade: Grade, offsets: SubjectOffsets): Record<SkillArea, Grade> {
  return {
    math: effectiveGrade(ownGrade, offsets.math),
    reading: effectiveGrade(ownGrade, offsets.reading),
    language: effectiveGrade(ownGrade, offsets.language),
    science: effectiveGrade(ownGrade, offsets.science),
  };
}

/** The hero's grade per strand, Realm switch, and story tone; shared by the Deeds page and the Realm. */
export async function loadHeroLevels(childId: string): Promise<HeroLevels> {
  // Nothing here depends on anything else here, so it is one parallel round.
  const [rows, settings, profileRow] = await Promise.all([
    db
      .select({ grade: schema.child.grade, birthYear: schema.child.birthYear, ageMode: schema.child.ageMode })
      .from(schema.child)
      .where(eq(schema.child.id, childId))
      .limit(1),
    loadRealmSettings(childId),
    loadLearningProfileRow(childId),
  ]);
  if (!rows[0]) throw new Error("Hero not found.");
  // Read through the profile util, never off the raw row: it is what turns a corrupt
  // or fractional stored offset into 0 rather than letting it reach the engine.
  const { subjectOffsets } = profileFromRow(profileRow);
  const ownGrade = ownGradeOf(rows[0].grade, rows[0].birthYear, rows[0].ageMode);
  return {
    grades: gradesFor(ownGrade, subjectOffsets),
    band: bandForGrade(ownGrade),
    enabled: settings.enabled,
    tone: settings.toneMode,
  };
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
