import { describe, it, expect } from "vitest";
import { correctedDate } from "./backfill-dates";

const TZ = "America/Denver";

describe("correctedDate", () => {
  it("corrects a row whose stored date matches the UTC date of its creation", () => {
    // 02:00 UTC on the 3rd was 20:00 on the 2nd in Denver. The stored date is
    // the UTC one, which is exactly the fingerprint of an auto-derived row.
    const createdAt = new Date("2026-09-03T02:00:00Z");
    expect(correctedDate({ storedDate: "2026-09-03", createdAt }, TZ)).toBe("2026-09-02");
  });

  it("leaves a deliberately backdated row alone", () => {
    // A parent logging Monday's work on Wednesday. The dates disagree, so this
    // was a choice, not the bug — touching it would rewrite real history.
    const createdAt = new Date("2026-09-03T02:00:00Z");
    expect(correctedDate({ storedDate: "2026-08-31", createdAt }, TZ)).toBeNull();
  });

  it("leaves a row alone when the UTC and local dates already agree", () => {
    // Logged at midday; no correction needed, so nothing is written.
    const createdAt = new Date("2026-09-02T18:00:00Z");
    expect(correctedDate({ storedDate: "2026-09-02", createdAt }, TZ)).toBeNull();
  });

  it("corrects in the other direction for a zone ahead of UTC", () => {
    const createdAt = new Date("2026-09-02T20:00:00Z");
    expect(correctedDate({ storedDate: "2026-09-02", createdAt }, "Pacific/Auckland")).toBe("2026-09-03");
  });

  it("never touches a row for a family already in UTC", () => {
    const createdAt = new Date("2026-09-03T02:00:00Z");
    expect(correctedDate({ storedDate: "2026-09-03", createdAt }, "UTC")).toBeNull();
  });

  it("handles a null stored date by leaving it alone", () => {
    // child.last_active_date is nullable.
    const createdAt = new Date("2026-09-03T02:00:00Z");
    expect(correctedDate({ storedDate: "", createdAt }, TZ)).toBeNull();
  });
});
