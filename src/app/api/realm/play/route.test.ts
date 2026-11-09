import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The play clock's page-hide beacon. The access gate and the charge are the seams: the actor is
 * mocked as the hero, another hero, or a grown-up, and the charge is captured so a refusal can be
 * shown to have charged NOTHING.
 */
const requireChildAccess = vi.fn();
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: (...a: unknown[]) => requireChildAccess(...a),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
// The same charge as the server action. What it writes (the day opened first, then the minute)
// is tested against a real database in `services/realm-day-db.test.ts`.
const chargeRealmPlay = vi.fn(async () => {});
vi.mock("@/lib/services/realm-play", () => ({
  chargeRealmPlay: (...a: unknown[]) => (chargeRealmPlay as (...x: unknown[]) => unknown)(...a),
}));

// The server's day (`realmNow`): the only day a charge is written on.
vi.mock("@/lib/services/realm-clock", () => ({ realmNow: async () => ({ date: "2026-11-09", timeOfDay: "10:00" }) }));

import { POST } from "./route";

const child = { access: { userId: "child:c1" }, familyId: "f1" };
const parent = { access: { userId: "u-parent" }, familyId: "f1" };

function beacon(body: unknown, headers: Record<string, string> = { origin: "http://localhost:3000", host: "localhost:3000" }) {
  return new Request("http://localhost:3000/api/realm/play", {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const good = { childId: "c1", minutes: 1 };

beforeEach(() => {
  requireChildAccess.mockReset();
  chargeRealmPlay.mockClear();
});

describe("POST /api/realm/play — the page-hide charge", () => {
  it("charges the hero's own minute through the ledger", async () => {
    requireChildAccess.mockResolvedValue(child);
    const res = await POST(beacon(good));
    expect(res.status).toBe(204);
    expect(requireChildAccess).toHaveBeenCalledWith("c1", { write: true });
    expect(chargeRealmPlay).toHaveBeenCalledWith("c1", "2026-11-09", 1);
  });

  it("charges today whatever date a tab sends (one opened before the deploy still sends one)", async () => {
    requireChildAccess.mockResolvedValue(child);
    const res = await POST(beacon({ ...good, date: "2099-01-01" }));
    expect(res.status).toBe(204);
    expect(chargeRealmPlay).toHaveBeenCalledWith("c1", "2026-11-09", 1);
  });

  it("never charges a visiting grown-up", async () => {
    requireChildAccess.mockResolvedValue(parent);
    const res = await POST(beacon(good));
    expect(res.status).toBe(403);
    expect(chargeRealmPlay).not.toHaveBeenCalled();
  });

  it("refuses whoever the gate refuses (another hero, no session)", async () => {
    requireChildAccess.mockRejectedValue(new Error("This hero can only act for themselves."));
    const res = await POST(beacon(good));
    expect(res.status).toBe(403);
    expect(chargeRealmPlay).not.toHaveBeenCalled();
  });

  it("refuses a malformed charge before asking the gate", async () => {
    for (const body of ["not json", { ...good, minutes: 0 }, { ...good, minutes: 31 }, { ...good, minutes: 1.5 }, { ...good, childId: 7 }]) {
      const res = await POST(beacon(body));
      expect(res.status).toBe(400);
    }
    expect(requireChildAccess).not.toHaveBeenCalled();
    expect(chargeRealmPlay).not.toHaveBeenCalled();
  });

  it("refuses a request from another site", async () => {
    requireChildAccess.mockResolvedValue(child);
    const res = await POST(beacon(good, { origin: "https://evil.example", host: "localhost:3000" }));
    expect(res.status).toBe(403);
    const res2 = await POST(beacon(good, { "sec-fetch-site": "cross-site", host: "localhost:3000" }));
    expect(res2.status).toBe(403);
    expect(chargeRealmPlay).not.toHaveBeenCalled();
  });
});
