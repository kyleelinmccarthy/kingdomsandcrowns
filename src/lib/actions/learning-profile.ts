"use server";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import {
  applyPreset,
  profileFromRow,
  validateProfilePatch,
  LEARNING_PRESETS,
  type LearningProfile,
} from "@/lib/utils/learning-profile";
import { GRADES } from "@/lib/utils/grade-levels";

/** Insert-if-missing then select, so two first reads can't make two rows. */
async function loadOrCreate(childId: string) {
  const now = new Date();
  await db
    .insert(schema.learningProfile)
    .values({ id: nanoid(), childId, createdAt: now, updatedAt: now })
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(schema.learningProfile)
    .where(eq(schema.learningProfile.childId, childId))
    .limit(1);
  return rows[0];
}

async function requireParent(childId: string) {
  const { access, familyId } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can change learning settings.");
  return familyId;
}

/** A hero may read their own profile; the app shell relies on that. */
export async function getLearningProfile(childId: string): Promise<LearningProfile> {
  await requireChildAccess(childId);
  return profileFromRow(await loadOrCreate(childId));
}

export async function updateLearningProfile(
  childId: string,
  patch: Partial<LearningProfile>
): Promise<void> {
  await requireParent(childId);
  const clean = validateProfilePatch(patch);
  await loadOrCreate(childId);
  await db
    .update(schema.learningProfile)
    .set({ ...clean, updatedAt: new Date() })
    .where(eq(schema.learningProfile.childId, childId));
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function applyLearningPreset(childId: string, presetId: string): Promise<void> {
  await requireParent(childId);
  if (!LEARNING_PRESETS.some((p) => p.id === presetId)) throw new Error("Unknown preset.");
  const current = profileFromRow(await loadOrCreate(childId));
  const next = applyPreset(current, presetId);
  await db
    .update(schema.learningProfile)
    .set({ ...next, updatedAt: new Date() })
    .where(eq(schema.learningProfile.childId, childId));
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

const AREAS = ["math", "reading", "language", "science"] as const;

/** A grown-up moves one strand away from the child's grade. Never the hero themselves. */
export async function setSubjectOffset(
  childId: string,
  area: (typeof AREAS)[number],
  offset: number
): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can set subject levels.");
  if (!AREAS.includes(area)) throw new Error("That subject doesn't look right.");
  if (!Number.isInteger(offset) || Math.abs(offset) > GRADES.length) throw new Error("That level doesn't look right.");
  const column = { math: "mathOffset", reading: "readingOffset", language: "languageOffset", science: "scienceOffset" } as const;
  await loadOrCreate(childId);
  await db
    .update(schema.learningProfile)
    .set({ [column[area]]: offset, updatedAt: new Date() })
    .where(eq(schema.learningProfile.childId, childId));
  revalidatePath("/settings");
}
