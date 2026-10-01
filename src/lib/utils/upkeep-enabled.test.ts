import { describe, it, expect } from "vitest";
import { isUpkeepEnabled } from "./upkeep-enabled";

describe("isUpkeepEnabled", () => {
  it("is on when both toggles are on", () => {
    expect(isUpkeepEnabled({ upkeepEnabled: true }, { upkeepEnabled: true })).toBe(true);
  });

  it("is off when the family toggle is off, whatever the child says", () => {
    expect(isUpkeepEnabled({ upkeepEnabled: false }, { upkeepEnabled: true })).toBe(false);
  });

  it("is off when the child is opted out", () => {
    expect(isUpkeepEnabled({ upkeepEnabled: true }, { upkeepEnabled: false })).toBe(false);
  });

  it("is off when there is no family", () => {
    expect(isUpkeepEnabled(null, { upkeepEnabled: true })).toBe(false);
  });

  it("is off when there is no child", () => {
    expect(isUpkeepEnabled({ upkeepEnabled: true }, null)).toBe(false);
  });

  it("is off when both are missing", () => {
    expect(isUpkeepEnabled(undefined, undefined)).toBe(false);
  });
});
