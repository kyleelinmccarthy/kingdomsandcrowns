import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getActor } from "@/lib/auth/actor";

export const ACTIVE_FAMILY_COOKIE = "active_family";

export type Permission = "edit" | "view";
export type MemberRole = "owner" | "co_parent" | "teacher" | "tutor" | "guardian";
export type MemberScope = "all" | "specific";

export type FamilyAccess = {
  familyId: string;
  familyName: string;
  userId: string;
  memberId: string;
  role: MemberRole;
  permission: Permission;
  scope: MemberScope;
  /** Child ids the member is restricted to; null when scope === "all". */
  scopedChildIds: string[] | null;
  isOwner: boolean;
};

function isDemoMode() {
  return process.env.DEMO_MODE === "true";
}

/**
 * Synthetic access granted to a child acting for their own profile. Edit
 * permission so a hero can complete quests / log activities / customize their
 * avatar for themselves; scope is locked to their own childId.
 */
function childSelfAccess(actor: { childId: string; familyId: string }): FamilyAccess {
  return {
    familyId: actor.familyId,
    familyName: "",
    userId: `child:${actor.childId}`,
    memberId: `child:${actor.childId}`,
    role: "guardian",
    permission: "edit",
    scope: "specific",
    scopedChildIds: [actor.childId],
    isOwner: false,
  };
}

// ── Pure decision helpers (unit-tested) ───────────────────────

/**
 * Choose the active family id from the precedence rules:
 * explicit arg → cookie → newest membership. Returns null if no memberships.
 * `memberships` must be sorted newest-first.
 */
export function resolveActiveFamilyId(
  memberships: Pick<FamilyAccess, "familyId">[],
  explicit: string | undefined,
  cookieVal: string | undefined
): string | null {
  if (memberships.length === 0) return null;
  if (explicit && memberships.some((m) => m.familyId === explicit)) return explicit;
  if (cookieVal && memberships.some((m) => m.familyId === cookieVal)) return cookieVal;
  return memberships[0].familyId;
}

/**
 * Find the membership for the target family and enforce the write permission.
 * Throws if there is no membership, or a write is requested without edit rights.
 */
export function pickFamilyAccess(
  memberships: FamilyAccess[],
  targetFamilyId: string,
  write: boolean
): FamilyAccess {
  const access = memberships.find((m) => m.familyId === targetFamilyId);
  if (!access) {
    throw new Error("You do not have access to this family.");
  }
  if (write && access.permission !== "edit") {
    throw new Error("Read-only access — you do not have permission to make changes.");
  }
  return access;
}

/** Whether a child falls within a member's scope. */
export function isChildInScope(
  access: Pick<FamilyAccess, "scope" | "scopedChildIds">,
  childId: string
): boolean {
  if (access.scope !== "specific") return true;
  return (access.scopedChildIds ?? []).includes(childId);
}

/**
 * Synthetic owner access used in demo mode. The demo parent owns the seeded
 * "demo-family" with full edit rights; we never touch the cookie/membership
 * tables so demo never exercises multi-family logic.
 */
async function demoAccess(): Promise<FamilyAccess> {
  const rows = await db
    .select({ id: schema.family.id, familyName: schema.family.familyName })
    .from(schema.family)
    .where(eq(schema.family.parentUserId, "demo-user"))
    .limit(1);
  const fam = rows[0];
  return {
    familyId: fam?.id ?? "demo-family",
    familyName: fam?.familyName ?? "Demo Family",
    userId: "demo-user",
    memberId: "demo-member",
    role: "owner",
    permission: "edit",
    scope: "all",
    scopedChildIds: null,
    isOwner: true,
  };
}

/**
 * All active memberships for a user, joined to their family, newest first.
 * Memoized per request — requireFamilyAccess and getActiveFamilyId both need it,
 * and requireChildAccess fans out to requireFamilyAccess once per action call.
 */
