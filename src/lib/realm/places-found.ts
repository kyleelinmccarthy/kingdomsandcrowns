/**
 * THE PLACES A HERO HAS FOUND: the one record of where in the 3D Realm a child has stood.
 *
 * It drives three things, which used to keep three different answers: the HUD's "N of 19 places
 * found", the minimap's filled marks, and fast travel's destinations. It is kept per child in the
 * database (`realm_place_found`), loaded with the Realm's bundle, and written only by the hero
 * themselves (`lib/actions/realm-places.ts`).
 *
 * Pure: no `three`, no database. The server validates with it; the client cleans with it.
 */

/**
 * Every named place on the island, by id: the five authored `PLACES` and the generator's own
 * (`lib/realm3d/worldgen.ts`, `${kind}-${n}`). A fixed list rather than a pattern, so a hand-made
 * request cannot invent a place; `places-found.test.ts` checks it is exactly the generated
 * world's landmarks, so it cannot drift from the island without a test failing.
 */
export const REALM_PLACE_IDS: readonly string[] = [
  "ringstones",
  "highcairn",
  "longwater",
  "farfurrow",
  "appleway",
  "summit-6",
  "summit-7",
  "summit-8",
  "deepwood-9",
  "deepwood-10",
  "deepwood-11",
  "cove-12",
  "cove-13",
  "cove-14",
  "mire-15",
  "mire-16",
  "outcrop-17",
  "outcrop-18",
  "outcrop-19",
];

const PLACE_SET: ReadonlySet<string> = new Set(REALM_PLACE_IDS);

/** A call can never carry more than every place there is. */
export const MAX_PLACES_PER_CALL = REALM_PLACE_IDS.length;

export function isRealmPlaceId(id: unknown): id is string {
  return typeof id === "string" && PLACE_SET.has(id);
}

/** Anything at all, as a clean list of real place ids: no duplicates, nothing made up. */
export function cleanPlaceIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) if (isRealmPlaceId(v) && !out.includes(v)) out.push(v);
  return out;
}

/** The key the mounts lane kept a child's visited places under, on one device. Read once, to move them. */
export function legacyVisitedKey(childId: string): string {
  return `realm3d:visited:${childId}`;
}

/**
 * The key a child's found-but-not-yet-saved places wait under on this device: a place found
 * offline, or when a save failed, is kept here until the server has it, and never longer.
 */
export function unsavedPlacesKey(childId: string): string {
  return `realm3d:places-unsaved:${childId}`;
}

/** A stored list, read defensively: anything that is not a list of real place ids is nothing. */
export function readStoredPlaces(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return cleanPlaceIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** How long to wait before the Nth retry of a failed save: 2 s, 4 s, 8 s … at most a minute. */
export function retryDelayMs(failures: number): number {
  return Math.min(60_000, 2000 * 2 ** Math.max(0, failures - 1));
}
