import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the actor so we exercise the child-branch of the access gates without a DB.
const getActor = vi.fn();
vi.mock("@/lib/auth/actor", () => ({ getActor: () => getActor() }));

// The grown-up branch reads the child's row and the member's rows: each select resolves to the
// next result queued by the test, in the order the gate reads them.
const queued: unknown[][] = [];
vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "innerJoin", "limit"]) chain[m] = () => chain;
  chain.then = (resolve: (rows: unknown[]) => unknown) => resolve(queued.shift() ?? []);
  return { db: chain };
});
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "u1" } }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { requireChildAccess, requireFamilyAccess } from "./access";

beforeEach(() => {
  getActor.mockReset();
  queued.length = 0;
});

describe("requireChildAccess — a grown-up's read of a hero (the Chronicle reads through this)", () => {
  const member = (scope: "all" | "specific") => ({
    memberId: "m1",
    familyId: "f1",
    familyName: "Fam",
    role: "co_parent",
    permission: "view",
    scope,
    createdAt: new Date(),
  });

  it("refuses a banished hero, even for a plain read", async () => {
    getActor.mockResolvedValue({ kind: "adult", userId: "u1" });
    queued.push([{ familyId: "f1", banishedAt: new Date() }]);
    await expect(requireChildAccess("c1")).rejects.toThrow(/banished/i);
  });

  it("refuses a hero outside the grown-up's granted scope", async () => {
    getActor.mockResolvedValue({ kind: "adult", userId: "u1" });
    queued.push([{ familyId: "f1", banishedAt: null }], [member("specific")], [{ childId: "someone-else" }]);
    await expect(requireChildAccess("c1")).rejects.toThrow(/outside your granted access/i);
  });

  it("admits a hero inside the grown-up's scope to read, which is what the refusals above are measured against", async () => {
    getActor.mockResolvedValue({ kind: "adult", userId: "u1" });
    queued.push([{ familyId: "f1", banishedAt: null }], [member("specific")], [{ childId: "c1" }]);
    const { access, familyId } = await requireChildAccess("c1");
    expect(familyId).toBe("f1");
    expect(access.permission).toBe("view");
  });
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
