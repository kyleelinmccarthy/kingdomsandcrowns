import { describe, it, expect } from "vitest";
import { hashId } from "./hash";

describe("hashId", () => {
  it("is the FNV-1a hash the troubles were seeded with (pinned values)", () => {
    expect(hashId("")).toBe(2166136261);
    expect(hashId("a")).toBe(3826002220);
    expect(hashId("chapel")).toBe(hashId("chapel"));
  });

  it("is a non-negative 32-bit integer and tells different ids apart", () => {
    for (const s of ["well", "mill", "hesper", "2026-11-19:ivy"]) {
      const h = hashId(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
    expect(hashId("well")).not.toBe(hashId("mill"));
  });
});
