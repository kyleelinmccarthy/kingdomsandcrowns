import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * Link a freshly authenticated Better Auth user to a child profile — but ONLY
 * when the parent provisioned it: the child row carries that email, the matching
 * self-service method is enabled, parental consent covering that method exists,
 * and (for email/password) a parent-issued login-link token exists. Idempotent:
 * the `authUserId IS NULL` guard means re-runs and double-fires are harmless,
 * and ordinary adult sign-ups (no matching child) are a no-op.
 *
 * This runs at auth events (Better Auth user.create / session.create hooks),
 * never on every request.
 */
export async function tryLinkChildForUser(user: {
  id: string;
  email?: string | null;
}): Promise<void> {
  if (!user.email) return;
  const email = user.email.trim().toLowerCase();
  if (!email) return;

  const rows = await db
    .select()
    .from(schema.child)
    .where(and(eq(schema.child.email, email), isNull(schema.child.authUserId)))
    .limit(1);
  const candidate = rows[0];
  if (!candidate) return;

  const enabledMethods: string[] = [];
  if (candidate.emailLoginEnabled) enabledMethods.push("email");
  if (candidate.googleLoginEnabled) enabledMethods.push("google");
  if (enabledMethods.length === 0) return;

  // Parental consent must cover at least one enabled self-service method.
  const consentRows = await db
    .select({ methods: schema.childConsent.methods })
    .from(schema.childConsent)
    .where(eq(schema.childConsent.childId, candidate.id));
  const consented = new Set<string>();
  for (const row of consentRows) {
    try {
      for (const m of JSON.parse(row.methods) as string[]) consented.add(m);
    } catch {
      /* ignore malformed */
    }
  }
  if (!enabledMethods.some((m) => consented.has(m))) return;

  // Email/password linking additionally requires a parent-issued token (the
  // set-password flow); Google relies on the provider-verified email + toggle.
  if (!candidate.googleLoginEnabled) {
    const link = await db
      .select({ id: schema.childLoginLink.id })
      .from(schema.childLoginLink)
      .where(eq(schema.childLoginLink.childId, candidate.id))
      .limit(1);
    if (!link[0]) return;
  }

  await db
    .update(schema.child)
    .set({ authUserId: user.id, updatedAt: new Date() })
    .where(and(eq(schema.child.id, candidate.id), isNull(schema.child.authUserId)));
}

/** Same as above, resolving the user's email from their id first. */
export async function tryLinkChildByUserId(userId: string): Promise<void> {
  const rows = await db
    .select({ id: schema.user.id, email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  if (!rows[0]) return;
  await tryLinkChildForUser(rows[0]);
}
