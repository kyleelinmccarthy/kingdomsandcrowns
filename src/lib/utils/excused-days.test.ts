import { describe, it, expect } from "vitest";
import { parseExcuseReason, EXCUSE_REASON_LABELS, EXCUSE_REASONS } from "./excused-days";

describe("parseExcuseReason", () => {
  it("accepts every known reason", () => {
    for (const r of EXCUSE_REASONS) expect(parseExcuseReason(r)).toBe(r);
  });

  it("falls back to other for anything unrecognized", () => {
    expect(parseExcuseReason("nonsense")).toBe("other");
    expect(parseExcuseReason(null)).toBe("other");
    expect(parseExcuseReason(undefined)).toBe("other");
  });

  it("has a label for every reason", () => {
    for (const r of EXCUSE_REASONS) expect(EXCUSE_REASON_LABELS[r]).toBeTruthy();
  });
});
