import { describe, it, expect } from "vitest";
import {
  resolveActiveFamilyId,
  pickFamilyAccess,
  isChildInScope,
  type FamilyAccess,
} from "./access";

function member(overrides: Partial<FamilyAccess> = {}): FamilyAccess {
  return {
    familyId: "fam1",
    familyName: "Fam One",
    userId: "u1",
    memberId: "m1",
    role: "owner",
    permission: "edit",
    scope: "all",
    scopedChildIds: null,
    isOwner: true,
    ...overrides,
  };
}

describe("resolveActiveFamilyId", () => {
  it("returns null when there are no memberships", () => {
    expect(resolveActiveFamilyId([], "fam1", "fam2")).toBeNull();
  });

  it("prefers an explicit family the user belongs to", () => {
    const ms = [member({ familyId: "fam1" }), member({ familyId: "fam2" })];
    expect(resolveActiveFamilyId(ms, "fam2", "fam1")).toBe("fam2");
  });

  it("ignores an explicit family the user does NOT belong to and falls back to cookie", () => {
    const ms = [member({ familyId: "fam1" }), member({ familyId: "fam2" })];
    expect(resolveActiveFamilyId(ms, "intruder", "fam2")).toBe("fam2");
  });

  it("uses the cookie when no valid explicit value is given", () => {
    const ms = [member({ familyId: "fam1" }), member({ familyId: "fam2" })];
    expect(resolveActiveFamilyId(ms, undefined, "fam2")).toBe("fam2");
  });

  it("ignores a cookie pointing at a family the user can't access", () => {
    const ms = [member({ familyId: "fam1" })];
    expect(resolveActiveFamilyId(ms, undefined, "intruder")).toBe("fam1");
  });

  it("defaults to the newest membership (first in list) when nothing else matches", () => {
    const ms = [member({ familyId: "newest" }), member({ familyId: "older" })];
    expect(resolveActiveFamilyId(ms, undefined, undefined)).toBe("newest");
  });
});

describe("pickFamilyAccess", () => {
  it("returns the matching membership", () => {
    const ms = [member({ familyId: "fam1" }), member({ familyId: "fam2", memberId: "m2" })];
    expect(pickFamilyAccess(ms, "fam2", false).memberId).toBe("m2");
  });

  it("throws when the user has no membership in the target family", () => {
    const ms = [member({ familyId: "fam1" })];
    expect(() => pickFamilyAccess(ms, "other", false)).toThrow(/do not have access/i);
  });

  it("allows reads for a view-only member", () => {
    const ms = [member({ familyId: "fam1", permission: "view", isOwner: false, role: "teacher" })];
    expect(pickFamilyAccess(ms, "fam1", false).permission).toBe("view");
  });

  it("blocks writes for a view-only member", () => {
    const ms = [member({ familyId: "fam1", permission: "view", isOwner: false, role: "teacher" })];
    expect(() => pickFamilyAccess(ms, "fam1", true)).toThrow(/read-only/i);
  });

  it("allows writes for an editor", () => {
    const ms = [member({ familyId: "fam1", permission: "edit", isOwner: false, role: "co_parent" })];
    expect(pickFamilyAccess(ms, "fam1", true).role).toBe("co_parent");
  });
});

describe("isChildInScope", () => {
  it("allows any child for family-wide members", () => {
    expect(isChildInScope({ scope: "all", scopedChildIds: null }, "anyChild")).toBe(true);
  });

  it("allows only listed children for scoped members", () => {
    const access = { scope: "specific" as const, scopedChildIds: ["c1", "c2"] };
    expect(isChildInScope(access, "c1")).toBe(true);
    expect(isChildInScope(access, "c3")).toBe(false);
  });

  it("denies all children for a scoped member with an empty list", () => {
    expect(isChildInScope({ scope: "specific", scopedChildIds: [] }, "c1")).toBe(false);
    expect(isChildInScope({ scope: "specific", scopedChildIds: null }, "c1")).toBe(false);
  });
});
