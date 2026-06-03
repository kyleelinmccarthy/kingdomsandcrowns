"use server";

import { nanoid } from "nanoid";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sanitizeName } from "@/lib/utils/sanitize";
import { requireFamilyAccess } from "@/lib/auth/access";

export async function getSchoolBreaks(familyId: string) {
  await requireFamilyAccess({ familyId });
  return db
    .select()
    .from(schema.schoolBreak)
    .where(eq(schema.schoolBreak.familyId, familyId))
    .orderBy(asc(schema.schoolBreak.startDate));
}

export async function createSchoolBreak(
  familyId: string,
  name: string,
  startDate: string,
  endDate: string
) {
  await requireFamilyAccess({ familyId, write: true });
  const cleanName = sanitizeName(name);
  if (!cleanName) throw new Error("Break name is required");
  if (startDate > endDate) throw new Error("Start date must be before end date");

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
  return { id };
}

export async function deleteSchoolBreak(breakId: string) {
  const rows = await db
    .select({ familyId: schema.schoolBreak.familyId })
    .from(schema.schoolBreak)
    .where(eq(schema.schoolBreak.id, breakId))
    .limit(1);
  if (!rows[0]) throw new Error("Break not found.");
  await requireFamilyAccess({ familyId: rows[0].familyId, write: true });

  await db
    .delete(schema.schoolBreak)
    .where(eq(schema.schoolBreak.id, breakId));
}
