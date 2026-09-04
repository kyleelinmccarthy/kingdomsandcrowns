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

  it("sets an error and does not retry the same minute when recording fails", async () => {
    recordRealmPlay.mockRejectedValue(new Error("The ledger is unreachable."));
    const onClose = vi.fn();

    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 3, onClose }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(recordRealmPlay).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe("The ledger is unreachable.");
    expect(result.current.warning).toBe(false);
    expect(getRealmAccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // A few more visible seconds pass without crossing another 60-second
    // boundary: the failed minute is not retried until the next one lapses.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);
  });
});
