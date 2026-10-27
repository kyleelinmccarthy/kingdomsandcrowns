"use server";

import { nanoid } from "nanoid";
import { and, count, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sanitizeEmail, sanitizeName, sanitizeText } from "@/lib/utils/sanitize";
import { sendEmail } from "@/lib/email";
import { brandedEmail } from "@/lib/email-template";

export type AccessRequestInput = {
  name: string;
  email: string;
  message?: string;
  wantsBeta: boolean;
  notifyFree: boolean;
  notifyPaid: boolean;
  /** Honeypot: a visually hidden field people never see. Bots that fill it get a quiet "thanks". */
  website?: string;
};

const PER_EMAIL_PER_DAY = 3;
const PER_IP_PER_HOUR = 10;

async function hashedClientIp(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!ip) return null;
  const salted = new TextEncoder().encode(`${process.env.BETTER_AUTH_SECRET ?? ""}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", salted);
  return Buffer.from(digest).toString("hex").slice(0, 32);
}

// Errors are returned, not thrown: production builds replace a thrown server-action message
// with a generic one, and these are written for the visitor to read.
export async function requestAccess(
  input: AccessRequestInput
): Promise<{ ok: true } | { error: string }> {
  if (input.website) return { ok: true };

  const name = sanitizeName(input.name ?? "");
  const email = sanitizeEmail(input.email ?? "");
  const message = sanitizeText(input.message ?? "", 2_000) || null;
  if (!name) return { error: "Please tell us your name." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  const now = Date.now();
  const ipHash = await hashedClientIp();
  const [byEmail] = await db
    .select({ n: count() })
    .from(schema.accessRequest)
    .where(and(eq(schema.accessRequest.email, email), gt(schema.accessRequest.createdAt, new Date(now - 86_400_000))));
  if (byEmail.n >= PER_EMAIL_PER_DAY) {
    return { error: "We already have your request — we'll be in touch." };
  }
  if (ipHash) {
    const [byIp] = await db
      .select({ n: count() })
      .from(schema.accessRequest)
      .where(and(eq(schema.accessRequest.ipHash, ipHash), gt(schema.accessRequest.createdAt, new Date(now - 3_600_000))));
    if (byIp.n >= PER_IP_PER_HOUR) {
      return { error: "Too many requests from here just now. Please try again later." };
    }
  }

  const row = {
    id: nanoid(),
    name,
    email,
    message,
    wantsBeta: !!input.wantsBeta,
    notifyFree: !!input.notifyFree,
    notifyPaid: !!input.notifyPaid,
    ipHash,
    createdAt: new Date(now),
  };
  await db.insert(schema.accessRequest).values(row);

  await notifyOwner(row).catch((err) => {
    console.error("[access-request] email notify failed:", err);
  });
  return { ok: true };
}

async function notifyOwner(r: {
  id: string;
  name: string;
  email: string;
  message: string | null;
  wantsBeta: boolean;
  notifyFree: boolean;
  notifyPaid: boolean;
}) {
  const to = process.env.FEEDBACK_NOTIFY_EMAIL;
  if (!to) return;
  const interests = [
    r.wantsBeta && "wants to beta test now",
    r.notifyFree && "notify when free accounts open",
    r.notifyPaid && "notify when paid plans open",
  ].filter(Boolean);
  const { html, text } = brandedEmail({
    preheader: `${r.name} would like to join Kingdoms & Crowns.`,
    heading: "A traveler asks to enter the realm",
    paragraphs: [
      `From: ${r.name} <${r.email}>`,
      `Interested in: ${interests.length ? interests.join("; ") : "access (no extra options ticked)"}`,
      ...(r.message ? [r.message] : []),
      `ID: ${r.id}`,
    ],
    footnote: "Sent by the Kingdoms & Crowns “Request access” form. Reply to this email to reach them.",
  });
  await sendEmail({
    to,
    subject: `[K&C access request] ${r.name}${r.wantsBeta ? " (beta tester)" : ""}`,
    text,
    html,
    replyTo: r.email,
  });
}
