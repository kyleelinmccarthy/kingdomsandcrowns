"use server";

import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  requireFamilyAccess,
  ACTIVE_FAMILY_COOKIE,
  type MemberRole,
  type Permission,
  type MemberScope,
} from "@/lib/auth/access";
import { sanitizeEmail } from "@/lib/utils/sanitize";
import { sendEmail, appBaseUrl } from "@/lib/email";

const INVITE_TTL_DAYS = 7;
const INVITABLE_ROLES: MemberRole[] = ["co_parent", "teacher", "tutor", "guardian"];

function assertOwner(access: { isOwner: boolean }) {
  if (!access.isOwner) {
    throw new Error("Only the family owner can manage guardians.");
  }
}

/** Members + pending invites for the active family. Any member may view. */
export async function getFamilyMembers() {
  const access = await requireFamilyAccess();

  const members = await db
    .select({
      id: schema.familyMember.id,
      userId: schema.familyMember.userId,
      role: schema.familyMember.role,
      permission: schema.familyMember.permission,
      scope: schema.familyMember.scope,
      status: schema.familyMember.status,
      createdAt: schema.familyMember.createdAt,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.familyMember)
    .innerJoin(schema.user, eq(schema.familyMember.userId, schema.user.id))
    .where(eq(schema.familyMember.familyId, access.familyId));

  // Attach scoped child ids for "specific" members.
  const withScope = await Promise.all(
    members.map(async (m) => {
      let scopedChildIds: string[] = [];
      if (m.scope === "specific") {
        const rows = await db
          .select({ childId: schema.familyMemberChild.childId })
          .from(schema.familyMemberChild)
          .where(eq(schema.familyMemberChild.familyMemberId, m.id));
        scopedChildIds = rows.map((r) => r.childId);
      }
      return { ...m, scopedChildIds, isSelf: m.userId === access.userId };
    })
  );

  const invites = await db
    .select()
    .from(schema.familyInvite)
    .where(
      and(
        eq(schema.familyInvite.familyId, access.familyId),
        eq(schema.familyInvite.status, "pending")
      )
    );

  return { members: withScope, invites, canManage: access.isOwner };
}

export async function inviteGuardian(data: {
  email: string;
  role: MemberRole;
  permission: Permission;
  scope: MemberScope;
  childIds?: string[];
}) {
  const access = await requireFamilyAccess({ write: true });
  assertOwner(access);

  const email = sanitizeEmail(data.email);
  if (!email || !email.includes("@")) {
    throw new Error("Please enter a valid email address.");
  }
  if (email === (await currentUserEmail())) {
    throw new Error("You can't invite yourself.");
  }
  if (!INVITABLE_ROLES.includes(data.role)) {
    throw new Error("Invalid role.");
  }

  const scope: MemberScope = data.scope === "specific" ? "specific" : "all";
  const childIds = scope === "specific" ? (data.childIds ?? []) : [];
  if (scope === "specific" && childIds.length === 0) {
    throw new Error("Pick at least one hero for a scoped guardian.");
  }
  // Validate the chosen children belong to this family.
  if (scope === "specific") {
    const valid = await db
      .select({ id: schema.child.id })
      .from(schema.child)
      .where(eq(schema.child.familyId, access.familyId));
    const validSet = new Set(valid.map((c) => c.id));
    if (!childIds.every((id) => validSet.has(id))) {
      throw new Error("One or more selected heroes are not in this family.");
    }
  }

  // Reject if the email already belongs to an active member.
  const existingUser = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);
  if (existingUser[0]) {
    const existingMember = await db
      .select({ id: schema.familyMember.id })
      .from(schema.familyMember)
      .where(
        and(
          eq(schema.familyMember.familyId, access.familyId),
          eq(schema.familyMember.userId, existingUser[0].id)
        )
      )
      .limit(1);
    if (existingMember[0]) {
      throw new Error("That person already has access to this family.");
    }
  }

  // Reuse/refresh any pending invite to the same email for this family.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const token = nanoid(32);

  await db
    .update(schema.familyInvite)
    .set({ status: "revoked" })
    .where(
      and(
        eq(schema.familyInvite.familyId, access.familyId),
        eq(schema.familyInvite.email, email),
        eq(schema.familyInvite.status, "pending")
      )
    );

  await db.insert(schema.familyInvite).values({
    id: nanoid(),
    token,
    familyId: access.familyId,
    email,
    role: data.role,
    permission: data.permission === "view" ? "view" : "edit",
    scope,
    childIds: scope === "specific" ? JSON.stringify(childIds) : null,
    invitedByUserId: access.userId,
    status: "pending",
    expiresAt,
    createdAt: now,
  });

  const link = `${appBaseUrl()}/invite/${token}`;
  const emailSent = await sendEmail({
    to: email,
    subject: `You've been invited to join ${access.familyName} on Kingdoms & Crowns`,
    text: [
      `You've been invited to help track a family's learning journey on Kingdoms & Crowns.`,
      ``,
      `Family: ${access.familyName}`,
      `Your role: ${data.role.replace("_", " ")} (${data.permission === "view" ? "view only" : "can edit"})`,
      ``,
      `Accept your invitation:`,
      link,
      ``,
      `This invitation expires in ${INVITE_TTL_DAYS} days.`,
    ].join("\n"),
  }).catch((err) => {
    console.error("[guardians] invite email failed:", err);
    return false;
  });

  // Return the link so the UI can offer a copyable fallback when email is off.
  return { token, link, emailSent };
}

