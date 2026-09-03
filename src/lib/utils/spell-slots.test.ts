import { describe, it, expect } from "vitest";
import { spellSlots, MAX_SPELL_SLOTS } from "./spell-slots";

describe("spellSlots", () => {
  it("opens four pages for a new hero", () => {
    expect(spellSlots(1)).toBe(4);
    expect(spellSlots(9)).toBe(4);
  });
  it("adds a page every ten levels", () => {
    expect(spellSlots(10)).toBe(5);
    expect(spellSlots(50)).toBe(9);
  });
  it("never passes the cap", () => {
    expect(spellSlots(100)).toBe(MAX_SPELL_SLOTS);
    expect(spellSlots(500)).toBe(12);
  });
});
