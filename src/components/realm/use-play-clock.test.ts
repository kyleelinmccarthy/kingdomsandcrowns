import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlayClock } from "./use-play-clock";

const getRealmAccess = vi.fn();
const recordRealmPlay = vi.fn();
vi.mock("@/lib/actions/realm-play", () => ({
  getRealmAccess: (...a: unknown[]) => getRealmAccess(...a),
  recordRealmPlay: (...a: unknown[]) => recordRealmPlay(...a),
}));

/** A promise the test resolves by hand, so fake timers can be advanced while a `recordRealmPlay` call is still in flight. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

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

    // Regression: those 45 seconds were charged and must be zeroed on the
    // clock, not merely tracked in `pendingRef`. Without that, the same
    // seconds go on ticking, cross their natural 60-second boundary 15
    // seconds later, and bill a second minute for the one already paid for.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);
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

    // Mirror of the case above: an uncharged remainder is retained, not
    // zeroed, so the same seconds keep counting and still complete their own
    // 60-second boundary normally — the flush must not have reset the clock.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);
    expect(recordRealmPlay).toHaveBeenCalledWith("c1", expect.any(String), 1);
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

  it("a rounded-up flush absorbs a few seconds that land while the send is still in flight", async () => {
    // Round 2 regression: `settle`'s success path used to snapshot whether the
    // remainder had been rounded up *before* the `recordRealmPlay` await, then
    // unconditionally zero `secondsThisMinute` *after* it. Anything ticked in
    // during the round trip was silently discarded. The fix instead recomputes
    // `pendingRef`/`secondsThisMinute` from the live refs once the send
    // resolves, treating the whole thing as one running total of unbilled
    // seconds minus what was just paid for. The `deferred` here holds
    // `recordRealmPlay` open so timers can be advanced mid-flight before it
    // resolves.
    const send = deferred();
    recordRealmPlay.mockReturnValueOnce(send.promise);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 5, source: "earned" });

    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));

    // 45 seconds is at/above the round-up threshold: flushing charges a full
    // minute (60 seconds) for 45 seconds actually played, a 15-second buffer.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });

    let flushPromise!: Promise<void>;
    act(() => {
      flushPromise = result.current.flushPending();
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);
    expect(recordRealmPlay).toHaveBeenCalledWith("c1", expect.any(String), 1);

    // 3 more seconds of real, visible play land while the send is unresolved.
    // `recordingRef` holds the interval's own record path off for the whole
    // round trip, so this cannot trigger a second `recordRealmPlay` call by
    // itself — it only updates the refs the eventual continuation will read.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    send.resolve();
    await act(async () => {
      await flushPromise;
    });

    // Only the one call happened in total.
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);

    // The public surface has no direct getter for `secondsThisMinute`, so the
    // residual is pinned indirectly, the same way the file's existing
    // round-1 regression tests do it: by how much further time it takes to
    // cross the next 60-second boundary.
    //
    // NOTE ON THE BRIEF'S HAND-CHECK TABLE: the brief's row for this exact
    // scenario ("pending 0, 45s flushed (sent 1), 3 ticks land in flight")
    // predicted the clock would keep 3 seconds. Hand-checking the formula
    // above (and confirming empirically, see the task report) shows that is
    // wrong: 45 played + 3 in flight = 48 unbilled seconds, all still covered
    // by the 60 seconds (1 minute) just paid for — the 15-second round-up
    // buffer absorbs the 3 in-flight seconds with room to spare, so the
    // correct residual is 0 seconds / 0 pending, not 3. This test asserts
    // the actual (and, per the delta-accounting formula the source's own
    // comment describes, correct) behavior rather than the brief's figure.
    // 59 more seconds must not be enough to cross a fresh boundary...
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);

    // ...but the 60th does, sending exactly 1 fresh minute — proving the
    // residual right after resolution really was 0, not 3 (which would have
    // crossed 57 seconds in, three seconds earlier than this).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(2);
    expect(recordRealmPlay).toHaveBeenNthCalledWith(2, "c1", expect.any(String), 1);
  });

  it("nets the correct pending minutes and residual seconds when a minute rolls over mid-flight", async () => {
    const send = deferred();
    recordRealmPlay.mockReturnValueOnce(send.promise);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 5, source: "earned" });

    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });

    let flushPromise!: Promise<void>;
    act(() => {
      flushPromise = result.current.flushPending();
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);
    expect(recordRealmPlay).toHaveBeenCalledWith("c1", expect.any(String), 1);

    // 20 more seconds land while the send is in flight: 45+20=65 crosses the
    // minute's own natural 60-second boundary, so `tickClock` fires its own
    // "record" event and `pendingRef` gets incremented — but `recordingRef`
    // still holds off a second `settle` call until this round trip finishes.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    send.resolve();
    await act(async () => {
      await flushPromise;
    });

    // The mid-flight roll-over did not trigger a send of its own: still only
    // the one call in total.
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);

    // 65 seconds were played, 60 were paid for: 5 seconds should remain and 0
    // whole minutes should be pending. Pin both indirectly: 54 more seconds
    // (59 since resolution) must not be enough to cross the boundary...
    await act(async () => {
      await vi.advanceTimersByTimeAsync(54_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);

    // ...but the 55th is, and it must send exactly 1 minute, not 2 — proving
    // pending netted to 0 (a stray pending 1 left over from the mid-flight
    // roll-over would have sent 2 here instead).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(2);
    expect(recordRealmPlay).toHaveBeenNthCalledWith(2, "c1", expect.any(String), 1);
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
