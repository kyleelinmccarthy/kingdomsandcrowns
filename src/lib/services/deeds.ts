import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { loadLearningProfileRow } from "@/lib/services/learning-profile";
import { bandForGrade, effectiveGrade, ownGradeOf, type Grade, type SubjectOffsets } from "@/lib/utils/grade-levels";
import { profileFromRow } from "@/lib/utils/learning-profile";
import { BUILDINGS, buildingProgress } from "@/lib/utils/kingdom";
import { deedsForBuilding, deedStory } from "@/lib/utils/deeds";
import type { ContentBand } from "@/lib/utils/content-bands";
import type { AgeMode } from "@/lib/utils/age-mode";
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
   * The hero's own coarse band. Nothing renders it any more — the side-quest header that
   * did was removed, because naming a child's level to them is exactly what this feature
   * promises never to do. It is kept because the next content plan retires bands wholesale
   * and will remove it then, and because `services/deeds.test.ts` still uses it to prove
   * that plan moved no hero's content.
   *
   * Deliberately a `ContentBand` and not a `Grade`: it is not an axis the engine can
   * be asked on, so a call site cannot reach for it instead of `grades[area]` and
   * silently serve every strand the hero's own year.
   */
  band: ContentBand;
  enabled: boolean;
  tone: "gentle" | "monsters";
};

// `ownGradeOf` decides which year of work a hero is handed, and the Settings panel has
// to anchor its grade gaps on the very same grade — so it lives in `utils/grade-levels`,
// which a client component can import, and is re-exported here where the engine reads.
export { ownGradeOf };

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

/** The three rows `heroLevels` composes: the hero, their learning profile, their Realm settings. */
type HeroRow = { grade: string | null; birthYear: number | null; ageMode: string };
type ProfileRow = Parameters<typeof profileFromRow>[0];
type SettingsRow = { enabled: boolean; toneMode: "gentle" | "monsters" };

/**
 * The whole composition, with the database lifted out: rows in, HeroLevels out. Pure and
 * exported because this is where a grown-up's setting either reaches the engine or quietly
 * does not — dropping `subjectOffsets` here disconnects every level anyone ever set, and
 * with the composition buried inside an async DB function no test could see it.
 */
export function heroLevels(row: HeroRow, profileRow: ProfileRow, settings: SettingsRow): HeroLevels {
  // Read through the profile util, never off the raw row: it is what turns a corrupt
  // or fractional stored offset into 0 rather than letting it reach the engine.
  const { subjectOffsets } = profileFromRow(profileRow);
  const ownGrade = ownGradeOf(row.grade, row.birthYear, row.ageMode as AgeMode);
  return {
    grades: gradesFor(ownGrade, subjectOffsets),
    band: bandForGrade(ownGrade),
    enabled: settings.enabled,
    tone: settings.toneMode,
  };
}

/** The grade a run for THIS side quest must be built at: the grade of the deed's OWN strand.
    One line, and pure, so a test can prove a reading quest never asks on the math grade. */
export function gradeForDeed(hero: Pick<HeroLevels, "grades">, deed: { area: SkillArea }): Grade {
  return hero.grades[deed.area];
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
  return heroLevels(rows[0], profileRow, settings);
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
