import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { heldClearsFor, useTroubleBounty } from "./use-trouble-bounty";
import { FLUSH_IDLE_MS, MAX_FLUSH_FAILURES } from "@/lib/realm/spells/bounty";

const getTroubleBounty = vi.fn();
const recordTroubleClears = vi.fn();
vi.mock("@/lib/actions/realm-play", () => ({
  getTroubleBounty: (...a: unknown[]) => getTroubleBounty(...a),
  recordTroubleClears: (...a: unknown[]) => recordTroubleClears(...a),
}));

const STATUS = { enabled: true, capMinutes: 5, subCapMinutes: 5, paidMinutes: 0, remainingMinutes: 5, clearsToday: 0, paidHomes: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  getTroubleBounty.mockResolvedValue(STATUS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTroubleBounty — a batch the server keeps refusing", () => {
  it("is given up after a few tries, so it stops holding back every later clear", async () => {
    // A permanent refusal: an expired session, or a date the server no longer accepts.
    recordTroubleClears.mockRejectedValue(new Error("That date doesn't look right."));
    const { result } = renderHook(() => useTroubleBounty({ enabled: true, childId: "c1" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => void result.current.claim("rim-0"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_IDLE_MS * 3 * (MAX_FLUSH_FAILURES + 3));
    });
    expect(recordTroubleClears).toHaveBeenCalledTimes(MAX_FLUSH_FAILURES);

    // The next clear goes out on its own, not behind the refused one.
    recordTroubleClears.mockReset();
    recordTroubleClears.mockResolvedValue({ awarded: 1, status: { ...STATUS, paidMinutes: 1, remainingMinutes: 4, clearsToday: 1, paidHomes: ["rim-1"] } });
    act(() => void result.current.claim("rim-1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(recordTroubleClears).toHaveBeenCalledTimes(1);
    expect(recordTroubleClears.mock.calls[0][2]).toEqual(["rim-1"]);
  });

  it("still retries a batch that fails once and then goes through", async () => {
    recordTroubleClears.mockRejectedValueOnce(new Error("offline"));
    recordTroubleClears.mockResolvedValue({ awarded: 1, status: { ...STATUS, paidMinutes: 1, remainingMinutes: 4, clearsToday: 1, paidHomes: ["rim-0"] } });
    const { result } = renderHook(() => useTroubleBounty({ enabled: true, childId: "c1" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => void result.current.claim("rim-0"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_IDLE_MS * 3 + 10);
    });
    expect(recordTroubleClears).toHaveBeenCalledTimes(2);
    expect(recordTroubleClears.mock.calls[1][2]).toEqual(["rim-0"]);
  });
});

describe("useTroubleBounty — a reload with clears still in the batch", () => {
  const SPENT = { ...STATUS, paidMinutes: 5, remainingMinutes: 0, clearsToday: 5 };
  let sent: { url: string; body: string }[] = [];
  beforeEach(() => {
    sent = [];
    getTroubleBounty.mockResolvedValue(SPENT);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: (url: string, body: string) => {
        sent.push({ url, body });
        return true;
      },
    });
  });

  it("sends them on the way out, and not a second time from the unmount", async () => {
    const { result, unmount } = renderHook(() => useTroubleBounty({ enabled: true, childId: "c1" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // Nothing left to earn today, so these wait in the batch rather than going at once.
    act(() => void result.current.claim("rim-0"));
    act(() => void result.current.claim("place-ringstones"));
    expect(recordTroubleClears).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("pagehide"));
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("/api/realm/troubles");
    expect(JSON.parse(sent[0].body)).toEqual({ childId: "c1", date: expect.any(String), homeIds: ["rim-0", "place-ringstones"] });

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_IDLE_MS * 2);
    });
    expect(recordTroubleClears).not.toHaveBeenCalled();
  });

  it("sends nothing for a visiting grown-up", async () => {
    const { result } = renderHook(() => useTroubleBounty({ enabled: false, childId: "c1" }));
    act(() => void result.current.claim("rim-0"));
    window.dispatchEvent(new Event("pagehide"));
    expect(sent).toEqual([]);
  });
});

describe("useTroubleBounty — the tab's note of each clear, for a reload that beats the server", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    recordTroubleClears.mockResolvedValue({ awarded: 0, status: STATUS });
  });

  it("notes the hero's clear in this tab at once, and a reload's seed has it before the server does", () => {
    const { result } = renderHook(() => useTroubleBounty({ enabled: true, childId: "c1" }));
    act(() => void result.current.claim("rim-0"));
    const held = heldClearsFor("c1", [], true);
    expect(held.clears).toEqual([{ homeId: "rim-0", agoMs: expect.any(Number) }]);
    expect(held.clears[0].agoMs).toBeLessThan(1_000);
  });

  it("merges it with the server's record, the newer per home", () => {
    window.sessionStorage.setItem("realm3d:clears:c1", JSON.stringify([{ homeId: "rim-0", at: Date.now() - 2_000 }]));
    const held = heldClearsFor("c1", [{ homeId: "rim-0", agoMs: 40_000 }, { homeId: "rim-1", agoMs: 9_000 }], true);
    expect(held.clears).toEqual(expect.arrayContaining([{ homeId: "rim-1", agoMs: 9_000 }]));
    expect(held.clears.find((c) => c.homeId === "rim-0")!.agoMs).toBeLessThan(3_000);
  });

  it("writes and reads nothing on a grown-up's visit: they see the server's record alone", () => {
    const { result } = renderHook(() => useTroubleBounty({ enabled: false, childId: "c1" }));
    act(() => void result.current.claim("rim-0"));
    expect(window.sessionStorage.getItem("realm3d:clears:c1")).toBeNull();
    window.sessionStorage.setItem("realm3d:clears:c1", JSON.stringify([{ homeId: "rim-2", at: Date.now() }]));
    expect(heldClearsFor("c1", [{ homeId: "rim-1", agoMs: 9_000 }], false).clears).toEqual([{ homeId: "rim-1", agoMs: 9_000 }]);
  });
});
