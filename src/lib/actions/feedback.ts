"use server";

import { nanoid } from "nanoid";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getSession, requireSession } from "@/lib/auth/session";
import { sanitizeText } from "@/lib/utils/sanitize";
import { isAdminUser } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { brandedEmail } from "@/lib/email-template";

const CATEGORIES = ["bug", "idea", "praise", "other"] as const;
type Category = (typeof CATEGORIES)[number];

export type SubmitFeedbackInput = {
  category: string;
  message: string;
  pageUrl?: string;
  userAgent?: string;
  viewport?: string;
};

export async function submitFeedback(input: SubmitFeedbackInput) {
  const session = await getSession();

  const category = (CATEGORIES as readonly string[]).includes(input.category)
    ? (input.category as Category)
    : "other";

  const message = sanitizeText(input.message ?? "", 5_000);
  if (!message || message.length < 3) {
    throw new Error("Please share a bit more so we can act on it.");
  }

  const now = new Date();
  const id = nanoid();
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

  await db.insert(schema.feedback).values({
    id,
    userId: session?.user.id ?? null,
    category,
    message,
    pageUrl: input.pageUrl ? sanitizeText(input.pageUrl, 500) : null,
    userAgent: input.userAgent ? sanitizeText(input.userAgent, 500) : null,
    viewport: input.viewport ? sanitizeText(input.viewport, 50) : null,
    appVersion,
    status: "new",
    createdAt: now,
    updatedAt: now,
  });

  await notifyAdminByEmail({
    id,
    category,
    message,
    pageUrl: input.pageUrl,
    userEmail: session?.user.email ?? null,
    userName: session?.user.name ?? null,
  }).catch((err) => {
    console.error("[feedback] email notify failed:", err);
  });

  return { id };
}

export async function listFeedback() {
  const session = await requireSession();
  if (!(await isAdminUser(session.user.id))) {
    throw new Error("Unauthorized");
  }
  return db
    .select()
    .from(schema.feedback)
    .orderBy(desc(schema.feedback.createdAt))
    .limit(200);
}

export async function updateFeedbackStatus(
  id: string,
  status: "new" | "triaged" | "resolved" | "archived",
  adminNotes?: string,
) {
  const session = await requireSession();
  if (!(await isAdminUser(session.user.id))) {
    throw new Error("Unauthorized");
  }
  await db
    .update(schema.feedback)
    .set({
      status,
      adminNotes: adminNotes !== undefined ? sanitizeText(adminNotes, 2_000) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(schema.feedback.id, id));
}

async function notifyAdminByEmail(args: {
  id: string;
  category: Category;
  message: string;
  pageUrl?: string;
  userEmail: string | null;
  userName: string | null;
}) {
  const to = process.env.FEEDBACK_NOTIFY_EMAIL;
  if (!to) return;

  const subject = `[K&C ${args.category}] ${args.message.slice(0, 60)}`;
  const { html, text } = brandedEmail({
    preheader: `New ${args.category} feedback from a hero.`,
    heading: `A raven arrives: ${args.category}`,
    paragraphs: [
      `From: ${args.userName ?? "(anonymous)"} <${args.userEmail ?? "no-email"}>`,
      `Page: ${args.pageUrl ?? "(unknown)"}`,
      `ID: ${args.id}`,
      args.message,
    ],
    footnote: "Sent by the Kingdoms & Crowns “Send a Raven” feedback feature.",
  });

  await sendEmail({
    to,
    subject,
    text,
    html,
    replyTo: args.userEmail ?? undefined,
  });
}
