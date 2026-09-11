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

  it("flushPending retries a failed minute immediately, without waiting for the next boundary", async () => {
    recordRealmPlay.mockRejectedValueOnce(new Error("The ledger is unreachable."));
    recordRealmPlay.mockResolvedValueOnce(undefined);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 5, source: "earned" });
    const onClose = vi.fn();

    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 3, onClose }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe("The ledger is unreachable.");

    await act(async () => {
      await result.current.flushPending();
    });

    expect(recordRealmPlay).toHaveBeenCalledTimes(2);
    expect(recordRealmPlay).toHaveBeenNthCalledWith(2, "c1", expect.any(String), 1);
    expect(result.current.error).toBe("");
  });

  it("flushPending settles the minute in progress, rounded half-up", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 4, source: "earned" });

    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));

    // 45 visible seconds: no 60-second boundary crossed, so nothing has been
    // recorded and there is no pending whole minute to rescue.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(recordRealmPlay).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.flushPending();
    });
    expect(recordRealmPlay).toHaveBeenCalledWith("c1", expect.any(String), 1);
  });

  it("flushPending charges nothing for a visit under half a minute", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 4, source: "earned" });

    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000);
    });
    await act(async () => {
      await result.current.flushPending();
    });
    expect(recordRealmPlay).not.toHaveBeenCalled();
  });

  it("counts nothing while paused and refreshes access once when unpaused", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "school_hours" });
    const onClose = vi.fn();
    const { result, rerender } = renderHook(({ paused }) => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 1, onClose, paused }), { initialProps: { paused: true } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(recordRealmPlay).not.toHaveBeenCalled();
    expect(getRealmAccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.warning).toBe(false);
    expect(result.current.minutesRemaining).toBe(1);

    rerender({ paused: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(getRealmAccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("school_hours");
  });

  it("exposes the access source, starting from the initial one and following refreshes", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 9, source: "recess" });
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 10, onClose: vi.fn(), initialSource: "earned" }));
    expect(result.current.source).toBe("earned");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.source).toBe("recess");
  });
});
