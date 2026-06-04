"use server";

import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { requireChildAccess, requireFamilyAccess, type FamilyAccess } from "@/lib/auth/access";
import { hashPin } from "@/lib/utils/pin";
import { sanitizeEmail } from "@/lib/utils/sanitize";
import { sendEmail, appBaseUrl } from "@/lib/email";
import { brandedEmail } from "@/lib/email-template";
import { generateLoginCode } from "@/lib/auth/child-login";

const CONSENT_VERSION = "2026-06-01";
const SETUP_LINK_TTL_DAYS = 7;

type LoginMethod = "pin" | "email" | "google";

/** Only family-wide editors/owners may manage a hero's login (not scoped guardians). */
function assertCanManageLogin(access: FamilyAccess) {
  if (access.scope === "specific") {
    throw new Error("Only family-wide guardians can manage hero logins.");
  }
}

async function consentedMethods(childId: string): Promise<Set<string>> {
  const rows = await db
    .select({ methods: schema.childConsent.methods })
    .from(schema.childConsent)
    .where(eq(schema.childConsent.childId, childId));
  const out = new Set<string>();
  for (const r of rows) {
    try {
      for (const m of JSON.parse(r.methods) as string[]) out.add(m);
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** Delete a Better Auth user's active sessions (force re-auth / logout). */
async function revokeUserSessions(userId: string) {
  await db.delete(schema.session).where(eq(schema.session.userId, userId));
}

export async function setChildEmail(childId: string, email: string) {
  const { access } = await requireChildAccess(childId, { write: true });
  assertCanManageLogin(access);

  const clean = email ? sanitizeEmail(email) : "";
  if (email && (!clean || !clean.includes("@"))) {
    throw new Error("Please enter a valid email address.");
  }

  // Disallow an email already in use by another account or hero.
  if (clean) {
    const existingUser = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, clean))
      .limit(1);
    const child = (
      await db
        .select({ authUserId: schema.child.authUserId })
        .from(schema.child)
        .where(eq(schema.child.id, childId))
        .limit(1)
    )[0];
    if (existingUser[0] && existingUser[0].id !== child?.authUserId) {
      throw new Error("That email is already in use by another account.");
    }
    const otherChild = await db
      .select({ id: schema.child.id })
      .from(schema.child)
      .where(eq(schema.child.email, clean))
      .limit(1);
    if (otherChild[0] && otherChild[0].id !== childId) {
      throw new Error("That email is already assigned to another hero.");
    }
  }

  await db
    .update(schema.child)
    .set({ email: clean || null, updatedAt: new Date() })
    .where(eq(schema.child.id, childId));
}

export async function setChildAuthMethod(
  childId: string,
  method: LoginMethod,
  enabled: boolean
) {
  const { access } = await requireChildAccess(childId, { write: true });
  assertCanManageLogin(access);

  const rows = await db
    .select()
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  const child = rows[0];
  if (!child) throw new Error("Hero not found.");

  if ((method === "email" || method === "google") && enabled) {
    if (!child.email) throw new Error("Set the hero's email before enabling this login.");
    const consented = await consentedMethods(childId);
    if (!consented.has(method)) {
      throw new Error("Record parental consent before enabling self-service login.");
    }
  }

  const col =
    method === "pin"
      ? { pinEnabled: enabled }
      : method === "email"
        ? { emailLoginEnabled: enabled }
        : { googleLoginEnabled: enabled };

  await db
    .update(schema.child)
    .set({ ...col, updatedAt: new Date() })
    .where(eq(schema.child.id, childId));

  // Disabling a self-service method revokes the linked account's sessions; if no
  // self-service method remains, fully unlink (delete) the Better Auth user.
  if ((method === "email" || method === "google") && !enabled && child.authUserId) {
    await revokeUserSessions(child.authUserId);
    const emailStill = method === "email" ? false : child.emailLoginEnabled;
    const googleStill = method === "google" ? false : child.googleLoginEnabled;
    if (!emailStill && !googleStill) {
      await db
        .update(schema.child)
        .set({ authUserId: null, updatedAt: new Date() })
        .where(eq(schema.child.id, childId));
      await db.delete(schema.user).where(eq(schema.user.id, child.authUserId));
    }
  }
}

export async function setChildPin(childId: string, pin: string) {
  const { access } = await requireChildAccess(childId, { write: true });
  assertCanManageLogin(access);
  const pinHash = await hashPin(pin); // validates 4-6 digits
  await db
    .update(schema.child)
    .set({ pinHash, pinEnabled: true, updatedAt: new Date() })
    .where(eq(schema.child.id, childId));
}

export async function recordChildConsent(childId: string, methods: LoginMethod[]) {
  const { access } = await requireChildAccess(childId, { write: true });
  assertCanManageLogin(access);
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const now = new Date();
  await db.insert(schema.childConsent).values({
    id: nanoid(),
    childId,
    consentedByUserId: access.userId,
    methods: JSON.stringify(methods),
    consentVersion: CONSENT_VERSION,
    ipAddress: ip,
    consentedAt: now,
    createdAt: now,
  });
}

/**
 * Mint a fresh password-setup link for an email-login hero, superseding any
 * prior pending links. Shared by the setup email and the starting-quest invite.
 */
async function createChildSetupLink(
  childId: string,
  email: string,
  createdByUserId: string
): Promise<{ token: string; link: string }> {
  const now = new Date();
  const token = nanoid(32);
  const expiresAt = new Date(now.getTime() + SETUP_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);

  // Supersede any prior pending links for this hero.
  await db
    .update(schema.childLoginLink)
    .set({ status: "revoked" })
    .where(
      and(
        eq(schema.childLoginLink.childId, childId),
        eq(schema.childLoginLink.status, "pending")
      )
    );

  await db.insert(schema.childLoginLink).values({
    id: nanoid(),
    token,
    childId,
    email,
    purpose: "set_password",
    status: "pending",
    expiresAt,
    createdByUserId,
    createdAt: now,
  });

  return { token, link: `${appBaseUrl()}/child-setup/${token}` };
}

export async function sendChildLoginSetup(childId: string) {
  const { access } = await requireChildAccess(childId, { write: true });
  assertCanManageLogin(access);

  const rows = await db
    .select()
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  const child = rows[0];
  if (!child) throw new Error("Hero not found.");
  if (!child.email) throw new Error("Set the hero's email first.");
  if (!child.emailLoginEnabled) throw new Error("Enable email login first.");

  const { token, link } = await createChildSetupLink(childId, child.email, access.userId);

  const { html, text } = brandedEmail({
    preheader: "Create your password and claim your hero.",
    heading: "Set up your hero login",
    greeting: `Hail, ${child.displayName}!`,
    paragraphs: [
      "A grown-up set up a login for you on Kingdoms & Crowns. Create your secret passphrase to claim your hero and begin your quests.",
      `This magic link expires in ${SETUP_LINK_TTL_DAYS} days.`,
    ],
    button: { label: "Create my password", url: link },
    afterButton: [`If the button doesn't work, paste this into your browser: ${link}`],
  });

  const emailSent = await sendEmail({
    to: child.email,
    subject: "Set up your Kingdoms & Crowns hero login",
    text,
    html,
  }).catch((err) => {
    console.error("[child-auth] setup email failed:", err);
    return false;
  });

  return { token, link, emailSent };
}

/**
 * Send a hero a fun "your quest awaits" invitation to log in. Adapts the link
 * and instructions to how the hero actually signs in:
 *  - email login, not yet claimed  → password-setup link (/child-setup/[token])
 *  - email login, already claimed   → sign-in page (/login)
 *  - PIN only                       → family-code hero login (/login?mode=kid&code=…)
 * Requires an email on file to send to.
 */
export async function sendChildQuestInvite(childId: string) {
  const { access } = await requireChildAccess(childId, { write: true });
  assertCanManageLogin(access);

  const rows = await db
    .select()
    .from(schema.child)
    .where(eq(schema.child.id, childId))
    .limit(1);
  const child = rows[0];
  if (!child) throw new Error("Hero not found.");
  if (!child.email) {
    throw new Error("Add the hero's email first so we know where to send the invite.");
  }
  if (!child.pinEnabled && !child.emailLoginEnabled && !child.googleLoginEnabled) {
    throw new Error("Give the hero a PIN, email, or Google login before inviting them.");
  }

  const base = appBaseUrl();
  let button: { label: string; url: string };
  const paragraphs: string[] = [
    "Your adventure on Kingdoms & Crowns is ready! Quests, XP, and glory await — tap below to enter the realm.",
  ];
  const afterButton: string[] = [];

  if (child.emailLoginEnabled && !child.authUserId) {
    // Email hero who hasn't claimed their account yet → setup link.
    const { link } = await createChildSetupLink(childId, child.email, access.userId);
    button = { label: "Begin your quest", url: link };
    paragraphs.push(
      `First, create your secret passphrase. This magic link expires in ${SETUP_LINK_TTL_DAYS} days.`
    );
    afterButton.push(`If the button doesn't work, paste this into your browser: ${link}`);
  } else if (child.emailLoginEnabled && child.authUserId) {
    // Email hero who already has a login → sign-in page.
    button = { label: "Begin your quest", url: `${base}/login` };
    paragraphs.push(`Sign in with your email (${child.email}) and your secret passphrase.`);
  } else if (child.googleLoginEnabled) {
    // Google hero → sign-in page; Google handles the credential, no password
    // setup needed (the Better Auth user is created on first Google sign-in).
    button = { label: "Begin your quest", url: `${base}/login` };
    paragraphs.push(`Sign in with Google using your email (${child.email}).`);
  } else {
    // PIN-only hero → family-code play page.
    const fam = (
      await db
        .select({ loginCode: schema.family.loginCode })
        .from(schema.family)
        .where(eq(schema.family.id, child.familyId))
        .limit(1)
    )[0];
    let code = fam?.loginCode ?? "";
    if (!code) {
      // PIN-only invite is useless without a code — mint one now.
      code = generateLoginCode();
      await db
        .update(schema.family)
        .set({ loginCode: code, updatedAt: new Date() })
        .where(eq(schema.family.id, child.familyId));
    }
    const url = `${base}/login?mode=kid&code=${encodeURIComponent(code)}`;
    button = { label: "Begin your quest", url };
    paragraphs.push("Tap your hero, then enter your secret PIN to start playing.");
    if (code) afterButton.push(`Your family code: ${code}`);
  }

  const { html, text } = brandedEmail({
    preheader: "Your quest awaits — enter the realm!",
    heading: "A quest awaits, hero!",
    greeting: `Hail, ${child.displayName}!`,
    paragraphs,
    button,
    afterButton,
  });

  const emailSent = await sendEmail({
    to: child.email,
    subject: `${child.displayName}, your quest on Kingdoms & Crowns awaits!`,
    text,
    html,
  }).catch((err) => {
    console.error("[child-auth] quest invite email failed:", err);
    return false;
  });

  return { link: button.url, emailSent };
}

/** Invitee-side: preview a setup token for the landing page (no auth). */
export async function getChildSetupPreview(token: string) {
  const rows = await db
    .select({
      status: schema.childLoginLink.status,
      expiresAt: schema.childLoginLink.expiresAt,
      email: schema.childLoginLink.email,
      displayName: schema.child.displayName,
    })
    .from(schema.childLoginLink)
    .innerJoin(schema.child, eq(schema.childLoginLink.childId, schema.child.id))
    .where(eq(schema.childLoginLink.token, token))
    .limit(1);
  const link = rows[0];
  if (!link) return { state: "invalid" as const };
  if (link.status === "accepted") return { state: "accepted" as const };
  if (link.status !== "pending") return { state: "revoked" as const };
  if (link.expiresAt.getTime() < Date.now()) return { state: "expired" as const };
  return {
    state: "valid" as const,
    displayName: link.displayName,
    email: link.email,
  };
}

/** Invitee-side: validate a setup token and create the child's account. */
export async function claimChildEmailAccount(args: { token: string; password: string }) {
  const linkRows = await db
    .select()
    .from(schema.childLoginLink)
    .where(eq(schema.childLoginLink.token, args.token))
    .limit(1);
  const link = linkRows[0];
  if (!link || link.status !== "pending") {
    throw new Error("This setup link is no longer valid.");
  }
  if (link.expiresAt.getTime() < Date.now()) {
    await db
      .update(schema.childLoginLink)
      .set({ status: "expired" })
      .where(eq(schema.childLoginLink.id, link.id));
    throw new Error("This setup link has expired. Ask a grown-up for a new one.");
  }

  const childRows = await db
    .select()
    .from(schema.child)
    .where(eq(schema.child.id, link.childId))
    .limit(1);
  const child = childRows[0];
  if (!child || !child.emailLoginEnabled || child.email !== link.email) {
    throw new Error("This setup link is no longer valid.");
  }

  // Reject if the email already belongs to a different account.
  const existing = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, link.email))
    .limit(1);
  if (existing[0] && existing[0].id !== child.authUserId) {
    throw new Error("That email is already in use. Ask a grown-up to use a different one.");
  }

  // Create the Better Auth user (also signs them in via nextCookies). The
  // user.create hook will link it; we also set authUserId explicitly.
  const result = await auth.api.signUpEmail({
    body: { email: link.email, password: args.password, name: child.displayName },
  });
  const newUserId = result.user?.id;
  if (newUserId) {
    await db
      .update(schema.child)
      .set({ authUserId: newUserId, updatedAt: new Date() })
      .where(eq(schema.child.id, child.id));
  }

  await db
    .update(schema.childLoginLink)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(eq(schema.childLoginLink.id, link.id));

  return { ok: true };
}

