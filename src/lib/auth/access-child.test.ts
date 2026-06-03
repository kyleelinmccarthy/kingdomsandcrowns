import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the actor so we exercise the child-branch of the access gates without a DB.
const getActor = vi.fn();
vi.mock("@/lib/auth/actor", () => ({ getActor: () => getActor() }));

import { requireChildAccess, requireFamilyAccess } from "./access";

beforeEach(() => {
  getActor.mockReset();
});

describe("access gates — child actor", () => {
  it("grants a child edit access to their OWN profile, scoped to themselves", async () => {
    getActor.mockResolvedValue({ kind: "child", childId: "c1", familyId: "f1" });
    const { access, familyId } = await requireChildAccess("c1", { write: true });
    expect(familyId).toBe("f1");
    expect(access.permission).toBe("edit");
    expect(access.scope).toBe("specific");
    expect(access.scopedChildIds).toEqual(["c1"]);
    expect(access.isOwner).toBe(false);
  });

  it("denies a child access to a DIFFERENT child", async () => {
    getActor.mockResolvedValue({ kind: "child", childId: "c1", familyId: "f1" });
    await expect(requireChildAccess("c2")).rejects.toThrow(/themselves/i);
  });

  it("denies a child any family-level access", async () => {
    getActor.mockResolvedValue({ kind: "child", childId: "c1", familyId: "f1" });
    await expect(requireFamilyAccess()).rejects.toThrow(/grown-ups/i);
  });

  it("rejects an unauthenticated actor", async () => {
    getActor.mockResolvedValue(null);
    await expect(requireChildAccess("c1")).rejects.toThrow(/unauthorized/i);
    await expect(requireFamilyAccess()).rejects.toThrow(/unauthorized/i);
  });
});
