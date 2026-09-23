import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTroubleBounty } from "./use-trouble-bounty";
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
