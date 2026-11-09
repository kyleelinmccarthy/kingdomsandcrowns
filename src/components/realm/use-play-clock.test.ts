import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlayClock } from "./use-play-clock";

const getRealmAccess = vi.fn();
const recordRealmPlay = vi.fn();
const refundIdleMinutes = vi.fn();
vi.mock("@/lib/actions/realm-play", () => ({
  getRealmAccess: (...a: unknown[]) => getRealmAccess(...a),
  recordRealmPlay: (...a: unknown[]) => recordRealmPlay(...a),
  refundIdleMinutes: (...a: unknown[]) => refundIdleMinutes(...a),
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

    expect(recordRealmPlay).toHaveBeenCalledWith("c1", 1);
    expect(getRealmAccess).toHaveBeenCalledWith("c1");
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
    expect(recordRealmPlay).toHaveBeenNthCalledWith(1, "c1", 1);
    expect(result.current.error).toBe("The ledger is unreachable.");
    expect(getRealmAccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // The next 60-second boundary retries the failed minute along with the new one.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(2);
    expect(recordRealmPlay).toHaveBeenNthCalledWith(2, "c1", 2);
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
    expect(recordRealmPlay).toHaveBeenNthCalledWith(2, "c1", 1);
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
    expect(recordRealmPlay).toHaveBeenCalledWith("c1", 1);

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
    expect(recordRealmPlay).toHaveBeenCalledWith("c1", 1);
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
    expect(recordRealmPlay).toHaveBeenCalledWith("c1", 1);

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
    expect(recordRealmPlay).toHaveBeenNthCalledWith(2, "c1", 1);
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
    expect(recordRealmPlay).toHaveBeenCalledWith("c1", 1);

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
    expect(recordRealmPlay).toHaveBeenNthCalledWith(2, "c1", 1);
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

describe("usePlayClock — the quiet world at 0 minutes", () => {
  it("at 0 asks the server once (latched until it answers) and goes quiet when it says quiet", async () => {
    const answer = deferred<{ allowed: true; minutesRemaining: 0; source: "quiet" }>();
    getRealmAccess.mockReturnValueOnce(answer.promise);
    const onClose = vi.fn();
    const onQuiet = vi.fn();
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 0, onClose, onQuiet, initialSource: "earned" }));
    expect(result.current.quiet).toBe(false);

    // Five ticks at 0 while the answer is on its way: one question, not five.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(getRealmAccess).toHaveBeenCalledTimes(1);

    answer.resolve({ allowed: true, minutesRemaining: 0, source: "quiet" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.quiet).toBe(true);
    expect(result.current.source).toBe("quiet");
    expect(onQuiet).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    // Quiet: no seconds, no records, no more questions.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(recordRealmPlay).not.toHaveBeenCalled();
    expect(getRealmAccess).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("at 0 closes when the server answers cap_reached", async () => {
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "cap_reached" });
    const onClose = vi.fn();
    const onQuiet = vi.fn();
    renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 0, onClose, onQuiet, initialSource: "earned" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(onClose).toHaveBeenCalledWith("cap_reached");
    expect(onQuiet).not.toHaveBeenCalled();
  });

  it("the last minute's record answered quiet: the world goes quiet instead of closing", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "quiet" });
    const onClose = vi.fn();
    const onQuiet = vi.fn();
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 1, onClose, onQuiet }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.warning).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(55_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledWith("c1", 1);
    expect(result.current.quiet).toBe(true);
    expect(result.current.minutesRemaining).toBe(0);
    expect(result.current.warning).toBe(false); // no "last minute" banner over the quiet world
    expect(onQuiet).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);
  });

  it("the last minute's record answered cap_reached: the Realm closes", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "cap_reached" });
    const onClose = vi.fn();
    renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 1, onClose }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(onClose).toHaveBeenCalledWith("cap_reached");
  });

  it("starts quiet from a quiet entry, never counts, and wakes when a refresh finds minutes", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 3, source: "earned" });
    const onClose = vi.fn();
    const onWake = vi.fn();
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 0, onClose, onWake, initialSource: "quiet" }));
    expect(result.current.quiet).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(recordRealmPlay).not.toHaveBeenCalled();
    expect(getRealmAccess).not.toHaveBeenCalled();

    // A side quest paid: the frame re-asks the gate.
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.quiet).toBe(false);
    expect(result.current.minutesRemaining).toBe(3);
    expect(result.current.source).toBe("earned");
    expect(onWake).toHaveBeenCalledWith(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledWith("c1", 1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("at 0 with the server unreachable, asks with backoff, not every second", async () => {
    getRealmAccess.mockRejectedValue(new Error("The Realm lost its way for a moment."));
    const onClose = vi.fn();
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 0, onClose, initialSource: "earned" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(getRealmAccess).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe("The Realm lost its way for a moment.");
    // Retries wait 5, then 15 seconds: three questions in half a minute, not thirty.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(getRealmAccess).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(24_000);
    });
    expect(getRealmAccess).toHaveBeenCalledTimes(3);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("at 0 with the server unreachable, eventually closes as before", async () => {
    getRealmAccess.mockRejectedValue(new Error("The Realm lost its way for a moment."));
    const onClose = vi.fn();
    renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 0, onClose, initialSource: "recess" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    // No answer within about a minute: the old local close, whose `no_minutes` the 3D frame
    // reads as recess over for a recess source.
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("no_minutes");
    const asked = getRealmAccess.mock.calls.length;
    expect(asked).toBeLessThanOrEqual(5);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(getRealmAccess).toHaveBeenCalledTimes(asked);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("an answer after a failed ask still goes quiet, and nothing closes", async () => {
    getRealmAccess.mockRejectedValueOnce(new Error("The Realm lost its way for a moment.")).mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "quiet" });
    const onClose = vi.fn();
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 0, onClose, initialSource: "earned" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getRealmAccess).toHaveBeenCalledTimes(2);
    expect(result.current.quiet).toBe(true);
    expect(result.current.error).toBe("");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("takes the last-minute banner down on the first empty tick, while the answer is still coming", async () => {
    recordRealmPlay.mockRejectedValueOnce(new Error("The ledger is unreachable."));
    getRealmAccess.mockReturnValueOnce(new Promise(() => {}));
    const { result, unmount } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 1, onClose: vi.fn() }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.warning).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(51_000);
    });
    expect(getRealmAccess).toHaveBeenCalledTimes(1);
    expect(result.current.warning).toBe(false);
    unmount(); // its unpaid minute must not reach a later test's page-hide beacon
  });

  it("does not ask on empty while the last minute's record is still in flight (its own answer is coming)", async () => {
    const send = deferred();
    recordRealmPlay.mockReturnValueOnce(send.promise);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "quiet" });
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 1, onClose: vi.fn() }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(70_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);
    expect(getRealmAccess).not.toHaveBeenCalled();
    send.resolve();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getRealmAccess).toHaveBeenCalledTimes(1);
    expect(result.current.quiet).toBe(true);
  });

  it("wakes on the gate check that follows a pause, while quiet", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 4, source: "earned" });
    const onWake = vi.fn();
    const { result, rerender } = renderHook(({ paused }) => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 0, onClose: vi.fn(), onWake, paused, initialSource: "quiet" }), {
      initialProps: { paused: false },
    });
    rerender({ paused: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(getRealmAccess).not.toHaveBeenCalled();
    rerender({ paused: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(getRealmAccess).toHaveBeenCalledTimes(1);
    expect(onWake).toHaveBeenCalledWith(4);
    expect(result.current.quiet).toBe(false);
  });

  it("charges nothing for quiet time when the page is hidden", async () => {
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true, writable: true });
    const { unmount } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 0, onClose: vi.fn(), initialSource: "quiet" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(55_000);
    });
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(sendBeacon).not.toHaveBeenCalled();
    unmount();
    delete (navigator as { sendBeacon?: unknown }).sendBeacon;
  });
});

