import { describe, expect, it } from "vitest";
import { assertValidTimeZone, DEFAULT_TIMEZONE, usableTimeZone } from "./family-timezone";

describe("usableTimeZone", () => {
  it("passes through a valid IANA timezone", () => {
    expect(usableTimeZone("America/Denver")).toBe("America/Denver");
    expect(usableTimeZone("Pacific/Kiritimati")).toBe("Pacific/Kiritimati");
  });

  it("falls back to the default for an invalid timezone", () => {
    expect(usableTimeZone("Denver")).toBe(DEFAULT_TIMEZONE);
  });

  it("falls back to the default for an empty string", () => {
    expect(usableTimeZone("")).toBe(DEFAULT_TIMEZONE);
  });

  it("falls back to the default for null", () => {
    expect(usableTimeZone(null)).toBe(DEFAULT_TIMEZONE);
  });

  it("falls back to the default for undefined", () => {
    expect(usableTimeZone(undefined)).toBe(DEFAULT_TIMEZONE);
  });
});

describe("assertValidTimeZone", () => {
  it("accepts a real IANA zone", () => {
    expect(() => assertValidTimeZone("America/Denver")).not.toThrow();
    expect(() => assertValidTimeZone("Pacific/Kiritimati")).not.toThrow();
  });

  it("rejects a plausible-looking value that is not a real zone", () => {
    // "Denver" is exactly what a parent typed into the old free-text field.
    expect(() => assertValidTimeZone("Denver")).toThrow(/not a timezone the realm recognizes/i);
  });

  it("rejects an empty value rather than storing a blank", () => {
    expect(() => assertValidTimeZone("")).toThrow(/choose a timezone/i);
  });

  it("rejects undefined", () => {
    expect(() => assertValidTimeZone(undefined)).toThrow(/choose a timezone/i);
  });

  it("differs from usableTimeZone on purpose: writes reject, reads fall back", () => {
    // A bad value already in the database must still render, so the read-side
    // guard degrades. A bad value arriving now should never be stored.
    expect(usableTimeZone("Denver")).toBe("America/Denver");
    expect(() => assertValidTimeZone("Denver")).toThrow();
  });
});