// ── Family login code (for standalone PIN login) ──────────────

export async function getFamilyLoginCode() {
  const access = await requireFamilyAccess();
  const rows = await db
    .select({ loginCode: schema.family.loginCode })
    .from(schema.family)
    .where(eq(schema.family.id, access.familyId))
    .limit(1);
  return rows[0]?.loginCode ?? null;
}

export async function regenerateFamilyLoginCode() {
  const access = await requireFamilyAccess({ write: true });
  const code = generateLoginCode();
  await db
    .update(schema.family)
    .set({ loginCode: code, updatedAt: new Date() })
    .where(eq(schema.family.id, access.familyId));
  return { code };
}

/**
 * Return the family's login code, generating and persisting one if it doesn't
 * exist yet. Used wherever a code is expected to "just be there" (the Settings
 * panel, PIN-only quest invites) so a parent never has to manually generate it.
 */
export async function ensureFamilyLoginCode(): Promise<string> {
  const access = await requireFamilyAccess({ write: true });
  const rows = await db
    .select({ loginCode: schema.family.loginCode })
    .from(schema.family)
    .where(eq(schema.family.id, access.familyId))
    .limit(1);
  const existing = rows[0]?.loginCode;
  if (existing) return existing;
  const code = generateLoginCode();
  await db
    .update(schema.family)
    .set({ loginCode: code, updatedAt: new Date() })
    .where(eq(schema.family.id, access.familyId));
  return code;
}
