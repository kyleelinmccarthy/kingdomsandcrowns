/**
 * The calendar season a child remembers ("Spring 2026"), for a "Raised by" line (D13.8). It is read
 * from a timestamp that never moves (`completed_at`), never from the grade-year season row, which a
 * grown-up can relabel. Pure and client-safe.
 */

export type Hemisphere = "north" | "south";

/** The zones whose seasons run six months off the north's. Everything else is northern. */
const SOUTHERN_PREFIXES = ["Australia/", "America/Argentina/"];
const SOUTHERN_ZONES = new Set(["Pacific/Auckland", "America/Santiago", "America/Sao_Paulo", "Africa/Johannesburg"]);

/** A family that never set a zone has none (null or undefined): read as UTC, which is northern. */
export function hemisphereForTimezone(timeZone: string | null | undefined): Hemisphere {
  if (!timeZone) return "north";
  if (SOUTHERN_ZONES.has(timeZone)) return "south";
  return SOUTHERN_PREFIXES.some((p) => timeZone.startsWith(p)) ? "south" : "north";
}

/** Northern seasons by month, January first. December is that year's winter: simple, and what a child says. */
const NORTH = ["Winter", "Winter", "Spring", "Spring", "Spring", "Summer", "Summer", "Summer", "Autumn", "Autumn", "Autumn", "Winter"] as const;

/** The month (1–12) and year of an instant in a zone; a zone `Intl` cannot read falls back to UTC. */
function monthAndYear(epochSeconds: number, timeZone: string | null | undefined): { month: number; year: number } {
  const date = new Date(epochSeconds * 1000);
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "UTC", year: "numeric", month: "numeric" });
  } catch {
    format = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "numeric" });
  }
  const parts = format.formatToParts(date);
  const part = (type: "month" | "year") => Number(parts.find((p) => p.type === type)?.value);
  return { month: part("month"), year: part("year") };
}

/** "Spring 2026": the calendar season of `epochSeconds` where the hero lives. A missing zone is UTC; a time that is not real says nothing. */
export function seasonPhrase(epochSeconds: number, timeZone: string | null | undefined): string {
  if (!Number.isFinite(epochSeconds)) return "";
  const { month, year } = monthAndYear(epochSeconds, timeZone);
  // The south's season is the north's six months on.
  const shifted = hemisphereForTimezone(timeZone) === "south" ? (month + 5) % 12 : month - 1;
  return `${NORTH[shifted]} ${year}`;
}
