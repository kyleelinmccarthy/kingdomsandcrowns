import { describe, it, expect } from "vitest";
import { resolveRequiresApproval, describeApprovalInheritance } from "./upkeep-approval";

describe("resolveRequiresApproval", () => {
  it("inherits the family setting when the hero has no override", () => {
    expect(resolveRequiresApproval(true, null)).toBe(true);
    expect(resolveRequiresApproval(false, null)).toBe(false);
  });

  it("treats undefined the same as null — a missing column is inherit", () => {
    expect(resolveRequiresApproval(true, undefined)).toBe(true);
  });

  it("lets a hero be held to confirmation the family does not require", () => {
    expect(resolveRequiresApproval(false, true)).toBe(true);
  });

  it("lets a trusted hero skip confirmation the family does require", () => {
    expect(resolveRequiresApproval(true, false)).toBe(false);
  });

  it("an override matching the family value still resolves to that value", () => {
    expect(resolveRequiresApproval(true, true)).toBe(true);
    expect(resolveRequiresApproval(false, false)).toBe(false);
  });
});

describe("describeApprovalInheritance", () => {
  it("names what Inherit currently resolves to, so the choice is never ambiguous", () => {
    expect(describeApprovalInheritance(true)).toBe("currently always confirm");
    expect(describeApprovalInheritance(false)).toBe("currently no confirmation");
  });
});
