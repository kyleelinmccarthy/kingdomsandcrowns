import { cache } from "react";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { BILLING_ENABLED } from "./config";

/** Free plan: 1 child, 1 adult account, full quest/chore loop, no compliance export. */
export const FREE_CHILD_LIMIT = 1;
export const FREE_MEMBER_LIMIT = 1;

export type Plan = "free" | "paid";
export type SubscriptionStatus = "free" | "active" | "trialing" | "past_due" | "canceled";

const PAID_STATUSES = new Set(["active", "trialing"]);

// The gates below RETURN their message (null when allowed) rather than throwing it: production
// builds redact the message of anything a server action throws, and these messages are the
// upgrade prompt the family sees. Actions pass them back as `{ error }`.

/** A family's raw subscription status — no row means "free", the same as an explicit "free"
 *  status. Memoized per request. */
export const getSubscriptionStatus = cache(async function getSubscriptionStatus(
  familyId: string
): Promise<SubscriptionStatus> {
  const rows = await db
    .select({ status: schema.subscription.status })
    .from(schema.subscription)
    .where(eq(schema.subscription.familyId, familyId))
    .limit(1);
  return (rows[0]?.status ?? "free") as SubscriptionStatus;
});

/** A family's current plan: "paid" only while Stripe reports an active or trialing
 *  subscription — a lapsed or past-due family reads as "free" for gating purposes, though its
 *  existing data stays fully visible: the gates only ever stop something new being added. */
export async function getFamilyPlan(familyId: string): Promise<Plan> {
  // Before launch every family has everything, so all three gates below open without a query.
  if (!BILLING_ENABLED) return "paid";
  const status = await getSubscriptionStatus(familyId);
  return PAID_STATUSES.has(status) ? "paid" : "free";
}

/** Gate for paid-only actions (the compliance/export features). */
export async function paidPlanBlock(familyId: string, action: string): Promise<string | null> {
  if ((await getFamilyPlan(familyId)) === "paid") return null;
  return `${action} needs the paid plan. Upgrade from Settings to unlock it.`;
}

/** Gate for adding a new hero. Paid families have no cap. */
export async function childLimitBlock(familyId: string): Promise<string | null> {
  if ((await getFamilyPlan(familyId)) === "paid") return null;
  const rows = await db
    .select({ id: schema.child.id })
    .from(schema.child)
    .where(and(eq(schema.child.familyId, familyId), isNull(schema.child.banishedAt)));
  return rows.length >= FREE_CHILD_LIMIT
    ? `The free plan includes ${FREE_CHILD_LIMIT} hero. Upgrade to add more.`
    : null;
}

/** Gate for adding a new adult (co-parent/teacher/tutor/guardian) seat. Paid families have no cap. */
export async function memberLimitBlock(familyId: string): Promise<string | null> {
  if ((await getFamilyPlan(familyId)) === "paid") return null;
  const rows = await db
    .select({ id: schema.familyMember.id })
    .from(schema.familyMember)
    .where(
      and(eq(schema.familyMember.familyId, familyId), eq(schema.familyMember.status, "active"))
    );
  return rows.length >= FREE_MEMBER_LIMIT
    ? `The free plan includes ${FREE_MEMBER_LIMIT} adult account. Upgrade to invite co-parents, tutors, or teachers.`
    : null;
}
