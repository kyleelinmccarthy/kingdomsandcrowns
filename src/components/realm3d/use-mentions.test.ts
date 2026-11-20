import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { mentionsKey, useMentions } from "./use-mentions";
import type { RecentQuest } from "@/lib/realm/mentions";

const RECENT: RecentQuest[] = [
  { assignmentId: "a-ink", title: "Volcanoes, part 2", material: "ink" },
  { assignmentId: "a-stone", title: "Fractions", material: "stone" },
];
const TODAY = "2026-11-19";

const setup = (over: { childId?: string | null; today?: string; recent?: RecentQuest[] } = {}) =>
  renderHook(() => useMentions({ childId: "c1", today: TODAY, recent: RECENT, ...over }));

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMentions", () => {
  it("hands a villager a line about a quest in their trade, and remembers it for the day", () => {
    const { result } = setup();
    const line = result.current("hesper");
    expect(line).toContain("Volcanoes, part 2");
    expect(JSON.parse(sessionStorage.getItem(mentionsKey("c1", TODAY))!)).toEqual(["a-ink"]);
  });

  it("keys the memory by hero and day", () => {
    expect(mentionsKey("c1", TODAY)).toBe("realm-mentions:c1:2026-11-19");
  });

  it("is null when nothing is in the villager's trade, and remembers nothing", () => {
    const { result } = setup();
    expect(result.current("ivy")).toBeNull();
    expect(sessionStorage.getItem(mentionsKey("c1", TODAY))).toBeNull();
  });

  it("never gives a second villager the quest the first one mentioned", () => {
    const { result } = setup({ recent: [{ assignmentId: "a-ink", title: "Spelling", material: "ink" }] });
    // Hesper and Wren both care about ink; only the first to be asked hears of it.
    expect(result.current("hesper")).toContain("Spelling");
    expect(result.current("wren")).toBeNull();
  });

  it("does not repeat a quest to the same villager on a second visit the same day", () => {
    const { result } = setup({ recent: [{ assignmentId: "a-ink", title: "Spelling", material: "ink" }] });
    expect(result.current("hesper")).not.toBeNull();
    expect(result.current("hesper")).toBeNull();
  });

  it("remembers across a reload in the same tab (sessionStorage), but not into another day", () => {
    const first = setup({ recent: [{ assignmentId: "a-ink", title: "Spelling", material: "ink" }] });
    expect(first.result.current("hesper")).not.toBeNull();
    first.unmount();
    const reloaded = setup({ recent: [{ assignmentId: "a-ink", title: "Spelling", material: "ink" }] });
    expect(reloaded.result.current("hesper")).toBeNull();
    const tomorrow = setup({ today: "2026-11-20", recent: [{ assignmentId: "a-ink", title: "Spelling", material: "ink" }] });
    expect(tomorrow.result.current("hesper")).not.toBeNull();
  });

  it("keeps hero's days apart", () => {
    const one = setup({ childId: "c1", recent: [{ assignmentId: "a-ink", title: "Spelling", material: "ink" }] });
    expect(one.result.current("hesper")).not.toBeNull();
    const two = setup({ childId: "c2", recent: [{ assignmentId: "a-ink", title: "Spelling", material: "ink" }] });
    expect(two.result.current("hesper")).not.toBeNull();
  });

  it("falls back to memory when sessionStorage throws, still never repeating within the visit", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = setup({ recent: [{ assignmentId: "a-ink", title: "Spelling", material: "ink" }] });
    expect(result.current("hesper")).toContain("Spelling");
    expect(result.current("wren")).toBeNull();
  });

  it("ignores a stored value that is not a list of ids", () => {
    sessionStorage.setItem(mentionsKey("c1", TODAY), "{not json");
    const { result } = setup();
    expect(result.current("hesper")).not.toBeNull();
    sessionStorage.setItem(mentionsKey("c1", TODAY), JSON.stringify({ a: 1 }));
    expect(setup().result.current("hesper")).not.toBeNull();
  });

  it("says nothing without a hero or a server day", () => {
    expect(setup({ childId: null }).result.current("hesper")).toBeNull();
    expect(renderHook(() => useMentions({ childId: "c1", today: undefined, recent: RECENT })).result.current("hesper")).toBeNull();
  });

  it("is a stable function across renders, so the frame can depend on it", () => {
    const { result, rerender } = setup();
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
