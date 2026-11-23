"use server";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireAdmin } from "@/lib/admin";
import { sendEmail, appBaseUrl } from "@/lib/email";
import { brandedEmail } from "@/lib/email-template";

/**
 * The admin side of "Request access" (/admin/access-requests). Approving lets the requester's
 * email create an account while sign-ups are invite-only (src/lib/auth/signup-allowlist.ts) and
 * emails them a sign-up link; declining takes that back. Either can be changed later.
 */

/** How long an approval lets the email sign up. Approving again starts a fresh window. */
const APPROVAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

type Result<T = object> = ({ ok: true } & T) | { error: string };

export async function listAccessRequests() {
  await requireAdmin();
  const rows = await db
    .select({
      id: schema.accessRequest.id,
      name: schema.accessRequest.name,
      email: schema.accessRequest.email,
      message: schema.accessRequest.message,
      wantsBeta: schema.accessRequest.wantsBeta,
      notifyFree: schema.accessRequest.notifyFree,
      notifyPaid: schema.accessRequest.notifyPaid,
      status: schema.accessRequest.status,
      admitUntil: schema.accessRequest.admitUntil,
      decidedAt: schema.accessRequest.decidedAt,
      createdAt: schema.accessRequest.createdAt,
      // Set once the requester has an account, however they got it.
      accountUserId: schema.user.id,
    })
    .from(schema.accessRequest)
    .leftJoin(schema.user, eq(schema.user.email, schema.accessRequest.email))
    .orderBy(desc(schema.accessRequest.createdAt))
    .limit(500);
  const now = Date.now();
  // Whether this approval still lets the email sign up (the same test signup-allowlist.ts makes).
  return rows.map((r) => ({
    ...r,
    approvalLive: r.status === "invited" && r.admitUntil !== null && r.admitUntil.getTime() > now,
  }));
}

export type AccessRequestRow = Awaited<ReturnType<typeof listAccessRequests>>[number];

// Errors are returned, not thrown: production builds replace a thrown server-action message
// with a generic one.
export async function approveAccessRequest(
  id: string
): Promise<Result<{ link: string; emailSent: boolean; admitUntil: Date }>> {
  const session = await requireAdmin();
  const request = await findRequest(id);
  if (!request) return { error: "That request no longer exists." };

  const [existing] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, request.email))
    .limit(1);
  if (existing) return { error: `${request.email} already has an account.` };

  const now = new Date();
  const admitUntil = new Date(now.getTime() + APPROVAL_DAYS * DAY_MS);
  await db
    .update(schema.accessRequest)
    .set({ status: "invited", admitUntil, decidedAt: now, decidedByUserId: session.user.id })
    .where(eq(schema.accessRequest.id, id));

  const link = `${appBaseUrl()}/signup?email=${encodeURIComponent(request.email)}`;
  const emailSent = await sendApprovalEmail(request, link).catch((err) => {
    console.error("[access-request] approval email failed:", err);
    return false;
  });
  // The link comes back so the admin can send it by hand when email is off or fails.
  return { ok: true, link, emailSent, admitUntil };
}

export async function declineAccessRequest(id: string): Promise<Result> {
  const session = await requireAdmin();
  if (!(await findRequest(id))) return { error: "That request no longer exists." };
  await db
    .update(schema.accessRequest)
    .set({ status: "declined", admitUntil: null, decidedAt: new Date(), decidedByUserId: session.user.id })
    .where(eq(schema.accessRequest.id, id));
  return { ok: true };
}

async function findRequest(id: string) {
  const [row] = await db
    .select({ name: schema.accessRequest.name, email: schema.accessRequest.email })
    .from(schema.accessRequest)
    .where(eq(schema.accessRequest.id, id))
    .limit(1);
  return row ?? null;
}

async function sendApprovalEmail(request: { name: string; email: string }, link: string) {
  const firstName = request.name.split(" ")[0] || "traveler";
  const { html, text } = brandedEmail({
    preheader: "Your place in Kingdoms & Crowns is ready.",
    heading: "The gates are open to you",
    paragraphs: [
      `Welcome, ${firstName}! You asked to join the Kingdoms & Crowns beta, and there's a place for your family.`,
      `Create your account with this email address (${request.email}), or choose “Continue with Google” with a Google account that uses it.`,
      `This invitation is good for ${APPROVAL_DAYS} days.`,
    ],
    button: { label: "Create your account", url: link },
    afterButton: [`If the button doesn't work, paste this into your browser: ${link}`],
  });
  return sendEmail({
    to: request.email,
    subject: "You're invited to the Kingdoms & Crowns beta",
    text,
    html,
  });
}
