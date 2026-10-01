/**
 * The choices offered by the Realm Timezone picker.
 *
 * Sourced from `Intl.supportedValuesOf` rather than a hand-maintained list, so
 * it cannot go stale as the runtime's zone database is updated, and no family
 * is excluded because nobody thought to add their region.
 */

/** Appended to the group label of a stored zone the runtime does not recognize. */
export const UNRECOGNIZED_ZONE_SUFFIX = "not a recognized timezone";

export type TimezoneGroup = {
  /** The `<optgroup>` label — a region, or the flagged label for an unknown stored zone. */
  region: string;
  zones: string[];
};

/** Whether the runtime accepts this as an IANA zone. Exported so the settings form can warn inline. */
export function isRecognizedTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Every selectable zone, grouped by region.
 *
 * `stored` is the family's current setting. When it is a zone the runtime does
 * not recognize — reachable, because this field used to be free text — it is
 * kept as its own group at the top rather than dropped. Dropping it would let
 * the next save silently rewrite the family's setting to whatever happened to
 * sort first; surfacing it lets a parent see what is wrong and fix it.
 */
export function timezoneOptions(stored: string): TimezoneGroup[] {
  const byRegion = new Map<string, string[]>();

  for (const zone of Intl.supportedValuesOf("timeZone")) {
    const slash = zone.indexOf("/");
    const region = slash === -1 ? "Other" : zone.slice(0, slash);
    const zones = byRegion.get(region);
    if (zones) zones.push(zone);
    else byRegion.set(region, [zone]);
  }

  const groups = [...byRegion.entries()]
    .map(([region, zones]) => ({ region, zones: zones.sort() }))
    .sort((a, b) => a.region.localeCompare(b.region));

  if (stored && !isRecognizedTimeZone(stored)) {
    return [{ region: `${stored} — ${UNRECOGNIZED_ZONE_SUFFIX}`, zones: [stored] }, ...groups];
  }

  return groups;
}
