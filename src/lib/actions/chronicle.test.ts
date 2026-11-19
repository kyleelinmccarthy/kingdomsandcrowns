// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/access", () => ({ requireChildAccess: vi.fn() }));
vi.mock("@/lib/services/realm-chronicle", () => ({ loadChronicle: vi.fn() }));

import { requireChildAccess } from "@/lib/auth/access";
import { loadChronicle } from "@/lib/services/realm-chronicle";
import { getChronicle } from "./chronicle";

const WEEKS = [{ weekStart: "2026-11-16", entries: [] }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireChildAccess).mockResolvedValue({ access: {} as never, familyId: "f1" });
  vi.mocked(loadChronicle).mockResolvedValue(WEEKS);
});

describe("getChronicle", () => {
  it("checks read access only (a visiting grown-up may read), then loads the hero's Chronicle", async () => {
    await expect(getChronicle("c1")).resolves.toBe(WEEKS);
    expect(requireChildAccess).toHaveBeenCalledTimes(1);
    expect(requireChildAccess).toHaveBeenCalledWith("c1");
    expect(vi.mocked(requireChildAccess).mock.calls[0][1]?.write).toBeFalsy();
    expect(loadChronicle).toHaveBeenCalledWith("c1");
  });

  it("loads nothing when access is refused", async () => {
    vi.mocked(requireChildAccess).mockRejectedValue(new Error("Unauthorized"));
    await expect(getChronicle("c1")).rejects.toThrow("Unauthorized");
    expect(loadChronicle).not.toHaveBeenCalled();
  });
});
