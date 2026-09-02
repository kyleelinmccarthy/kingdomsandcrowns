"use server";

import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  requireFamilyAccess,
  requireChildAccess,
  accessibleChildren,
  banishedChildren,
} from "@/lib/auth/access";
import { sanitizeName } from "@/lib/utils/sanitize";
import { hashPin } from "@/lib/utils/pin";
import { resolveAge } from "@/lib/utils/age-mode";
import { formatDate } from "@/lib/utils/dates";
import { syncSeasonForGrade } from "@/lib/services/season-sync";
import type { TransitionPlan } from "@/lib/utils/seasons";

export async function getChildren() {
  const access = await requireFamilyAccess();
  return accessibleChildren(access);
}

/**
 * Banished heroes a parent may restore (or remove for good). Only family-wide
 * guardians can act on them, so scoped members are never shown the list.
 */
export async function getBanishedChildren() {
  const access = await requireFamilyAccess();
  if (access.scope === "specific") return [];
  return banishedChildren(access);
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

  // A hero with a grade starts their first season the day they're summoned.
  if (grade) await syncSeasonForGrade(id, grade, formatDate(now));

  return { id, displayName: name };
}

export async function updateChild(
  childId: string,
  data: { displayName?: string; birthYear?: number; grade?: string },
  today?: string
): Promise<{ seasonTransition: TransitionPlan | null }> {
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

  // Sync the season before updating the child row: if the sync throws, the
  // grade stays untouched instead of leaving grade and season disagreeing.
  let seasonTransition: TransitionPlan | null = null;
  if (data.grade) {
    seasonTransition = await syncSeasonForGrade(childId, data.grade, today ?? formatDate(new Date()));
  }

  await db
    .update(schema.child)
    .set(updates)
    .where(and(eq(schema.child.id, childId), eq(schema.child.familyId, familyId)));

  return { seasonTransition };
}

/**
 * Banish a hero: a soft delete. Everything they own stays in the database and
 * they simply stop appearing anywhere — lists, logins, leaderboards — until a
 * parent restores them. Permanent removal is deleteChild().
 */
export async function banishChild(childId: string) {
  const access = await requireChildAccess(childId, { write: true });
  if (access.access.scope === "specific") {
    throw new Error("Only family-wide guardians can banish heroes.");
  }

  await db
    .update(schema.child)
    .set({ banishedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(schema.child.id, childId), eq(schema.child.familyId, access.familyId))
    );
}

/** Undo a banishment — the hero and all their chronicles return untouched. */
export async function restoreChild(childId: string) {
  const access = await requireChildAccess(childId, {
    write: true,
    allowBanished: true,
  });
  if (access.access.scope === "specific") {
    throw new Error("Only family-wide guardians can restore heroes.");
  }

  await db
    .update(schema.child)
    .set({ banishedAt: null, updatedAt: new Date() })
    .where(
      and(eq(schema.child.id, childId), eq(schema.child.familyId, access.familyId))
    );
}

/**
 * Permanently erase a banished hero and everything they own. Irreversible —
 * only reachable from the banished list, so a hero is always banished (and
 * recoverable) first.
 */
export async function deleteChild(childId: string) {
  const access = await requireChildAccess(childId, {
    write: true,
    allowBanished: true,
  });
  if (access.access.scope === "specific") {
    throw new Error("Only family-wide guardians can remove heroes.");
  }

  // Capture any linked Better Auth account so we can remove it too — otherwise
  // it would survive as an orphan login (authUserId is set-null on delete).
  const rows = await db
    .select({
      authUserId: schema.child.authUserId,
      banishedAt: schema.child.banishedAt,
    })
    .from(schema.child)
    .where(and(eq(schema.child.id, childId), eq(schema.child.familyId, access.familyId)))
    .limit(1);

  if (!rows[0]) throw new Error("Child not found.");
  if (!rows[0].banishedAt) {
    throw new Error("Banish this hero first — then they can be removed for good.");
  }

  await db
    .delete(schema.child)
    .where(
      and(eq(schema.child.id, childId), eq(schema.child.familyId, access.familyId))
    );

  const authUserId = rows[0].authUserId;
  if (authUserId) {
    // Deleting the user cascades its sessions/accounts.
    await db.delete(schema.user).where(eq(schema.user.id, authUserId));
  }
}
