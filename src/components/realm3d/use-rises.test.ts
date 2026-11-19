import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { TOAST_MS, useRises } from "./use-rises";
import type { KingdomState } from "@/lib/realm/kingdom-state";
import type { Overlay } from "@/lib/realm3d/frame";

/**
 * A building finished away from the Realm (the Side Quests page, or the retro-completion migration)
 * rises with the existing rise toast the next time the hero enters, once nothing else is on screen,
 * and is then marked announced so it never rises again. A grown-up visiting does none of it.
 */
const markBuildingsAnnounced = vi.fn<(childId: string, ids: unknown) => Promise<void>>();
vi.mock("@/lib/actions/improvements", () => ({
  markBuildingsAnnounced: (childId: string, ids: unknown) => markBuildingsAnnounced(childId, ids),
}));
// The real rule, watched: a rise asks it for the frame's own number of tracked objectives.
const objectiveCalls = vi.hoisted(() => [] as number[]);
vi.mock("@/lib/realm/objective", async (orig) => {
  const real = await orig<typeof import("@/lib/realm/objective")>();
  return {
    ...real,
    objectiveState: (...args: Parameters<typeof real.objectiveState>) => {
      objectiveCalls.push(args[1]);
      return real.objectiveState(...args);
    },
  };
});

const site = (id: string, label: string, complete: boolean) => ({ id, label, description: "", icon: "box", done: complete ? 3 : 1, total: 3, complete, raisedBy: null, raisedAt: null, stars: 0, maxStars: 9, deeds: [] });
const kingdom = {
  tone: "gentle",
  buildings: [site("well", "Village Well", true), site("mill", "Grain Mill", true), site("bridge", "River Bridge", false)],
} as unknown as KingdomState;

const PAUSE: Overlay = { kind: "pause" };
type Props = { isChild: boolean; overlay: Overlay | null; unannounced: string[]; regraded: boolean; tracked?: number };
const base: Props = { isChild: true, overlay: null, unannounced: ["well", "mill"], regraded: false };

function mount(props: Partial<Props> = {}) {
  const show = vi.fn();
  const hook = renderHook((p: Props) => useRises({ ...p, kingdom, childId: "c1", show }), { initialProps: { ...base, ...props } });
  return { show, ...hook };
}
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const later = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.clearAllMocks();
  objectiveCalls.length = 0;
  vi.useFakeTimers();
  markBuildingsAnnounced.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useRises", () => {
  it("plays each unannounced building in order, one toast time apart, then marks them all once", async () => {
    const { show } = mount();
    await flush();
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0][0]).toMatchObject({ rose: true, spoken: expect.stringContaining("The Village Well stands.") });
    // Not before the first has had its time on screen.
    await later(TOAST_MS - 1);
    expect(show).toHaveBeenCalledTimes(1);
    await later(1);
    expect(show).toHaveBeenCalledTimes(2);
    expect(show.mock.calls[1][0].spoken).toContain("The Grain Mill stands.");
    await later(TOAST_MS * 3);
    expect(show).toHaveBeenCalledTimes(2);
    expect(markBuildingsAnnounced).toHaveBeenCalledTimes(1);
    expect(markBuildingsAnnounced).toHaveBeenCalledWith("c1", ["well", "mill"]);
  });

  it("folds the next objective into a plain rise, as a board hand-up does", async () => {
    const { show } = mount({ unannounced: ["well"] });
    await flush();
    expect(show.mock.calls[0][0].spoken).toBe("The Village Well stands. Next: the River Bridge, with Carpenter Aldo.");
  });

  it("asks for the frame's own number of tracked objectives, so its Next: is a hand-up's", async () => {
    const { show } = mount({ unannounced: ["well"], tracked: 3 });
    await flush();
    expect(objectiveCalls).toEqual([3]);
    expect(show.mock.calls[0][0].spoken).toBe("The Village Well stands. Next: the River Bridge, with Carpenter Aldo.");
  });

  it("says the side quests already finished it when the migration did, in the same toast", async () => {
    const { show } = mount({ regraded: true });
    await flush();
    expect(show.mock.calls[0][0]).toMatchObject({
      rose: true, done: 3, total: 3,
      title: "Your side quests already finished the Village Well!", line: "It stands now!",
      spoken: "Your side quests already finished the Village Well. It stands now!",
    });
    await later(TOAST_MS);
    expect(show.mock.calls[1][0].spoken).toBe("Your side quests already finished the Grain Mill. It stands now!");
  });

  it("waits while an overlay is open, and plays when the last one closes", async () => {
    const { show, rerender } = mount({ overlay: { kind: "welcome" } });
    await later(TOAST_MS * 3);
    expect(show).not.toHaveBeenCalled();
    expect(markBuildingsAnnounced).not.toHaveBeenCalled();
    // The welcome hands on to the pause menu, say: still something on screen.
    rerender({ ...base, overlay: PAUSE });
    await later(TOAST_MS);
    expect(show).not.toHaveBeenCalled();
    rerender({ ...base, overlay: null });
    await flush();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("holds the next rise while an overlay opens between two, and shows no rise twice", async () => {
    const { show, rerender } = mount();
    await flush();
    expect(show).toHaveBeenCalledTimes(1);
    rerender({ ...base, overlay: PAUSE });
    await later(TOAST_MS * 3);
    expect(show).toHaveBeenCalledTimes(1);
    rerender({ ...base, overlay: null });
    await later(TOAST_MS);
    expect(show).toHaveBeenCalledTimes(2);
    expect(show.mock.calls[1][0].spoken).toContain("Grain Mill");
    expect(markBuildingsAnnounced).toHaveBeenCalledTimes(1);
  });

  it("does nothing, and marks nothing, for a grown-up visiting", async () => {
    const { show } = mount({ isChild: false });
    await later(TOAST_MS * 4);
    expect(show).not.toHaveBeenCalled();
    expect(markBuildingsAnnounced).not.toHaveBeenCalled();
  });

  it("does nothing when no building is owed", async () => {
    const { show } = mount({ unannounced: [] });
    await later(TOAST_MS * 2);
    expect(show).not.toHaveBeenCalled();
    expect(markBuildingsAnnounced).not.toHaveBeenCalled();
  });

  it("skips a building the kingdom does not list, and marks only those it showed", async () => {
    const { show } = mount({ unannounced: ["lighthouse", "mill"] });
    await flush();
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0][0].spoken).toContain("Grain Mill");
    expect(markBuildingsAnnounced).toHaveBeenCalledWith("c1", ["mill"]);
  });

  it("logs a failed mark and carries on: the rise was seen, and the world is not closed over it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    markBuildingsAnnounced.mockRejectedValueOnce(new Error("down"));
    const { show } = mount({ unannounced: ["well"] });
    await flush();
    expect(show).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