export const getMemberships = cache(async function getMemberships(
  userId: string,
): Promise<FamilyAccess[]> {
  const rows = await db
    .select({
      memberId: schema.familyMember.id,
      familyId: schema.familyMember.familyId,
      familyName: schema.family.familyName,
      role: schema.familyMember.role,
      permission: schema.familyMember.permission,
      scope: schema.familyMember.scope,
      createdAt: schema.familyMember.createdAt,
    })
    .from(schema.familyMember)
    .innerJoin(schema.family, eq(schema.familyMember.familyId, schema.family.id))
    .where(
      and(
        eq(schema.familyMember.userId, userId),
        eq(schema.familyMember.status, "active")
      )
    );

  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return Promise.all(
    rows.map(async (r) => {
      const role = r.role as MemberRole;
      const isOwner = role === "owner";
      let scopedChildIds: string[] | null = null;
      if (r.scope === "specific" && !isOwner) {
        const scoped = await db
          .select({ childId: schema.familyMemberChild.childId })
          .from(schema.familyMemberChild)
          .where(eq(schema.familyMemberChild.familyMemberId, r.memberId));
        scopedChildIds = scoped.map((s) => s.childId);
      }
      return {
        familyId: r.familyId,
        familyName: r.familyName,
        userId,
        memberId: r.memberId,
        role,
        // Owners always have edit rights regardless of the stored value.
        permission: (isOwner ? "edit" : r.permission) as Permission,
        scope: (isOwner ? "all" : r.scope) as MemberScope,
        scopedChildIds,
        isOwner,
      };
    })
  );
});

/** A child's owning family id. Memoized per request — requireChildAccess is
 *  invoked once per data action, repeatedly with the same childId on a page. */
const getChildFamilyId = cache(async function getChildFamilyId(
  childId: string,
): Promise<string | null> {
  const rows = await db
    .select({ familyId: schema.child.familyId })
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  return rows[0]?.familyId ?? null;
});

/**
 * Resolve which family is "active" for the current request.
 * Precedence: explicit arg → active_family cookie → sole/most-recent membership.
 * Returns null if the user has no memberships.
 */
export async function getActiveFamilyId(explicit?: string): Promise<string | null> {
  if (isDemoMode()) {
    return (await demoAccess()).familyId;
  }
  const session = await getSession();
  if (!session) return null;
  const memberships = await getMemberships(session.user.id);
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get(ACTIVE_FAMILY_COOKIE)?.value;
  // memberships are sorted newest-first.
  return resolveActiveFamilyId(memberships, explicit, cookieVal);
}

/**
 * Main family-level gate. Throws if the user has no access to the resolved
 * family, or if a write is requested without edit permission.
 */
export async function requireFamilyAccess(opts?: {
  familyId?: string;
  write?: boolean;
}): Promise<FamilyAccess> {
  const actor = await getActor();
  if (!actor) throw new Error("Unauthorized");
  // Children are never family members — all family management is adults-only.
  if (actor.kind === "child") {
    throw new Error("This action is for grown-ups.");
  }

  if (isDemoMode()) return demoAccess();

  const memberships = await getMemberships(actor.userId);
  if (memberships.length === 0) {
    throw new Error("No family found. Create a family first.");
  }

  const targetFamilyId =
    (await getActiveFamilyId(opts?.familyId)) ?? memberships[0].familyId;
  return pickFamilyAccess(memberships, targetFamilyId, opts?.write ?? false);
}

/**
 * Read-only family gate that also admits a child reading their OWN family's
 * data. Use for family-scoped data a hero legitimately views about themselves
 * (e.g. school breaks shown in their chronicle). Writes must still go through
 * requireFamilyAccess({ write: true }), which never admits a child.
 */
export async function requireFamilyReadAccess(familyId: string): Promise<FamilyAccess> {
  const actor = await getActor();
  if (!actor) throw new Error("Unauthorized");
  if (actor.kind === "child") {
    if (actor.familyId !== familyId) {
      throw new Error("This hero can only act for themselves.");
    }
    return childSelfAccess(actor);
  }
  return requireFamilyAccess({ familyId });
}

/**
 * Child-level gate. Verifies the child belongs to a family the user can access
 * and, for scoped members, that the child is within their scope.
 */
export async function requireChildAccess(
  childId: string,
  opts?: { write?: boolean }
): Promise<{ access: FamilyAccess; familyId: string }> {
  const actor = await getActor();
  if (!actor) throw new Error("Unauthorized");

  // A child may only ever act for their own profile.
  if (actor.kind === "child") {
    if (childId !== actor.childId) {
      throw new Error("This hero can only act for themselves.");
    }
    return { access: childSelfAccess(actor), familyId: actor.familyId };
  }

  // Adult: verify the child belongs to a family the user can access (+ scope).
  const familyId = await getChildFamilyId(childId);
  if (!familyId) throw new Error("Child not found.");

  const access = await requireFamilyAccess({ familyId, write: opts?.write });

  if (!isChildInScope(access, childId)) {
    throw new Error("This hero is outside your granted access.");
  }

  return { access, familyId };
}

