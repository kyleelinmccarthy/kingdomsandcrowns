import { beforeEach, describe, expect, it, vi } from "vitest";
import { levelFromXp } from "@/lib/utils/level";

/** What the in-game wardrobe is told it may offer: the same facts a save is checked against. */
const requireChildAccess = vi.fn(async () => ({ familyId: "f1", access: { userId: "child:c1", permission: "edit" } }));
vi.mock("@/lib/auth/access", () => ({ requireChildAccess: (...a: unknown[]) => (requireChildAccess as (...x: unknown[]) => unknown)(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const seasons = [
  { id: "s1", ordinal: 1, startDate: "2025-09-01", completedAt: "2026-06-01T00:00:00.000Z", crownId: "crown-copper" },
  { id: "s2", ordinal: 2, startDate: "2026-09-01", completedAt: null, crownId: null },
];
vi.mock("@/lib/services/crowns", () => ({ loadSeasons: vi.fn(async () => seasons) }));
const copper = { id: "crown-copper", label: "Copper Circlet", color: "#b87333", seasonLabel: "2025–26" };

/** Each `db.select()` answers the next queued rows, whether awaited directly or through `.limit()`. */
const queued: unknown[][] = [];
vi.mock("@/lib/db", () => {
  const query = () => {
    const rows = queued.shift() ?? [];
    const q = {
      from: () => q,
      where: () => q,
      limit: async () => rows,
      then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(rows).then(ok, bad),
    };
    return q;
  };
  return { db: { select: () => query() } };
});

import { getWardrobe } from "./avatar";

beforeEach(() => {
  queued.length = 0;
});

describe("getWardrobe", () => {
  it("hands the wardrobe the hero's level, badges, quest unlocks and finished seasons' crowns, reading only", async () => {
    queued.push([{ id: "c1", familyId: "f1", currentXp: 450 }], [{ badgeId: "b-first-quest" }], [{ itemId: "cape-royal" }]);
    const w = await getWardrobe("c1");
    expect(w).toEqual({ level: levelFromXp(450), earnedBadgeIds: ["b-first-quest"], questUnlockedItems: ["cape-royal"], crowns: [copper] });
    expect(requireChildAccess).toHaveBeenCalledWith("c1");
  });
});
