import type { AgeMode } from "./age-mode";

/** Five bands cover K–12; content is authored per band, not per grade. */
export type ContentBand = "k1" | "g23" | "g45" | "g68" | "g912";
export const CONTENT_BANDS: ContentBand[] = ["k1", "g23", "g45", "g68", "g912"];

export const BAND_LABELS: Record<ContentBand, string> = {
  k1: "Kindergarten – Grade 1",
  g23: "Grades 2–3",
  g45: "Grades 4–5",
  g68: "Grades 6–8",
  g912: "Grades 9–12",
};

/** A hero with only a birth year lands in the middle of their age band. */
export function bandForHero(grade: string | null, ageMode: AgeMode): ContentBand {
  if (grade === "K" || grade === "1") return "k1";
  const n = grade ? parseInt(grade, 10) : NaN;
  if (Number.isFinite(n)) {
    if (n <= 3) return "g23";
    if (n <= 5) return "g45";
    if (n <= 8) return "g68";
    return "g912";
  }
  return ageMode === "elementary" ? "g23" : ageMode === "middle" ? "g68" : "g912";
}

export function bandIndex(band: ContentBand): number {
  return CONTENT_BANDS.indexOf(band);
}

/** The band, then each band below (nearest first), then each band above. Easier before harder. */
export function nearestBands(band: ContentBand): ContentBand[] {
  const i = bandIndex(band);
  const below = CONTENT_BANDS.slice(0, i).reverse();
  const above = CONTENT_BANDS.slice(i + 1);
  return [band, ...below, ...above];
}