describe("usePlayClock — leaving by reload, tab close or a typed URL (pagehide)", () => {
  // Those exits unload the document without running React's cleanups, so the unmount flush never
  // runs; the only thing that fires is `pagehide`, and the only request that survives it is a beacon.
  let sendBeacon: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true, writable: true });
  });
  afterEach(() => {
    delete (navigator as { sendBeacon?: unknown }).sendBeacon;
  });

  const hide = () => act(() => void window.dispatchEvent(new Event("pagehide")));
  const sent = () => sendBeacon.mock.calls.map(([url, body]) => ({ url, ...JSON.parse(body as string) }));

  it("beacons the minute in progress, rounded half-up, to the ledger's route", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 1, source: "earned" });
    const { unmount } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 1, onClose: vi.fn() }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(55_000);
    });
    hide();
    expect(sent()).toEqual([{ url: "/api/realm/play", childId: "c1", minutes: 1 }]);

    // Booked as paid: a page restored from the back-forward cache, then left, charges nothing twice.
    hide();
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(recordRealmPlay).not.toHaveBeenCalled();
  });

  it("beacons a whole minute whose record failed, with the minute in progress", async () => {
    recordRealmPlay.mockRejectedValue(new Error("The ledger is unreachable."));
    const { unmount } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(95_000);
    });
    hide();
    expect(sent()).toEqual([expect.objectContaining({ minutes: 2 })]);
    unmount();
  });

  it("charges nothing for under half a minute", async () => {
    const { unmount } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    hide();
    expect(sendBeacon).not.toHaveBeenCalled();
    unmount();
  });

  it("never beacons for a clock that is off (a grown-up's visit)", async () => {
    const { unmount } = renderHook(() => usePlayClock({ enabled: false, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(55_000);
    });
    hide();
    expect(sendBeacon).not.toHaveBeenCalled();
    unmount();
  });

  it("does not beacon again the minutes a record already in flight is carrying", async () => {
    const send = deferred();
    recordRealmPlay.mockReturnValueOnce(send.promise);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 3, source: "earned" });
    const { unmount } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));
    // The 60th second sends a minute; 40 more seconds land while it is in flight.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100_000);
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);
    hide();
    expect(sent()).toEqual([expect.objectContaining({ minutes: 1 })]); // the 40 seconds, not the minute in flight
    send.resolve();
    unmount();
  });
});

