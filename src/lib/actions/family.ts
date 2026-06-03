"use server";

import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireParentUserId } from "@/lib/auth/session";
import {
  requireFamilyAccess,
  getActiveFamilyId,
  getMemberships,
} from "@/lib/auth/access";
import { getSession } from "@/lib/auth/session";
import { sanitizeName } from "@/lib/utils/sanitize";

export async function getFamily() {
  const familyId = await getActiveFamilyId();
  if (!familyId) return null;
  const rows = await db
    .select()
    .from(schema.family)
    .where(eq(schema.family.id, familyId))
    .limit(1);
  return rows[0] ?? null;
}

/** All families the current user can access, for the family switcher. */
export async function getFamilies() {
  const session = await getSession();
  if (!session) return [];
  const memberships = await getMemberships(session.user.id);
  return memberships.map((m) => ({
    id: m.familyId,
    familyName: m.familyName,
    role: m.role,
    permission: m.permission,
    isOwner: m.isOwner,
  }));
}

export async function createFamily(familyName: string, timezone?: string) {
  const parentUserId = await requireParentUserId();
  const now = new Date();
  const id = nanoid();
  const name = sanitizeName(familyName);
  if (!name) throw new Error("Family name is required");

  await db.insert(schema.family).values({
    id,
    parentUserId,
    familyName: name,
    timezone: timezone ?? "America/Denver",
    createdAt: now,
    updatedAt: now,
  });

  // The creator becomes the owning family member (source of truth for access).
  await db.insert(schema.familyMember).values({
    id: nanoid(),
    familyId: id,
    userId: parentUserId,
    role: "owner",
    permission: "edit",
    scope: "all",
    status: "active",
    invitedByUserId: null,
    createdAt: now,
    updatedAt: now,
  });

  return { id, familyName: name };
}

export async function updateFamily(familyName: string, timezone?: string) {
  const access = await requireFamilyAccess({ write: true });
  const name = sanitizeName(familyName);
  if (!name) throw new Error("Family name is required");

  await db
    .update(schema.family)
    .set({ familyName: name, timezone: timezone ?? undefined, updatedAt: new Date() })
    .where(eq(schema.family.id, access.familyId));
}