/** Resolve access via a subject id (looks up the owning child). */
export async function requireSubjectAccess(
  subjectId: string,
  opts?: { write?: boolean }
) {
  const rows = await db
    .select({ childId: schema.subject.childId })
    .from(schema.subject)
    .where(eq(schema.subject.id, subjectId))
    .limit(1);
  if (!rows[0]) throw new Error("Subject not found.");
  return requireChildAccess(rows[0].childId, opts);
}

/** Resolve access via a quest id (looks up the owning child). */
export async function requireQuestAccess(
  questId: string,
  opts?: { write?: boolean }
) {
  const rows = await db
    .select({ childId: schema.quest.childId })
    .from(schema.quest)
    .where(eq(schema.quest.id, questId))
    .limit(1);
  if (!rows[0]) throw new Error("Quest not found.");
  return requireChildAccess(rows[0].childId, opts);
}

/** Resolve access via an activity-log id (looks up the owning child). */
export async function requireActivityAccess(
  activityId: string,
  opts?: { write?: boolean }
) {
  const rows = await db
    .select({ childId: schema.activityLog.childId })
    .from(schema.activityLog)
    .where(eq(schema.activityLog.id, activityId))
    .limit(1);
  if (!rows[0]) throw new Error("Activity not found.");
  return requireChildAccess(rows[0].childId, opts);
}

/** Resolve access via a quest-assignment id (looks up the owning child). */
export async function requireAssignmentAccess(
  assignmentId: string,
  opts?: { write?: boolean }
) {
  const rows = await db
    .select({ childId: schema.questAssignment.childId })
    .from(schema.questAssignment)
    .where(eq(schema.questAssignment.id, assignmentId))
    .limit(1);
  if (!rows[0]) throw new Error("Assignment not found.");
  return requireChildAccess(rows[0].childId, opts);
}

/** Resolve access via a quest-resource id (belongs to a quest or a subject). */
export async function requireResourceAccess(
  resourceId: string,
  opts?: { write?: boolean }
) {
  const rows = await db
    .select({
      questId: schema.questResource.questId,
      subjectId: schema.questResource.subjectId,
    })
    .from(schema.questResource)
    .where(eq(schema.questResource.id, resourceId))
    .limit(1);
  if (!rows[0]) throw new Error("Resource not found.");
  if (rows[0].questId) return requireQuestAccess(rows[0].questId, opts);
  if (rows[0].subjectId) return requireSubjectAccess(rows[0].subjectId, opts);
  throw new Error("Resource is not linked to a quest or subject.");
}

/** Resolve access via a quest-reminder id (looks up the owning quest). */
export async function requireReminderAccess(
  reminderId: string,
  opts?: { write?: boolean }
) {
  const rows = await db
    .select({ questId: schema.questReminder.questId })
    .from(schema.questReminder)
    .where(eq(schema.questReminder.id, reminderId))
    .limit(1);
  if (!rows[0]) throw new Error("Reminder not found.");
  return requireQuestAccess(rows[0].questId, opts);
}

/**
 * The set of child ids the member may view within their active family.
 * For scope === "all" this is every child in the family.
 */
export async function accessibleChildIds(access: FamilyAccess): Promise<string[]> {
  if (access.scope === "specific") {
    return access.scopedChildIds ?? [];
  }
  const rows = await db
    .select({ id: schema.child.id })
    .from(schema.child)
    .where(eq(schema.child.familyId, access.familyId));
  return rows.map((r) => r.id);
}

/** Convenience: children rows the member may view in their active family. */
export async function accessibleChildren(access: FamilyAccess) {
  if (access.scope === "specific") {
    const ids = access.scopedChildIds ?? [];
    if (ids.length === 0) return [];
    return db
      .select()
      .from(schema.child)
      .where(
        and(eq(schema.child.familyId, access.familyId), inArray(schema.child.id, ids))
      );
  }
  return db
    .select()
    .from(schema.child)
    .where(eq(schema.child.familyId, access.familyId));
}
