/**
 * THE PUZZLE TOWER: a fixed structure on the village's one free plot, with a floor for each band
 * of logic puzzles. Pure and client-safe; it is not a `BUILDINGS` entry, so it has its own place
 * here and its own clearance test (`puzzle-tower.test.ts`).
 *
 * A floor opens when the hero earns 3 stars on a science (lock) side quest at their band, and
 * opens every floor below it with it. Floors above the hero's own band are never shown, and a
 * waiting floor never names a grade or band. Each open floor offers a bonus lock, harder by one
 * level, whose solved count is kept in `realm_world_state` under `towerRef(band)`.
 */

import type { Collider } from "@/lib/realm3d/collision";
import { CONTENT_BANDS, type ContentBand } from "@/lib/utils/content-bands";
import { bandForGrade, type Grade } from "@/lib/utils/grade-levels";
import type { SkillArea } from "@/lib/utils/skills";

/**
 * The plot is `plot` square about (`x`, `z`); the body, `body` square, stands on it. The ground
 * floor is `baseH` tall and each open floor adds a `storeyH` storey. `door` is where E climbs, on
 * the west face toward the village.
 */
export const PUZZLE_TOWER = { x: 25.5, z: 23.5, plot: 8, body: 6, baseH: 3.2, storeyH: 2.4, door: { x: 22.2, z: 23.5 } } as const;

/** One floor per band, bottom first. */
export const TOWER_FLOORS: readonly ContentBand[] = CONTENT_BANDS;

/** A floor's record in the world's state: `tower:<band>`, holding the solved count. */
export function towerRef(band: ContentBand): string {
  return `tower:${band}`;
}

/** The band a tower ref names, or null for anything else. */
export function bandOfTowerRef(ref: string | null): ContentBand | null {
  if (ref === null || !ref.startsWith("tower:")) return null;
  const band = ref.slice("tower:".length);
  return TOWER_FLOORS.find((b) => b === band) ?? null;
}

/** The logic skill a floor's lock draws from. */
export function towerSkillId(band: ContentBand): string {
  return `logic-${band}`;
}

/** What stops the hero at the Tower: one static box as tall as five storeys, on the ground at its middle. */
export function towerColliders(heightAt: (x: number, z: number) => number): Collider[] {
  const { x, z, body, baseH, storeyH } = PUZZLE_TOWER;
  const ground = heightAt(x, z);
  return [{ x, z, hw: body / 2, hd: body / 2, round: false, base: ground - 1, top: ground + baseH + TOWER_FLOORS.length * storeyH }];
}

export type TowerBands = { ownBand: ContentBand; scienceBand: ContentBand };

/**
 * Which bands matter to the Tower: the hero's own (logic has no offset, and the Tower's locks are
 * logic locks, so it is the band of their logic grade) and the band their science side quests draw
 * at now (what `deed_run.band` stores, whatever the grown-up's science offset).
 */
export function towerBands(grades: Pick<Record<SkillArea, Grade>, "logic" | "science">): TowerBands {
  return { ownBand: bandForGrade(grades.logic), scienceBand: bandForGrade(grades.science) };
}

/**
 * The Tower's visible floors, bottom first. `starred` is every band the hero has 3 stars at on a
 * science lock side quest. The top open floor is the hero's own when they have starred their
 * science band, else the highest band they have starred at or below their own, else none; every
 * floor up to it is open. The visible floors are the open ones and the hero's own, which waits.
 * A science band above the hero's own opens nothing above it, and nothing above the hero's own shows.
 */
export function towerFloors(starred: ReadonlySet<ContentBand>, bands: TowerBands): { band: ContentBand; open: boolean }[] {
  const own = TOWER_FLOORS.indexOf(bands.ownBand);
  let top = -1;
  if (starred.has(bands.scienceBand)) top = own;
  else for (const [i, b] of TOWER_FLOORS.entries()) if (i <= own && starred.has(b)) top = i;
  return TOWER_FLOORS.slice(0, own + 1)
    .map((band, i) => ({ band, open: i <= top }))
    .filter((f, i) => f.open || i === own);
}

/**
 * Where E climbs, or none: the Tower is offered only while the grown-up's "Solving logic locks" is on
 * (R-G7, PC-G6), and only when its floors are known (`towerKnown`; a failed kingdom read lists none,
 * and a board with no floor on it is no use). Otherwise the Tower still stands drawn at its earned
 * storeys, but has no E spot. Reads the canvas the frame hands the scene, so absent (no world state)
 * is off.
 */
export function towerDoorFor(canvas: { locksOn: boolean; towerKnown: boolean } | undefined): { x: number; z: number } | null {
  return canvas?.locksOn && canvas.towerKnown ? PUZZLE_TOWER.door : null;
}