describe("usePlayClock — the last minute's record fails, then the clock closes", () => {
  it("still charges that minute when the Realm closes", async () => {
    recordRealmPlay.mockRejectedValueOnce(new Error("The ledger is unreachable."));
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "no_minutes" });
    const onClose = vi.fn();
    const { result, unmount } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 1, onClose }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(onClose).toHaveBeenCalledWith("no_minutes");
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);

    // The Realm closes: the frame unmounts, and its flush is the failed minute's only retry.
    await act(async () => {
      await result.current.flushPending();
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(2);
    expect(recordRealmPlay).toHaveBeenNthCalledWith(2, "c1", 1);
    unmount();
  });
});

describe("usePlayClock — idle time given back (spec §4.6)", () => {
  const play = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  it("rewinds the minute in progress locally and asks the server nothing", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));
    await play(10_000);
    act(() => result.current.noteInput());
    await play(40_000);
    let refunded = -1;
    await act(async () => {
      refunded = await result.current.giveBackIdle();
    });
    expect(refunded).toBe(0);
    expect(refundIdleMinutes).not.toHaveBeenCalled();
    // Only the 10 played seconds are left in progress: leaving now charges nothing.
    await act(async () => {
      await result.current.flushPending();
    });
    expect(recordRealmPlay).not.toHaveBeenCalled();
  });

  it("drops an unwritten idle minute from pending, so neither a flush nor the page-hide beacon sends it", async () => {
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true, writable: true });
    recordRealmPlay.mockRejectedValue(new Error("The ledger is unreachable."));
    const { result, unmount } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));
    await play(20_000);
    act(() => result.current.noteInput());
    await play(70_000); // the 60th second's record fails: one idle minute pending, 30 seconds in progress
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);
    await act(async () => {
      expect(await result.current.giveBackIdle()).toBe(0);
    });
    expect(refundIdleMinutes).not.toHaveBeenCalled();
    expect(result.current.minutesRemaining).toBe(5);
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(sendBeacon).not.toHaveBeenCalled(); // 20 played seconds: under half a minute
    unmount();
    delete (navigator as { sendBeacon?: unknown }).sendBeacon;
  });

  it("asks the server for written idle minutes and refreshes to its count", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 3, source: "earned" });
    refundIdleMinutes.mockResolvedValue({ refunded: 2 });
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));
    await play(120_000); // two minutes, both written, nobody touching anything
    expect(recordRealmPlay).toHaveBeenCalledTimes(2);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 5, source: "earned" });
    let refunded = -1;
    await act(async () => {
      refunded = await result.current.giveBackIdle();
    });
    expect(refundIdleMinutes).toHaveBeenCalledWith("c1", 2);
    expect(refunded).toBe(2);
    expect(result.current.minutesRemaining).toBe(5);
  });

  it("leaves the minutes charged, and says nothing, when the refund fails", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 3, source: "earned" });
    refundIdleMinutes.mockRejectedValue(new Error("The ledger is unreachable."));
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));
    await play(120_000);
    let refunded = -1;
    await act(async () => {
      refunded = await result.current.giveBackIdle();
    });
    expect(refunded).toBe(0);
    expect(result.current.error).toBe("");
    expect(result.current.minutesRemaining).toBe(3);
  });

  it("keeps the refund's answer, and shows no error, when the re-check after it fails", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 3, source: "earned" });
    refundIdleMinutes.mockResolvedValue({ refunded: 2 });
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));
    await play(120_000);
    getRealmAccess.mockRejectedValue(new Error("The ledger is unreachable."));
    await act(async () => {
      expect(await result.current.giveBackIdle()).toBe(2);
    });
    expect(result.current.error).toBe("");
  });

  it("counts a record in flight as written: refunded once it lands", async () => {
    const send = deferred();
    recordRealmPlay.mockResolvedValueOnce(undefined).mockReturnValueOnce(send.promise);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 3, source: "earned" });
    refundIdleMinutes.mockResolvedValue({ refunded: 2 });
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));
    await play(120_000); // the second minute's record is still in flight
    let asked!: Promise<number>;
    act(() => {
      asked = result.current.giveBackIdle();
    });
    expect(refundIdleMinutes).not.toHaveBeenCalled(); // not before the spend it gives back has landed
    await act(async () => {
      send.resolve();
      expect(await asked).toBe(2);
    });
    expect(refundIdleMinutes).toHaveBeenCalledWith("c1", 2);
    await act(async () => {
      await result.current.flushPending();
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(2); // nothing left over to charge again
  });

  it("drops a record in flight that fails instead of refunding it, and never charges it again", async () => {
    const send = deferred();
    recordRealmPlay.mockResolvedValueOnce(undefined).mockReturnValueOnce(send.promise.then(() => Promise.reject(new Error("The ledger is unreachable."))));
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 3, source: "earned" });
    refundIdleMinutes.mockResolvedValue({ refunded: 1 });
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));
    await play(120_000);
    let asked!: Promise<number>;
    act(() => {
      asked = result.current.giveBackIdle();
    });
    await act(async () => {
      send.resolve();
      expect(await asked).toBe(1);
    });
    expect(refundIdleMinutes).toHaveBeenCalledWith("c1", 1); // only the minute that was written
    recordRealmPlay.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.flushPending();
    });
    expect(recordRealmPlay).toHaveBeenCalledTimes(2); // the failed idle minute is not retried
  });

  it("puts back on the clock a failed in-flight minute it drops, so the count is not one low", async () => {
    const send = deferred();
    recordRealmPlay.mockResolvedValueOnce(undefined).mockReturnValueOnce(send.promise.then(() => Promise.reject(new Error("The ledger is unreachable."))));
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 3, source: "earned" });
    refundIdleMinutes.mockRejectedValue(new Error("The ledger is unreachable.")); // no server answer to adopt
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 5, onClose: vi.fn() }));
    await play(120_000); // 3 after the first record's answer, 2 once the second minute ticks
    expect(result.current.minutesRemaining).toBe(2);
    let asked!: Promise<number>;
    act(() => {
      asked = result.current.giveBackIdle();
    });
    await act(async () => {
      send.resolve();
      expect(await asked).toBe(0);
    });
    expect(result.current.minutesRemaining).toBe(3);
  });

  it("minutes that ran out while idle come back, and the quiet world wakes", async () => {
    recordRealmPlay.mockResolvedValue(undefined);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "quiet" });
    refundIdleMinutes.mockResolvedValue({ refunded: 1 });
    const onQuiet = vi.fn();
    const onWake = vi.fn();
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 1, onClose: vi.fn(), onQuiet, onWake, initialSource: "earned" }));
    await play(120_000); // the last minute is written untouched, and the server says quiet
    expect(onQuiet).toHaveBeenCalledOnce();
    expect(result.current.quiet).toBe(true);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 1, source: "earned" });
    await act(async () => {
      expect(await result.current.giveBackIdle()).toBe(1);
    });
    expect(refundIdleMinutes).toHaveBeenCalledWith("c1", 1);
    expect(onWake).toHaveBeenCalledWith(1);
    expect(result.current.quiet).toBe(false);
    expect(result.current.minutesRemaining).toBe(1);
  });

  it("has nothing to give back in the quiet world", async () => {
    const { result } = renderHook(() => usePlayClock({ enabled: true, childId: "c1", initialMinutes: 0, onClose: vi.fn(), initialSource: "quiet" }));
    await play(120_000);
    await act(async () => {
      expect(await result.current.giveBackIdle()).toBe(0);
    });
    expect(refundIdleMinutes).not.toHaveBeenCalled();
  });
});
