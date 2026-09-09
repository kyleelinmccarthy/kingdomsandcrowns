"use server";

import { nanoid } from "nanoid";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sanitizeName } from "@/lib/utils/sanitize";
import { requireFamilyAccess, requireFamilyReadAccess } from "@/lib/auth/access";
import { recomputeFamilyStreaks } from "@/lib/services/streaks";
import {
  MAX_BREAK_DAYS,
  daysInRange,
  findOverlappingBreaks,
  isIsoDate,
} from "@/lib/utils/school-calendar";

export async function getSchoolBreaks(familyId: string) {
  // Read-only: also viewable by a hero in their own chronicle (Long Rest view).
  await requireFamilyReadAccess(familyId);
  return db
    .select()
    .from(schema.schoolBreak)
    .where(eq(schema.schoolBreak.familyId, familyId))
    .orderBy(asc(schema.schoolBreak.startDate));
}

/**
 * Validates a break's fields and rejects one that repeats a span the family
 * already has. Overlapping days are allowed in general — a snow day inside a
 * longer break is harmless, since a day off twice over is still one day off —
 * but an exact repeat is always a double-tap, not an intent.
 */
async function validateBreak(
  familyId: string,
  name: string,
  startDate: string,
  endDate: string,
  ignoreId?: string
): Promise<string> {
  const cleanName = sanitizeName(name);
  if (!cleanName) throw new Error("Break name is required");
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new Error("Pick a real start and end date.");
  }
  if (startDate > endDate) throw new Error("Start date must be before end date");
  if (daysInRange(startDate, endDate) > MAX_BREAK_DAYS) {
    throw new Error(`A break can cover at most ${MAX_BREAK_DAYS} days.`);
  }

  const existing = await db
    .select({
      id: schema.schoolBreak.id,
      name: schema.schoolBreak.name,
      startDate: schema.schoolBreak.startDate,
      endDate: schema.schoolBreak.endDate,
    })
    .from(schema.schoolBreak)
    .where(eq(schema.schoolBreak.familyId, familyId));

  const duplicate = findOverlappingBreaks(startDate, endDate, existing, ignoreId).find(
    (b) => b.startDate === startDate && b.endDate === endDate
  );
  if (duplicate) {
    throw new Error(`Those dates are already off as "${duplicate.name}".`);
  }

  return cleanName;
}

export async function createSchoolBreak(
  familyId: string,
  name: string,
  startDate: string,
  endDate: string
) {
  await requireFamilyAccess({ familyId, write: true });
  const cleanName = await validateBreak(familyId, name, startDate, endDate);

  const id = nanoid();
  const now = new Date();
  await db.insert(schema.schoolBreak).values({
    id,
    familyId,
    name: cleanName,
    startDate,
    endDate,
    createdAt: now,
    updatedAt: now,
  });
  // A day that just became a day off must stop counting against streaks now,
  // not at whatever the hero's next logged activity turns out to be.
  await recomputeFamilyStreaks(familyId);
  return { id };
}

/** Adds several breaks at once, e.g. a preset holiday calendar or a batch of manual entries. Each row passes the same checks as a single break. */
export async function bulkCreateSchoolBreaks(
  familyId: string,
  breaks: { name: string; startDate: string; endDate: string }[]
) {
  await requireFamilyAccess({ familyId, write: true });
  if (breaks.length === 0) return { ids: [] };

  const now = new Date();
  const rows = [];
  for (const b of breaks) {
    const cleanName = await validateBreak(familyId, b.name, b.startDate, b.endDate);
    rows.push({
      id: nanoid(),
      familyId,
      name: cleanName,
      startDate: b.startDate,
      endDate: b.endDate,
      createdAt: now,
      updatedAt: now,
    });
  }

  await db.insert(schema.schoolBreak).values(rows);
  await recomputeFamilyStreaks(familyId);
  return { ids: rows.map((r) => r.id) };
}

export async function updateSchoolBreak(
  breakId: string,
  name: string,
  startDate: string,
  endDate: string
) {
  const familyId = await requireBreakWriteAccess(breakId);
  const cleanName = await validateBreak(familyId, name, startDate, endDate, breakId);

  await db
    .update(schema.schoolBreak)
    .set({ name: cleanName, startDate, endDate, updatedAt: new Date() })
    .where(eq(schema.schoolBreak.id, breakId));
  await recomputeFamilyStreaks(familyId);
}

export async function deleteSchoolBreak(breakId: string) {
  const familyId = await requireBreakWriteAccess(breakId);

  await db
    .delete(schema.schoolBreak)
    .where(eq(schema.schoolBreak.id, breakId));
  // Removing a break can only shorten a streak that the break was holding
  // together, so the stored number has to be re-derived here too.
  await recomputeFamilyStreaks(familyId);
}

/** Resolves the break's family and enforces edit rights on it. */
async function requireBreakWriteAccess(breakId: string): Promise<string> {
  const rows = await db
    .select({ familyId: schema.schoolBreak.familyId })
    .from(schema.schoolBreak)
    .where(eq(schema.schoolBreak.id, breakId))
    .limit(1);
  if (!rows[0]) throw new Error("Break not found.");
  await requireFamilyAccess({ familyId: rows[0].familyId, write: true });
  return rows[0].familyId;
}
