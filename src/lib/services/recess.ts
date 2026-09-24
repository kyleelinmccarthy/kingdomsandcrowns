import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { emptyRecessRecord, type RecessRecord } from "@/lib/realm/recess/record";
import { COURSE_ID } from "@/lib/realm3d/recess/course";

/**
 * The Ring's record for a hero (`realm_recess_record`): one row, made on first read. Callers have
 * already decided who may read or write; this only reads and writes what it is given.
 *
 * Insert-if-missing then select, so two first reads at once still make one row (the unique index
 * on `child_id` turns the second insert into nothing).
 */
export async function loadRecessRecord(childId: string): Promise<RecessRecord> {
  const now = new Date();
  await db
    .insert(schema.realmRecessRecord)
    .values({ id: nanoid(), childId, courseId: COURSE_ID, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: schema.realmRecessRecord.childId });
  const rows = await db.select().from(schema.realmRecessRecord).where(eq(schema.realmRecessRecord.childId, childId)).limit(1);
  const r = rows[0];
  if (!r) return emptyRecessRecord(COURSE_ID);
  return {
    totalGleams: r.totalGleams,
    laps: r.laps,
    bestLapMs: r.bestLapMs,
    bestMountedLapMs: r.bestMountedLapMs,
    lastLapAt: r.lastLapAt,
    courseId: r.courseId,
  };
}

/** Writes a merged record back over the hero's row (which `loadRecessRecord` has made). */
export async function saveRecessRecord(childId: string, record: RecessRecord): Promise<void> {
  await db
    .update(schema.realmRecessRecord)
    .set({
      totalGleams: record.totalGleams,
      laps: record.laps,
      bestLapMs: record.bestLapMs,
      bestMountedLapMs: record.bestMountedLapMs,
      lastLapAt: record.lastLapAt,
      courseId: record.courseId,
      updatedAt: new Date(),
    })
    .where(eq(schema.realmRecessRecord.childId, childId));
}
