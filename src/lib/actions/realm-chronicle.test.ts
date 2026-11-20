// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: vi.fn(),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
vi.mock("@/lib/services/realm-chronicle", () => ({ loadChronicle: vi.fn() }));

import { requireChildAccess, type FamilyAccess } from "@/lib/auth/access";
import { loadChronicle } from "@/lib/services/realm-chronicle";
import { getChronicle } from "./realm-chronicle";

const WEEKS = [{ weekStart: "2026-11-16", entries: [] }];

function as(access: Pick<FamilyAccess, "userId" | "permission">) {
  vi.mocked(requireChildAccess).mockResolvedValue({ access: access as FamilyAccess, familyId: "f1" });
}

beforeEach(() => {
  vi.clearAllMocks();
  as({ userId: "u1", permission: "edit" });
  vi.mocked(loadChronicle).mockResolvedValue(WEEKS);
});

describe("getChronicle", () => {
  it("checks read access only (a visiting grown-up may read), then loads the hero's Chronicle", async () => {
    await expect(getChronicle("c1")).resolves.toEqual({ weeks: WEEKS, canSeal: true });
    expect(requireChildAccess).toHaveBeenCalledTimes(1);
    expect(requireChildAccess).toHaveBeenCalledWith("c1");
    expect(vi.mocked(requireChildAccess).mock.calls[0][1]?.write).toBeFalsy();
    expect(loadChronicle).toHaveBeenCalledWith("c1");
  });

  it("lets only a grown-up with edit access seal: never the hero, never a view-only grown-up", async () => {
    as({ userId: "child:c1", permission: "edit" });
    expect((await getChronicle("c1")).canSeal).toBe(false);
    as({ userId: "u2", permission: "view" });
    expect((await getChronicle("c1")).canSeal).toBe(false);
    as({ userId: "u1", permission: "edit" });
    expect((await getChronicle("c1")).canSeal).toBe(true);
  });

  it("loads nothing when access is refused", async () => {
    vi.mocked(requireChildAccess).mockRejectedValue(new Error("Unauthorized"));
    await expect(getChronicle("c1")).rejects.toThrow("Unauthorized");
    expect(loadChronicle).not.toHaveBeenCalled();
  });
});
