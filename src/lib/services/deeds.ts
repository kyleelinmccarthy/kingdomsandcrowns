import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { loadRealmSettings } from "@/lib/services/realm-play";
import { loadLearningProfileRow } from "@/lib/services/learning-profile";
import { bandForGrade, effectiveGrade, ownGradeOf, type Grade, type SubjectOffsets } from "@/lib/utils/grade-levels";
import { profileFromRow } from "@/lib/utils/learning-profile";
import { BUILDINGS, buildingProgress, type Building, type SiteTally } from "@/lib/utils/kingdom";
import { siteStage } from "@/lib/realm3d/site-stages";
import { deedsForBuilding, deedStory } from "@/lib/utils/deeds";
import type { ContentBand } from "@/lib/utils/content-bands";
import type { AgeMode } from "@/lib/utils/age-mode";
import type { SkillArea } from "@/lib/utils/skills";
import { MAX_STARS, countsTowardBuilding, type Stars } from "@/lib/utils/deed-scoring";
import type { GameIconName } from "@/components/game-icon";

/** What a hero has earned on one side quest: its best stars, and whether a Crown Challenge was ever flawless. */
export type DeedBest = { deedId: string; bestStars: Stars; crowned: boolean };

export type BuildingOverview = {
  id: string; label: string; description: string; icon: GameIconName;
  done: number; total: number; complete: boolean;
  /**
   * Who raised a complete building: the name written when it rose, else the hero's live name
   * (raised before names were kept); null while it is still rising.
   */
  raisedBy: string | null;
  /** When it was raised, in epoch seconds (`kingdom_progress.completed_at`); null until then. */
  raisedAt: number | null;
  /** Best stars summed over the building's side quests, out of `maxStars`. */
  stars: number; maxStars: number;
  deeds: { id: string; title: string; story: string; area: SkillArea; bestStars: Stars; crowned: boolean }[];
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

/** A building's stars, summed over its side quests' best. Pure: the overview and a finished run both read it. */
export function buildingStars(buildingId: string, best: readonly Pick<DeedBest, "deedId" | "bestStars">[]): { stars: number; maxStars: number } {
  const bestBy = new Map(best.map((b) => [b.deedId, b.bestStars]));
  const deeds = deedsForBuilding(buildingId);
  return { stars: deeds.reduce((sum, d) => sum + (bestBy.get(d.id) ?? 0), 0), maxStars: deeds.length * MAX_STARS };
}

/** One `kingdom_progress` row, as the overview reads it. */
export type ProgressRow = { buildingId: string; deedsDone: number; completedAt: Date | null; raisedByName: string | null };

/**
 * Where one site stands (D13.2–D13.4): the building's CURRENT stories finished with a star, once
 * each (a story no longer told stops counting); every run ever finished there; and whether it was
 * ever raised. Pure: the overview, the bench's drawing, a finished run and the plans board all read it.
 */
export function siteTally(
  buildingId: string,
  row: { deedsDone: number; completedAt: Date | null } | undefined,
  best: readonly Pick<DeedBest, "deedId" | "bestStars">[],
): SiteTally {
  const bestBy = new Map(best.map((b) => [b.deedId, b.bestStars]));
  const distinctDone = deedsForBuilding(buildingId).filter((d) => countsTowardBuilding(bestBy.get(d.id) ?? 0)).length;
  return { distinctDone, runsDone: row?.deedsDone ?? 0, raised: (row?.completedAt ?? null) !== null };
}

/**
 * Every building with its progress and deeds, from raw progress rows. Pure, so the shape is testable
 * without a database. `heroName` is the live name a raised building falls back to when it holds no
 * snapshot of its own (raised before names were kept, D13.9).
 */
export function buildKingdomOverview(
  progress: readonly ProgressRow[],
  tone: "gentle" | "monsters",
  best: readonly DeedBest[] = [],
  heroName: string | null = null,
): BuildingOverview[] {
  const rowBy = new Map(progress.map((p) => [p.buildingId, p]));
  const bestBy = new Map(best.map((b) => [b.deedId, b]));
  return BUILDINGS.map((b) => {
    const row = rowBy.get(b.id);
    const { done, total, complete } = buildingProgress(siteTally(b.id, row, best), b);
    return {
      id: b.id, label: b.label, description: b.description, icon: b.icon, done, total, complete,
      raisedBy: complete ? (row?.raisedByName ?? heroName) : null,
      raisedAt: row?.completedAt ? Math.floor(row.completedAt.getTime() / 1000) : null,
      ...buildingStars(b.id, best),
      deeds: deedsForBuilding(b.id).map((d) => ({
        id: d.id, title: d.title, story: deedStory(d, tone), area: d.area,
        bestStars: bestBy.get(d.id)?.bestStars ?? 0, crowned: bestBy.get(d.id)?.crowned ?? false,
      })),
    };
  });
}

/**
 * The hero's best stars and crowns per side quest, in one grouped query. Stars count finished
 * side quests only, never a Crown Challenge; a crown is a flawless finished challenge.
 */
export async function loadDeedBest(childId: string): Promise<DeedBest[]> {
  const run = schema.deedRun;
  const rows = await db
    .select({
      deedId: run.deedId,
      bestStars: sql<number | null>`max(${run.stars}) filter (where ${run.kind} = 'deed' and ${run.completedAt} is not null)`,
      // SQLite has no bool_or: the max of a 0/1 condition is 1 when any row meets it.
      crowned: sql<number | null>`max(${run.kind} = 'challenge' and ${run.flawless} and ${run.completedAt} is not null)`,
    })
    .from(run)
    // A run owned by no side quest (a review) has no best to keep.
    .where(and(eq(run.childId, childId), isNotNull(run.deedId)))
    .groupBy(run.deedId);
  return rows.map((r) => ({ deedId: r.deedId as string, bestStars: (r.bestStars ?? 0) as Stars, crowned: Number(r.crowned) === 1 }));
}

/** Where a building's site stands, for the bench's drawing: its stage (`siteStage`, as the world draws it) and whether it is finished. */
export async function loadSiteState(childId: string, building: Building): Promise<{ stage: number; complete: boolean }> {
  const [rows, best] = await Promise.all([
    db
      .select({ deedsDone: schema.kingdomProgress.deedsDone, completedAt: schema.kingdomProgress.completedAt })
      .from(schema.kingdomProgress)
      .where(and(eq(schema.kingdomProgress.childId, childId), eq(schema.kingdomProgress.buildingId, building.id)))
      .limit(1),
    loadDeedBest(childId),
  ]);
  const { done, total, complete } = buildingProgress(siteTally(building.id, rows[0], best), building);
  return { stage: siteStage(done, total), complete };
}

/** The hero's live name, for a raised building with no name of its own; a failed read is no name, never a failed overview. */
async function loadHeroName(childId: string): Promise<string | null> {
  try {
    const [row] = await db.select({ displayName: schema.child.displayName }).from(schema.child).where(eq(schema.child.id, childId)).limit(1);
    return row?.displayName ?? null;
  } catch (err) {
    console.error("Hero name failed to load", err);
    return null;
  }
}

export async function loadKingdomOverview(childId: string): Promise<HeroLevels & { buildings: BuildingOverview[] }> {
  const [hero, progress, best, heroName] = await Promise.all([
    loadHeroLevels(childId),
    db
      .select({
        buildingId: schema.kingdomProgress.buildingId, deedsDone: schema.kingdomProgress.deedsDone,
        completedAt: schema.kingdomProgress.completedAt, raisedByName: schema.kingdomProgress.raisedByName,
      })
      .from(schema.kingdomProgress)
      .where(eq(schema.kingdomProgress.childId, childId)),
    loadDeedBest(childId),
    loadHeroName(childId),
  ]);
  return { ...hero, buildings: buildKingdomOverview(progress, hero.tone, best, heroName) };
}