export async function revokeInvite(inviteId: string) {
  const access = await requireFamilyAccess({ write: true });
  assertOwner(access);
  await db
    .update(schema.familyInvite)
    .set({ status: "revoked" })
    .where(
      and(
        eq(schema.familyInvite.id, inviteId),
        eq(schema.familyInvite.familyId, access.familyId)
      )
    );
}

export async function resendInvite(inviteId: string) {
  const access = await requireFamilyAccess({ write: true });
  assertOwner(access);

  const rows = await db
    .select()
    .from(schema.familyInvite)
    .where(
      and(
        eq(schema.familyInvite.id, inviteId),
        eq(schema.familyInvite.familyId, access.familyId)
      )
    )
    .limit(1);
  const invite = rows[0];
  if (!invite || invite.status !== "pending") {
    throw new Error("Invite not found.");
  }

  const now = new Date();
  const token = nanoid(32);
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db
    .update(schema.familyInvite)
    .set({ token, expiresAt })
    .where(eq(schema.familyInvite.id, inviteId));

  const link = `${appBaseUrl()}/invite/${token}`;
  const emailSent = await sendEmail({
    to: invite.email,
    subject: `Reminder: your invitation to ${access.familyName} on Kingdoms & Crowns`,
    text: [`Accept your invitation:`, link].join("\n"),
  }).catch(() => false);

  return { token, link, emailSent };
}

export async function updateMemberAccess(
  memberId: string,
  data: {
    role?: MemberRole;
    permission?: Permission;
    scope?: MemberScope;
    childIds?: string[];
  }
) {
  const access = await requireFamilyAccess({ write: true });
  assertOwner(access);

  const rows = await db
    .select()
    .from(schema.familyMember)
    .where(
      and(
        eq(schema.familyMember.id, memberId),
        eq(schema.familyMember.familyId, access.familyId)
      )
    )
    .limit(1);
  const member = rows[0];
  if (!member) throw new Error("Member not found.");

  // Don't allow editing an owner's access through this path.
  if (member.role === "owner") {
    throw new Error("The owner's access can't be changed here.");
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.role && INVITABLE_ROLES.includes(data.role)) updates.role = data.role;
  if (data.permission) updates.permission = data.permission === "view" ? "view" : "edit";

  const nextScope: MemberScope | undefined = data.scope;
  if (nextScope) {
    updates.scope = nextScope;
  }

  await db
    .update(schema.familyMember)
    .set(updates)
    .where(eq(schema.familyMember.id, memberId));

  // Reconcile scoped children when scope is provided.
  if (nextScope === "all") {
    await db
      .delete(schema.familyMemberChild)
      .where(eq(schema.familyMemberChild.familyMemberId, memberId));
  } else if (nextScope === "specific") {
    const childIds = data.childIds ?? [];
    if (childIds.length === 0) {
      throw new Error("Pick at least one hero for a scoped guardian.");
    }
    await db
      .delete(schema.familyMemberChild)
      .where(eq(schema.familyMemberChild.familyMemberId, memberId));
    for (const childId of childIds) {
      await db.insert(schema.familyMemberChild).values({
        id: nanoid(),
        familyMemberId: memberId,
        childId,
      });
    }
  }
}

export async function removeMember(memberId: string) {
  const access = await requireFamilyAccess({ write: true });
  assertOwner(access);

  const rows = await db
    .select()
    .from(schema.familyMember)
    .where(
      and(
        eq(schema.familyMember.id, memberId),
        eq(schema.familyMember.familyId, access.familyId)
      )
    )
    .limit(1);
  const member = rows[0];
  if (!member) throw new Error("Member not found.");

  if (member.role === "owner") {
    await assertNotLastOwner(access.familyId);
  }

  await db.delete(schema.familyMember).where(eq(schema.familyMember.id, memberId));
}

