import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getActiveFamilyId } from "@/lib/auth/access";
import { getActor } from "@/lib/auth/actor";

/** Matches the schema default on `family.timezone`. */
export const DEFAULT_TIMEZONE = "America/Denver";

/**
 * A stored timezone is only usable if Intl accepts it.
 *
 * `family.timezone` comes from a free-text settings field, so an invalid value
 * like "Denver" is reachable — and Intl.DateTimeFormat throws RangeError on it.
 * Falling back keeps every page rendering with a slightly-wrong date instead of
 * crashing outright, which is the better failure for something a parent typed
 * months ago and cannot see is broken.
 */
export function usableTimeZone(stored: string | null | undefined): string {
  if (!stored) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: stored });
    return stored;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * The active family's timezone — the authority for every "what day is it?"
 * in the app.
 *
 * cache()-wrapped for the same reason getActor is: production runs against a
 * remote Turso database and this is read on nearly every render, so an
 * uncached lookup would add a round trip per component that asks.
 *
 * A child actor (PIN session, or a Better Auth user linked to a child
 * profile) has no `family_member` row and often no Better Auth session at
 * all, so `getActiveFamilyId()` resolves to null for them — falling back to
 * DEFAULT_TIMEZONE on every child-facing page regardless of the family's
 * actual timezone. `getActor()` already carries the child's own familyId
 * from a direct child-table lookup, so resolve through that first; only fall
 * back to the membership-based lookup for an adult actor (or no actor).
 *
 * Falls back to the schema default rather than throwing: a page that cannot
 * resolve a family still has to render, and a wrong-by-a-few-hours date is a
 * better failure than a crash.
 */
export const getFamilyTimezone = cache(async function getFamilyTimezone(): Promise<string> {
  const actor = await getActor();
  const familyId = actor?.kind === "child" ? actor.familyId : await getActiveFamilyId();
  if (!familyId) return DEFAULT_TIMEZONE;

  const rows = await db
    .select({ timezone: schema.family.timezone })
    .from(schema.family)
    .where(eq(schema.family.id, familyId))
    .limit(1);

  return usableTimeZone(rows[0]?.timezone);
});

/**
 * The timezone of the family owning a given child.
 *
 * Server actions frequently know a childId but not which family is "active" —
 * and a guardian may hold several. Resolving through the child keeps the date
 * correct in those paths.
 */
export const getTimezoneForChild = cache(async function getTimezoneForChild(
  childId: string
): Promise<string> {
  const rows = await db
    .select({ timezone: schema.family.timezone })
    .from(schema.child)
    .innerJoin(schema.family, eq(schema.child.familyId, schema.family.id))
    .where(eq(schema.child.id, childId))
    .limit(1);

  return usableTimeZone(rows[0]?.timezone);
});
