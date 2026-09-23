import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The play clock's page-hide beacon. The access gate and the ledger are the seams: the actor is
 * mocked as the hero, another hero, or a grown-up, and the ledger write is captured so a refusal
 * can be shown to have charged NOTHING.
 */
const requireChildAccess = vi.fn();
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: (...a: unknown[]) => requireChildAccess(...a),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
// The real ledger code (`chargeRealmPlay` → `appendLedger`), over a database that only records
// the rows it is asked to insert.
const inserted: unknown[] = [];
vi.mock("@/lib/db", () => ({
  db: { insert: () => ({ values: async (v: unknown) => void inserted.push(v) }) },
}));

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

const good = { childId: "c1", date: "2026-09-23", minutes: 1 };

beforeEach(() => {
  requireChildAccess.mockReset();
  inserted.length = 0;
});

describe("POST /api/realm/play — the page-hide charge", () => {
  it("charges the hero's own minute through the ledger", async () => {
    requireChildAccess.mockResolvedValue(child);
    const res = await POST(beacon(good));
    expect(res.status).toBe(204);
    expect(requireChildAccess).toHaveBeenCalledWith("c1", { write: true });
    expect(inserted).toEqual([expect.objectContaining({ childId: "c1", date: "2026-09-23", kind: "spent", minutes: 1 })]);
  });

  it("never charges a visiting grown-up", async () => {
    requireChildAccess.mockResolvedValue(parent);
    const res = await POST(beacon(good));
    expect(res.status).toBe(403);
    expect(inserted).toEqual([]);
  });

  it("refuses whoever the gate refuses (another hero, no session)", async () => {
    requireChildAccess.mockRejectedValue(new Error("This hero can only act for themselves."));
    const res = await POST(beacon(good));
    expect(res.status).toBe(403);
    expect(inserted).toEqual([]);
  });

  it("refuses a malformed charge before asking the gate", async () => {
    for (const body of ["not json", { ...good, minutes: 0 }, { ...good, minutes: 31 }, { ...good, minutes: 1.5 }, { ...good, date: "tomorrow" }, { ...good, childId: 7 }]) {
      const res = await POST(beacon(body));
      expect(res.status).toBe(400);
    }
    expect(requireChildAccess).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });

  it("refuses a request from another site", async () => {
    requireChildAccess.mockResolvedValue(child);
    const res = await POST(beacon(good, { origin: "https://evil.example", host: "localhost:3000" }));
    expect(res.status).toBe(403);
    const res2 = await POST(beacon(good, { "sec-fetch-site": "cross-site", host: "localhost:3000" }));
    expect(res2.status).toBe(403);
    expect(inserted).toEqual([]);
  });
});
