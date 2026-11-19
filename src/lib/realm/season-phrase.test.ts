import { describe, it, expect } from "vitest";
import { hemisphereForTimezone, seasonPhrase } from "./season-phrase";

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe("seasonPhrase", () => {
  it("names the calendar season in the hero's own zone", () => {
    const april = at("2026-04-15T18:00:00Z");
    expect(seasonPhrase(april, "America/Denver")).toBe("Spring 2026");
    expect(seasonPhrase(april, "Australia/Sydney")).toBe("Autumn 2026");
  });

  it("walks the northern year", () => {
    const tz = "America/Denver";
    expect(seasonPhrase(at("2026-01-10T18:00:00Z"), tz)).toBe("Winter 2026");
    expect(seasonPhrase(at("2026-03-10T18:00:00Z"), tz)).toBe("Spring 2026");
    expect(seasonPhrase(at("2026-07-10T18:00:00Z"), tz)).toBe("Summer 2026");
    expect(seasonPhrase(at("2026-10-10T18:00:00Z"), tz)).toBe("Autumn 2026");
    expect(seasonPhrase(at("2026-12-10T18:00:00Z"), tz)).toBe("Winter 2026");
  });

  it("walks the southern year, six months on", () => {
    const tz = "Pacific/Auckland";
    expect(seasonPhrase(at("2026-01-10T00:00:00Z"), tz)).toBe("Summer 2026");
    expect(seasonPhrase(at("2026-07-10T00:00:00Z"), tz)).toBe("Winter 2026");
    expect(seasonPhrase(at("2026-10-10T00:00:00Z"), tz)).toBe("Spring 2026");
  });

  it("reads the month where the hero lives, not in UTC", () => {
    // 1 March 03:00 UTC is still 28 February in Denver: winter there, spring in London.
    const edge = at("2026-03-01T03:00:00Z");
    expect(seasonPhrase(edge, "America/Denver")).toBe("Winter 2026");
    expect(seasonPhrase(edge, "Europe/London")).toBe("Spring 2026");
  });

  it("falls back to UTC for a zone it cannot read", () => {
    expect(seasonPhrase(at("2026-03-01T03:00:00Z"), "Not/AZone")).toBe("Spring 2026");
    expect(seasonPhrase(at("2026-03-01T03:00:00Z"), "")).toBe("Spring 2026");
  });

  it("reads a missing zone (a family that never set one) as UTC", () => {
    expect(seasonPhrase(at("2026-03-01T03:00:00Z"), null)).toBe("Spring 2026");
    expect(seasonPhrase(at("2026-03-01T03:00:00Z"), undefined)).toBe("Spring 2026");
  });

  it("says nothing for an instant that is not a real time", () => {
    expect(seasonPhrase(Number.NaN, "America/Denver")).toBe("");
    expect(seasonPhrase(Number.POSITIVE_INFINITY, null)).toBe("");
  });
});

describe("hemisphereForTimezone", () => {
  it("knows the southern zones", () => {
    for (const tz of ["Australia/Sydney", "Australia/Perth", "Pacific/Auckland", "America/Argentina/Buenos_Aires", "America/Santiago", "America/Sao_Paulo", "Africa/Johannesburg"]) {
      expect(hemisphereForTimezone(tz), tz).toBe("south");
    }
  });

  it("is northern otherwise", () => {
    for (const tz of ["America/Denver", "Europe/London", "Asia/Tokyo", "UTC", "", "Not/AZone", "America/Argentinaish"]) {
      expect(hemisphereForTimezone(tz), tz).toBe("north");
    }
    expect(hemisphereForTimezone(null)).toBe("north");
    expect(hemisphereForTimezone(undefined)).toBe("north");
  });
});
