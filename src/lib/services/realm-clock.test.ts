import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The Realm's one clock: the family's timezone, read on the server. The child's family is the
 * seam (`getTimezoneForChild`), so the device's own date and zone never enter the answer.
 */
const getTimezoneForChild = vi.fn();
vi.mock("@/lib/services/family-timezone", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/family-timezone")>()),
  getTimezoneForChild: (...a: unknown[]) => getTimezoneForChild(...a),
}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { nowInZone, realmNow } from "./realm-clock";

// 22:30 on the 9th in Denver (MST, UTC-7); 18:30 on the 10th in Auckland (NZDT, UTC+13).
const instant = new Date("2026-11-10T05:30:00Z");

beforeEach(() => getTimezoneForChild.mockReset());

describe("nowInZone", () => {
  it("is the family's date and 24-hour time, not the server's or the device's", () => {
    expect(nowInZone("America/Denver", instant)).toEqual({ date: "2026-11-09", timeOfDay: "22:30" });
    expect(nowInZone("Pacific/Auckland", instant)).toEqual({ date: "2026-11-10", timeOfDay: "18:30" });
  });

  it("writes midnight as 00, never 24", () => {
    expect(nowInZone("UTC", new Date("2026-11-10T00:05:00Z"))).toEqual({ date: "2026-11-10", timeOfDay: "00:05" });
  });

  it("falls back to the default zone for one Intl does not know", () => {
    expect(nowInZone("Denver", instant)).toEqual(nowInZone("America/Denver", instant));
  });
});

describe("realmNow", () => {
  it("reads the child's family timezone", async () => {
    getTimezoneForChild.mockResolvedValue("Pacific/Auckland");
    expect(await realmNow("c1", instant)).toEqual({ date: "2026-11-10", timeOfDay: "18:30" });
    expect(getTimezoneForChild).toHaveBeenCalledWith("c1");
  });
});
