import { describe, it, expect } from "vitest";
import { DAZZLE_MS, startFocus, stepFocus, isDazzled } from "./focus";

describe("focus", () => {
  it("dazzles for 1.5 s after losing focus and not before", () => {
    const f = startFocus();
    expect(isDazzled(f, 0)).toBe(false);
    const hit = stepFocus(f, true, 1000);
    expect(isDazzled(hit, 1000)).toBe(true);
    expect(isDazzled(hit, 1000 + DAZZLE_MS - 1)).toBe(true);
    expect(isDazzled(hit, 1000 + DAZZLE_MS)).toBe(false);
    expect(stepFocus(hit, false, 1200)).toBe(hit);
  });
});
