"use server";

import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  requireFamilyAccess,
  requireChildAccess,
  accessibleChildren,
} from "@/lib/auth/access";
import { sanitizeName } from "@/lib/utils/sanitize";
import { hashPin } from "@/lib/utils/pin";
import {
  deriveAgeMode,
  ageModeFromGrade,
  isValidGrade,
  type AgeMode,
} from "@/lib/utils/age-mode";

/**
 * Resolve age inputs into the stored fields. The parent provides EITHER a birth
 * year or a grade; ageMode is derived from whichever is present.
 */
function resolveAge(
  birthYear?: number,
  grade?: string
): { birthYear: number | null; grade: string | null; ageMode: AgeMode } {
  if (grade) {
    if (!isValidGrade(grade)) throw new Error("Please choose a valid grade.");
    return { birthYear: null, grade, ageMode: ageModeFromGrade(grade) };
  }
  if (birthYear) {
    return { birthYear, grade: null, ageMode: deriveAgeMode(birthYear) };
  }
  throw new Error("Add a birth year or a grade for this hero.");
}

export async function getChildren() {
  const access = await requireFamilyAccess();
  return accessibleChildren(access);
}

export async function getChild(childId: string) {
  try {
    await requireChildAccess(childId);
  } catch {
    return null;
  }
  const rows = await db
    .select()
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createChild(data: {
  displayName: string;
  birthYear?: number; // provide birthYear OR grade
  grade?: string;
  pin?: string; // optional — an email-only hero may have no PIN
}) {
  const access = await requireFamilyAccess({ write: true });
  if (access.scope === "specific") {
    throw new Error("Only family-wide guardians can add new heroes.");
  }
  const familyId = access.familyId;
  const now = new Date();
  const id = nanoid();
  const name = sanitizeName(data.displayName);
  if (!name) throw new Error("Name is required");

  const { birthYear, grade, ageMode } = resolveAge(data.birthYear, data.grade);

  const pinHash = data.pin ? await hashPin(data.pin) : null;

  await db.insert(schema.child).values({
    id,
    familyId,
    displayName: name,
    pinHash,
    pinEnabled: !!data.pin,
    birthYear,
    grade,
    ageMode,
    currentXp: 0,
    currentStreak: 0,
    longestStreak: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Create default subjects
  const defaultSubjects = [
    { name: "Math", color: "#ef4444", icon: "calculator", isRequired: true },
    { name: "Reading", color: "#3b82f6", icon: "book-open", isRequired: true },
    { name: "Science", color: "#22c55e", icon: "flask-conical", isRequired: false },
    { name: "History", color: "#f59e0b", icon: "landmark", isRequired: false },
    { name: "Art", color: "#a855f7", icon: "palette", isRequired: false },
  ];

  for (let i = 0; i < defaultSubjects.length; i++) {
    const s = defaultSubjects[i];
    await db.insert(schema.subject).values({
      id: nanoid(),
      childId: id,
      name: s.name,
      color: s.color,
      icon: s.icon,
      isDefault: true,
      isRequired: s.isRequired,
      isActive: true,
      sortOrder: i,
      createdAt: now,
    });
  }

  return { id, displayName: name };
}

export async function updateChild(childId: string, data: {
  displayName?: string;
  birthYear?: number;
  grade?: string;
}) {
  const { familyId } = await requireChildAccess(childId, { write: true });
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.displayName) updates.displayName = sanitizeName(data.displayName);
  // Grade takes precedence if provided; otherwise birth year. Setting one clears
  // the other so age data stays consistent.
  if (data.grade) {
    const { birthYear, grade, ageMode } = resolveAge(undefined, data.grade);
    updates.birthYear = birthYear;
    updates.grade = grade;
    updates.ageMode = ageMode;
  } else if (data.birthYear) {
    const { birthYear, grade, ageMode } = resolveAge(data.birthYear, undefined);
    updates.birthYear = birthYear;
    updates.grade = grade;
    updates.ageMode = ageMode;
  }

  await db
    .update(schema.child)
    .set(updates)
    .where(and(eq(schema.child.id, childId), eq(schema.child.familyId, familyId)));
}

export async function deleteChild(childId: string) {
  const access = await requireChildAccess(childId, { write: true });
  if (access.access.scope === "specific") {
    throw new Error("Only family-wide guardians can remove heroes.");
  }

  // Capture any linked Better Auth account so we can remove it too — otherwise
  // it would survive as an orphan login (authUserId is set-null on delete).
  const rows = await db
    .select({ authUserId: schema.child.authUserId })
    .from(schema.child)
    .where(and(eq(schema.child.id, childId), eq(schema.child.familyId, access.familyId)))
    .limit(1);

  await db
    .delete(schema.child)
    .where(
      and(eq(schema.child.id, childId), eq(schema.child.familyId, access.familyId))
    );

  const authUserId = rows[0]?.authUserId;
  if (authUserId) {
    // Deleting the user cascades its sessions/accounts.
    await db.delete(schema.user).where(eq(schema.user.id, authUserId));
  }
}
