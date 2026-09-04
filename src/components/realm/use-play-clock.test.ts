import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlayClock } from "./use-play-clock";

const getRealmAccess = vi.fn();
const recordRealmPlay = vi.fn();
vi.mock("@/lib/actions/realm-play", () => ({
  getRealmAccess: (...a: unknown[]) => getRealmAccess(...a),
  recordRealmPlay: (...a: unknown[]) => recordRealmPlay(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePlayClock", () => {
  it("records a minute after 60 seconds and closes with the server's reason", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "school_hours" });
    const onClose = vi.fn();

    renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 2, onClose }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(recordRealmPlay).toHaveBeenCalledWith("c1", expect.any(String), 1);
    expect(getRealmAccess).toHaveBeenCalledWith("c1", expect.any(String), expect.any(String));
    expect(onClose).toHaveBeenCalledWith("school_hours");
  });

  it("carries a failed minute into the next record", async () => {
    recordRealmPlay.mockRejectedValueOnce(new Error("The ledger is unreachable."));
    recordRealmPlay.mockResolvedValueOnce(undefined);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 1, source: "earned" });
    const onClose = vi.fn();

    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 3, onClose }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(recordRealmPlay).toHaveBeenCalledTimes(1);
    expect(recordRealmPlay).toHaveBeenNthCalledWith(1, "c1", expect.any(String), 1);
    expect(result.current.error).toBe("The ledger is unreachable.");
    expect(getRealmAccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // The next 60-second boundary retries the failed minute along with the new one.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(2);
    expect(recordRealmPlay).toHaveBeenNthCalledWith(2, "c1", expect.any(String), 2);
    expect(result.current.error).toBe("");
  });
});
