import { describe, expect, it } from "vitest";
import { DEFAULT_TIMEZONE, usableTimeZone } from "./family-timezone";

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
