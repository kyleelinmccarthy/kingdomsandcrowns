import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The troubles' page-hide beacon. The access gate and the award are the seams: the actor is
 * mocked as the hero or a grown-up, and the award is captured so a refusal can be shown to have
 * written NOTHING.
 */
const requireChildAccess = vi.fn();
vi.mock("@/lib/auth/access", () => ({
  requireChildAccess: (...a: unknown[]) => requireChildAccess(...a),
  isChildActor: (access: { userId: string }) => access.userId.startsWith("child:"),
}));
const awardTroubleClears = vi.fn(async () => ({ awarded: 0, status: {} }));
vi.mock("@/lib/services/realm-play", () => ({
  awardTroubleClears: (...a: unknown[]) => (awardTroubleClears as (...x: unknown[]) => unknown)(...a),
}));

import { POST } from "./route";

const child = { access: { userId: "child:c1" }, familyId: "f1" };
const parent = { access: { userId: "u-parent" }, familyId: "f1" };
const today = () => new Date().toISOString().slice(0, 10);

function beacon(body: unknown, headers: Record<string, string> = { origin: "http://localhost:3000", host: "localhost:3000" }) {
  return new Request("http://localhost:3000/api/realm/troubles", {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  requireChildAccess.mockReset();
  awardTroubleClears.mockClear();
});

describe("POST /api/realm/troubles — clears sent on the way out", () => {
  it("awards the hero's own waiting clears, through the same award as the action", async () => {
    requireChildAccess.mockResolvedValue(child);
    const res = await POST(beacon({ childId: "c1", date: today(), homeIds: ["rim-0", "place-ringstones"] }));
    expect(res.status).toBe(204);
    expect(requireChildAccess).toHaveBeenCalledWith("c1", { write: true });
    expect(awardTroubleClears).toHaveBeenCalledWith("c1", today(), ["rim-0", "place-ringstones"]);
  });

  it("writes nothing for a visiting grown-up", async () => {
    requireChildAccess.mockResolvedValue(parent);
    const res = await POST(beacon({ childId: "c1", date: today(), homeIds: ["rim-0"] }));
    expect(res.status).toBe(403);
    expect(awardTroubleClears).not.toHaveBeenCalled();
  });

  it("refuses whoever the gate refuses", async () => {
    requireChildAccess.mockRejectedValue(new Error("no"));
    const res = await POST(beacon({ childId: "c1", date: today(), homeIds: ["rim-0"] }));
    expect(res.status).toBe(403);
    expect(awardTroubleClears).not.toHaveBeenCalled();
  });

  it("refuses what the action would refuse, before asking the gate", async () => {
    const good = { childId: "c1", date: today(), homeIds: ["rim-0"] };
    for (const body of [
      "not json",
      { ...good, date: "2020-01-01" },
      { ...good, homeIds: [] },
      { ...good, homeIds: Array.from({ length: 13 }, () => "rim-0") },
      { ...good, homeIds: ["place-anything"] },
      { ...good, childId: 7 },
    ]) {
      expect((await POST(beacon(body))).status).toBe(400);
    }
    expect(requireChildAccess).not.toHaveBeenCalled();
    expect(awardTroubleClears).not.toHaveBeenCalled();
  });

  it("refuses another site's page", async () => {
    const res = await POST(beacon({ childId: "c1", date: today(), homeIds: ["rim-0"] }, { origin: "https://evil.example", host: "localhost:3000" }));
    expect(res.status).toBe(403);
    expect(awardTroubleClears).not.toHaveBeenCalled();
  });
});
