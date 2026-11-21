// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: vi.fn(),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
vi.mock("@/lib/services/realm-chronicle", () => ({ loadChronicle: vi.fn() }));
vi.mock("@/lib/services/realm-world-state", () => ({ loadFoundPages: vi.fn() }));

import { requireChildAccess, type FamilyAccess } from "@/lib/auth/access";
import { loadChronicle } from "@/lib/services/realm-chronicle";
import { loadFoundPages } from "@/lib/services/realm-world-state";
import { getChronicle } from "./realm-chronicle";

const WEEKS = [{ weekStart: "2026-11-16", entries: [] }];
const LORE = [{ id: "the-first-lock" as const, title: "The First Lock", text: "Long ago a smith made a lock with no key." }];

function as(access: Pick<FamilyAccess, "userId" | "permission">) {
  vi.mocked(requireChildAccess).mockResolvedValue({ access: access as FamilyAccess, familyId: "f1" });
}

beforeEach(() => {
  vi.clearAllMocks();
  as({ userId: "u1", permission: "edit" });
  vi.mocked(loadChronicle).mockResolvedValue(WEEKS);
  vi.mocked(loadFoundPages).mockResolvedValue(LORE);
});

describe("getChronicle", () => {
  it("checks read access only (a visiting grown-up may read), then loads the hero's Chronicle", async () => {
    await expect(getChronicle("c1")).resolves.toEqual({ weeks: WEEKS, canSeal: true, lore: LORE });
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

  it("gives the found pages to the hero, to a view-only visitor, and to a hero with the locks off", async () => {
    // The pages are the hero's to keep: no one's role or the locks switch hides them (R-G7).
    for (const who of [{ userId: "child:c1", permission: "edit" }, { userId: "u2", permission: "view" }, { userId: "u1", permission: "edit" }] as const) {
      as(who);
      expect((await getChronicle("c1")).lore).toEqual(LORE);
    }
    expect(loadFoundPages).toHaveBeenCalledTimes(3);
    expect(loadFoundPages).toHaveBeenCalledWith("c1");
  });

  it("reads the weeks and the pages together, not one after the other", async () => {
    let releaseWeeks!: (w: typeof WEEKS) => void;
    vi.mocked(loadChronicle).mockReturnValue(new Promise((r) => (releaseWeeks = r)));
    const pending = getChronicle("c1");
    await vi.waitFor(() => expect(loadFoundPages).toHaveBeenCalledWith("c1"));
    releaseWeeks(WEEKS);
    await expect(pending).resolves.toMatchObject({ weeks: WEEKS, lore: LORE });
  });

  it("loads nothing when access is refused", async () => {
    vi.mocked(requireChildAccess).mockRejectedValue(new Error("Unauthorized"));
    await expect(getChronicle("c1")).rejects.toThrow("Unauthorized");
    expect(loadChronicle).not.toHaveBeenCalled();
    expect(loadFoundPages).not.toHaveBeenCalled();
  });
});
