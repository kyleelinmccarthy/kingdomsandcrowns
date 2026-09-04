import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getActiveFamilyId } from "@/lib/auth/access";

/** Matches the schema default on `family.timezone`. */
export const DEFAULT_TIMEZONE = "America/Denver";

/**
 * The active family's timezone — the authority for every "what day is it?"
 * in the app.
 *
 * cache()-wrapped for the same reason getActor is: production runs against a
 * remote Turso database and this is read on nearly every render, so an
 * uncached lookup would add a round trip per component that asks.
 *
 * Falls back to the schema default rather than throwing: a page that cannot
 * resolve a family still has to render, and a wrong-by-a-few-hours date is a
 * better failure than a crash.
 */
export const getFamilyTimezone = cache(async function getFamilyTimezone(): Promise<string> {
  const familyId = await getActiveFamilyId();
  if (!familyId) return DEFAULT_TIMEZONE;

  const rows = await db
    .select({ timezone: schema.family.timezone })
    .from(schema.family)
    .where(eq(schema.family.id, familyId))
    .limit(1);

  return rows[0]?.timezone || DEFAULT_TIMEZONE;
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

  return rows[0]?.timezone || DEFAULT_TIMEZONE;
});
