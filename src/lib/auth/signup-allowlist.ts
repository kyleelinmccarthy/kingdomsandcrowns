import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { signupMode } from "@/lib/auth/signup-mode";

/**
 * May a NEW account be created for this email? Once SIGNUP_MODE is "open" (signup-mode.ts),
 * anyone may. While it is invite-only (the default), only an email someone let in:
 *  - an adult with a pending, unexpired invite to a family (guardian invites),
 *  - a hero whose grown-up set this email on them and turned on email or Google login, or
 *  - someone whose access request an admin approved, until that approval runs out.
 *
 * Checked in the user.create hook, so it covers every way an account can be born — the email
 * form, Google sign-in, and the hero set-password flow (which calls auth.api.signUpEmail).
 * Existing accounts are unaffected: signing in never creates a user.
 */
export async function mayCreateAccount(rawEmail: string | null | undefined): Promise<boolean> {
  if (signupMode() === "open") return true;

  const email = rawEmail?.trim().toLowerCase();
  if (!email) return false;

  for (const admits of ADMISSION_RULES) {
    if (await admits(email, new Date())) return true;
  }
  return false;
}

/** One way in while sign-ups are invite-only. Takes a trimmed, lower-cased email. */
type AdmissionRule = (email: string, now: Date) => Promise<boolean>;

const pendingFamilyInvite: AdmissionRule = async (email, now) => {
  const rows = await db
    .select({ id: schema.familyInvite.id })
    .from(schema.familyInvite)
    .where(
      and(
        eq(schema.familyInvite.email, email),
        eq(schema.familyInvite.status, "pending"),
        gt(schema.familyInvite.expiresAt, now)
      )
    )
    .limit(1);
  return rows.length > 0;
};

const provisionedHero: AdmissionRule = async (email) => {
  const rows = await db
    .select({ id: schema.child.id })
    .from(schema.child)
    .where(
      and(
        eq(schema.child.email, email),
        isNull(schema.child.authUserId),
        isNull(schema.child.banishedAt),
        or(eq(schema.child.emailLoginEnabled, true), eq(schema.child.googleLoginEnabled, true))
      )
    )
    .limit(1);
  return rows.length > 0;
};

const approvedAccessRequest: AdmissionRule = async (email, now) => {
  const rows = await db
    .select({ id: schema.accessRequest.id })
    .from(schema.accessRequest)
    .where(
      and(
        eq(schema.accessRequest.email, email),
        eq(schema.accessRequest.status, "invited"),
        gt(schema.accessRequest.admitUntil, now)
      )
    )
    .limit(1);
  return rows.length > 0;
};

const ADMISSION_RULES: readonly AdmissionRule[] = [pendingFamilyInvite, provisionedHero, approvedAccessRequest];
