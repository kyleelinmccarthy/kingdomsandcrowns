import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * Sign-ups are closed to the public. A NEW account may only be created for an email a family has
 * already provisioned:
 *  - an adult with a pending, unexpired invite to a family (guardian invites), or
 *  - a hero whose grown-up set this email on them and turned on email or Google login.
 *
 * Checked in the user.create hook, so it covers every way an account can be born — the email
 * form, Google sign-in, and the hero set-password flow (which calls auth.api.signUpEmail).
 * Existing accounts are unaffected: signing in never creates a user.
 */
export async function mayCreateAccount(rawEmail: string | null | undefined): Promise<boolean> {
  const email = rawEmail?.trim().toLowerCase();
  if (!email) return false;

  const invite = await db
    .select({ id: schema.familyInvite.id })
    .from(schema.familyInvite)
    .where(
      and(
        eq(schema.familyInvite.email, email),
        eq(schema.familyInvite.status, "pending"),
        gt(schema.familyInvite.expiresAt, new Date())
      )
    )
    .limit(1);
  if (invite[0]) return true;

  const hero = await db
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
  return !!hero[0];
}
