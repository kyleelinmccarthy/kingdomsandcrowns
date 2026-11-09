import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils/speech", () => ({ speak: vi.fn() }));

import { speak } from "@/lib/utils/speech";
import { useQuietWorld, useWake, WAKE_MS, WakeToast } from "./quiet-hud";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("the wake toast", () => {
  it("says the minutes that woke the world, by the clock", () => {
    render(<WakeToast wake={{ id: 1, minutes: 3 }} />);
    expect(screen.getByRole("status")).toHaveTextContent("+3 minutes — the Realm wakes up!");
  });

  it("says nothing when nothing woke it", () => {
    const { container } = render(<WakeToast wake={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("useWake: the play clock's onWake", () => {
  it("shows the toast, then takes it down", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useWake(false));
    act(() => result.current.show(2));
    expect(result.current.wake).toEqual({ id: 1, minutes: 2 });
    expect(speak).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(WAKE_MS));
    expect(result.current.wake).toBeNull();
  });

  it("reads it aloud for a child who has read-aloud on", () => {
    const { result } = renderHook(() => useWake(true));
    act(() => result.current.show(1));
    expect(speak).toHaveBeenCalledWith("+1 minute — the Realm wakes up!");
  });
});

describe("useQuietWorld: the composition root's quiet wiring", () => {
  function setup(clockOn: boolean, quiet: boolean) {
    const rest = vi.fn();
    const refresh = vi.fn(async () => true);
    const askGate = { current: () => {} };
    const hook = renderHook((p: { quiet: boolean }) => useQuietWorld({ clockOn, clock: { quiet: p.quiet, refresh }, rest, askGate }), { initialProps: { quiet } });
    return { hook, rest, refresh, askGate };
  }

  it("a quiet child's clock rests troubles, riding and recess, and the saddle is told", () => {
    const { hook, rest } = setup(true, true);
    expect(hook.result.current).toEqual({ quiet: true, awake: { troubles: false, riding: false, recess: false } });
    expect(rest).toHaveBeenLastCalledWith(true);
    hook.rerender({ quiet: false });
    expect(hook.result.current.awake.riding).toBe(true);
    expect(rest).toHaveBeenLastCalledWith(false);
  });

  it("a grown-up (no clock) is never quiet", () => {
    const { hook } = setup(false, true);
    expect(hook.result.current.quiet).toBe(false);
    expect(hook.result.current.awake).toEqual({ troubles: true, riding: true, recess: true });
  });

  it("points the side quests' gate check at the clock's refresh", () => {
    const { askGate, refresh } = setup(true, true);
    askGate.current();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
