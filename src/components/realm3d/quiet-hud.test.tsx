import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils/speech", () => ({ speak: vi.fn() }));

import { speak } from "@/lib/utils/speech";
import { useWake, WAKE_MS, WakeToast } from "./quiet-hud";

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
