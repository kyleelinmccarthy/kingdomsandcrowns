import { describe, it, expect, vi, afterEach } from "vitest";
import { orElse, rewardLines, withRewards } from "./quest-rewards";
import type { MaterialId } from "@/lib/realm/materials";

describe("withRewards", () => {
  it("attaches each assignment's reward and leaves the others as they were", () => {
    const a = { assignment: { id: "a1" } };
    const b = { assignment: { id: "a2" } };
    const out = withRewards([a, b], { a1: { made: "+1 Ink", minutes: 5 } });
    expect(out[0]).toEqual({ assignment: { id: "a1" }, rewards: { made: "+1 Ink", minutes: 5 } });
    expect(out[1]).toBe(b);
    expect(a).toEqual({ assignment: { id: "a1" } });
  });

  it("is the assignments untouched for no rewards, and never reads an inherited key", () => {
    const a = { assignment: { id: "constructor" } };
    expect(withRewards([a], {})).toEqual([a]);
  });
});

const bal = (over: Partial<Record<MaterialId, number>> = {}): Record<MaterialId, number> => ({ stone: 0, ink: 0, herbs: 0, thread: 0, dye: 0, timber: 0, ...over });
const row = (materialId: string, amount: number, sourceAssignmentId: string | null) => ({ materialId, amount, sourceAssignmentId });

describe("rewardLines", () => {
  it("words each earned row as '+n Material', with the pinned plan's hint when it wants the material", () => {
    const input = { built: {}, raised: new Set<string>(), balance: bal({ ink: 1 }) };
    // The Statue costs 4 stone and 2 ink: one ink in hand leaves 1 ink to find.
    expect(rewardLines([row("ink", 1, "a1")], input, "village-statue")).toEqual(new Map([["a1", "+1 Ink · the Statue needs 1 more"]]));
  });

  it("falls back to the nearest plan, and ignores a pin on a finished plan", () => {
    const input = { built: { "village-statue": 3 }, raised: new Set<string>(), balance: bal({ ink: 1 }) };
    expect(rewardLines([row("ink", 1, "a1")], input, "village-statue").get("a1")).toBe("+1 Ink · the Chronicle Hall needs 3 more");
  });

  it("points timber at the nearest short plan overall", () => {
    const input = { built: {}, raised: new Set<string>(), balance: bal({ timber: 1 }) };
    expect(rewardLines([row("timber", 1, "a1")], input, null).get("a1")).toBe("+1 Timber · the Chronicle Hall needs 5 more");
  });

  it("has no hint when no plan wants it, and skips rows with no quest or a material the catalog lacks", () => {
    // Six herbs build the Fountain outright (RD-u: herbs-primary); every other plan is short only of its own primary.
    const input = { built: {}, raised: new Set<string>(), balance: bal({ herbs: 6 }) };
    const out = rewardLines([row("herbs", 6, "a1"), row("herbs", 1, null), row("mithril", 1, "a2")], input, null);
    expect([...out.entries()]).toEqual([["a1", "+6 Herbs"]]);
  });
});

describe("orElse", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs the failure once, naming what could not be read, and answers the fallback", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("db down");
    expect(orElse("the plans", null)(boom)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]).toEqual(["Could not read the plans", boom]);
  });

  it("works as a promise's catch", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(Promise.reject(new Error("x")).catch(orElse("it", { ok: false }))).resolves.toEqual({ ok: false });
  });
});