async function assertNotLastOwner(familyId: string) {
  const owners = await db
    .select({ id: schema.familyMember.id })
    .from(schema.familyMember)
    .where(
      and(
        eq(schema.familyMember.familyId, familyId),
        eq(schema.familyMember.role, "owner"),
        eq(schema.familyMember.status, "active")
      )
    );
  if (owners.length <= 1) {
    throw new Error("A family must keep at least one owner.");
  }
}

async function currentUserEmail(): Promise<string | null> {
  try {
    const session = await requireSession();
    return sanitizeEmail(session.user.email);
  } catch {
    return null;
  }
}

// ── Invite landing / acceptance (invitee side) ────────────────

export async function getInvitePreview(token: string) {
  const rows = await db
    .select({
      id: schema.familyInvite.id,
      email: schema.familyInvite.email,
      role: schema.familyInvite.role,
      permission: schema.familyInvite.permission,
      status: schema.familyInvite.status,
      expiresAt: schema.familyInvite.expiresAt,
      familyName: schema.family.familyName,
      inviterName: schema.user.name,
    })
    .from(schema.familyInvite)
    .innerJoin(schema.family, eq(schema.familyInvite.familyId, schema.family.id))
    .leftJoin(schema.user, eq(schema.familyInvite.invitedByUserId, schema.user.id))
    .where(eq(schema.familyInvite.token, token))
    .limit(1);

  const invite = rows[0];
  if (!invite) return { state: "invalid" as const };

  if (invite.status === "accepted") return { state: "accepted" as const };
  if (invite.status !== "pending") return { state: "revoked" as const };
  if (invite.expiresAt.getTime() < Date.now()) return { state: "expired" as const };

  return {
    state: "valid" as const,
    email: invite.email,
    role: invite.role,
    permission: invite.permission,
    familyName: invite.familyName,
    inviterName: invite.inviterName,
  };
}

export async function acceptInvite(token: string) {
  const session = await requireSession();
  const userEmail = sanitizeEmail(session.user.email);

  const rows = await db
    .select()
    .from(schema.familyInvite)
    .where(eq(schema.familyInvite.token, token))
    .limit(1);
  const invite = rows[0];
  if (!invite) throw new Error("This invitation is no longer valid.");
  if (invite.status === "accepted") throw new Error("This invitation has already been accepted.");
  if (invite.status !== "pending") throw new Error("This invitation has been revoked.");
  if (invite.expiresAt.getTime() < Date.now()) {
    await db
      .update(schema.familyInvite)
      .set({ status: "expired" })
      .where(eq(schema.familyInvite.id, invite.id));
    throw new Error("This invitation has expired. Ask for a new one.");
  }
  if (sanitizeEmail(invite.email) !== userEmail) {
    throw new Error(
      `This invitation was sent to ${invite.email}. Sign in with that email to accept it.`
    );
  }

  const now = new Date();

  // Create or reactivate membership (unique on familyId+userId).
  const existing = await db
    .select({ id: schema.familyMember.id })
    .from(schema.familyMember)
    .where(
      and(
        eq(schema.familyMember.familyId, invite.familyId),
        eq(schema.familyMember.userId, session.user.id)
      )
    )
    .limit(1);

  let memberId: string;
  if (existing[0]) {
    memberId = existing[0].id;
    await db
      .update(schema.familyMember)
      .set({
        role: invite.role,
        permission: invite.permission,
        scope: invite.scope,
        status: "active",
        updatedAt: now,
      })
      .where(eq(schema.familyMember.id, memberId));
    await db
      .delete(schema.familyMemberChild)
      .where(eq(schema.familyMemberChild.familyMemberId, memberId));
  } else {
    memberId = nanoid();
    await db.insert(schema.familyMember).values({
      id: memberId,
      familyId: invite.familyId,
      userId: session.user.id,
      role: invite.role,
      permission: invite.permission,
      scope: invite.scope,
      status: "active",
      invitedByUserId: invite.invitedByUserId,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Scoped-child rows.
  if (invite.scope === "specific" && invite.childIds) {
    const childIds = JSON.parse(invite.childIds) as string[];
    for (const childId of childIds) {
      await db
        .insert(schema.familyMemberChild)
        .values({ id: nanoid(), familyMemberId: memberId, childId })
        .onConflictDoNothing();
    }
  }

  await db
    .update(schema.familyInvite)
    .set({ status: "accepted", acceptedAt: now })
    .where(eq(schema.familyInvite.id, invite.id));

  // Make the newly joined family the active one.
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_FAMILY_COOKIE, invite.familyId, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  return { familyId: invite.familyId };
}
