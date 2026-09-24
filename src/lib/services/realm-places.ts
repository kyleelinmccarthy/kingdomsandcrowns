import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { cleanPlaceIds } from "@/lib/realm/places-found";

/**
 * The places this hero has found, in the order they were found. Anything in the table that is
 * no longer a place on the island (a regenerated world) is left out rather than counted.
 */
export async function loadPlacesFound(childId: string): Promise<string[]> {
  const rows = await db
    .select({ placeId: schema.realmPlaceFound.placeId })
    .from(schema.realmPlaceFound)
    .where(eq(schema.realmPlaceFound.childId, childId))
    .orderBy(asc(schema.realmPlaceFound.foundAt));
  return cleanPlaceIds(rows.map((r) => r.placeId));
}

/**
 * Writes these places down as found. Idempotent: the unique index on (child, place) makes a
 * place already there a no-op, so a retried save, two tabs or a migrated list can never double
 * a row. The caller validates; this only writes what it is given.
 */
export async function addPlacesFound(childId: string, placeIds: readonly string[]): Promise<void> {
  if (placeIds.length === 0) return;
  const now = new Date();
  await db
    .insert(schema.realmPlaceFound)
    .values(placeIds.map((placeId) => ({ id: nanoid(), childId, placeId, foundAt: now })))
    .onConflictDoNothing({ target: [schema.realmPlaceFound.childId, schema.realmPlaceFound.placeId] });
}
