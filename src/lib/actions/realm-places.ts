"use server";

import { requireChildAccess, isChildActor } from "@/lib/auth/access";
import { addPlacesFound, loadPlacesFound } from "@/lib/services/realm-places";
import { isRealmPlaceId, MAX_PLACES_PER_CALL } from "@/lib/realm/places-found";

/**
 * The hero found these places in the 3D Realm (by landmark id). Records them and answers with
 * every place the hero has found, which the client takes as the truth.
 *
 *   - only the hero themselves — a visiting grown-up's walk writes nothing of the child's;
 *   - only real place ids, at most one of each place there is in a call;
 *   - idempotent: a place already found, sent again, changes nothing.
 */
export async function recordPlacesFound(childId: string, placeIds: string[]): Promise<string[]> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (!isChildActor(access)) throw new Error("Only the hero finds places in their own Realm.");
  if (!Array.isArray(placeIds) || placeIds.length < 1 || placeIds.length > MAX_PLACES_PER_CALL) {
    throw new Error(`Send between 1 and ${MAX_PLACES_PER_CALL} places at a time.`);
  }
  if (!placeIds.every(isRealmPlaceId)) throw new Error("That isn't a place the Realm knows.");
  await addPlacesFound(childId, [...new Set(placeIds)]);
  return loadPlacesFound(childId);
}
