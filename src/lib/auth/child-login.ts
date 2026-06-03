import { randomInt } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getActor } from "@/lib/auth/actor";
import { getActiveFamilyId } from "@/lib/auth/access";

// Crockford-ish base32 without ambiguous chars (no I, L, O, U, 0, 1).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const CODE_LENGTH = 8;

const MAX_PIN_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export function generateLoginCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

export type HeroOption = {
  childId: string;
  displayName: string;
  avatarConfig: string | null;
};

/** PIN-enabled heroes for a family (for the avatar picker). */
export async function heroesForFamily(familyId: string): Promise<HeroOption[]> {
  const rows = await db
    .select({
      childId: schema.child.id,
      displayName: schema.child.displayName,
      avatarConfig: schema.child.avatarConfig,
    })
    .from(schema.child)
    .where(and(eq(schema.child.familyId, familyId), eq(schema.child.pinEnabled, true)));
  return rows;
}

/**
 * Resolve the family for a PIN-login surface:
 *   - explicit family login code (standalone device), OR
 *   - the active family of a signed-in adult (shared device).
 * Returns null if neither resolves.
 */
export async function resolveFamilyForPinLogin(familyCode?: string): Promise<string | null> {
  if (familyCode) {
    const code = familyCode.trim().toUpperCase();
    if (!code) return null;
    const rows = await db
      .select({ id: schema.family.id })
      .from(schema.family)
      .where(eq(schema.family.loginCode, code))
      .limit(1);
    return rows[0]?.id ?? null;
  }
  // Shared-device: derive from a signed-in adult.
  const actor = await getActor();
  if (actor?.kind === "adult") {
    return getActiveFamilyId();
  }
  return null;
}

// ── PIN brute-force lockout (per child + ip) ──────────────────

export async function isLockedOut(childId: string, ip: string): Promise<boolean> {
  const rows = await db
    .select({ lockedUntil: schema.childPinAttempt.lockedUntil })
    .from(schema.childPinAttempt)
    .where(
      and(
        eq(schema.childPinAttempt.childId, childId),
        eq(schema.childPinAttempt.ipAddress, ip)
      )
    )
    .limit(1);
  const lockedUntil = rows[0]?.lockedUntil;
  return !!lockedUntil && lockedUntil.getTime() > Date.now();
}

export async function recordPinFailure(childId: string, ip: string): Promise<void> {
  const now = new Date();
  const rows = await db
    .select()
    .from(schema.childPinAttempt)
    .where(
      and(
        eq(schema.childPinAttempt.childId, childId),
        eq(schema.childPinAttempt.ipAddress, ip)
      )
    )
    .limit(1);

  if (!rows[0]) {
    await db.insert(schema.childPinAttempt).values({
      id: crypto.randomUUID(),
      childId,
      ipAddress: ip,
      failedCount: 1,
      lockedUntil: null,
      updatedAt: now,
    });
    return;
  }

  const failedCount = rows[0].failedCount + 1;
  const lockedUntil =
    failedCount >= MAX_PIN_FAILURES ? new Date(now.getTime() + LOCKOUT_MS) : null;
  await db
    .update(schema.childPinAttempt)
    .set({ failedCount, lockedUntil, updatedAt: now })
    .where(eq(schema.childPinAttempt.id, rows[0].id));
}

export async function clearPinAttempts(childId: string, ip: string): Promise<void> {
  await db
    .delete(schema.childPinAttempt)
    .where(
      and(
        eq(schema.childPinAttempt.childId, childId),
        eq(schema.childPinAttempt.ipAddress, ip)
      )
    );
}
