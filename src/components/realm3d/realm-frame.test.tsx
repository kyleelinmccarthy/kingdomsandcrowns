import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";
import type { AccessResult } from "@/lib/utils/realm-access";

/**
 * The door: the gate decides, the game opens, the clock closes it. The canvas is a stub (the
 * real one imports `three`) and the server actions are mocks, so this is the frame's logic
 * alone, end to end.
 */
const access = vi.hoisted(() => ({ result: null as AccessResult | null, recorded: [] as number[] }));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="canvas" /> }));
vi.mock("@/lib/actions/realm-settings", () => ({ setRealmDepth: vi.fn(async () => {}), updateRealmSettings: vi.fn(async () => {}) }));
vi.mock("@/lib/actions/realm-play", () => ({
  getRealmAccess: vi.fn(async () => access.result),
  recordRealmPlay: vi.fn(async (_c: string, m: number) => void access.recorded.push(m)),
  getTroubleBounty: vi.fn(async () => ({ enabled: false, capMinutes: 0, subCapMinutes: 0, paidMinutes: 0, remainingMinutes: 0, clearsToday: 0, paidHomes: [] })),
  recordTroubleClears: vi.fn(),
}));
vi.mock("@/lib/realm3d/worldgen", async (orig) => {
  const real = await orig<typeof import("@/lib/realm3d/worldgen")>();
  return { ...real, realmWorld: () => ({ landmarks: [], roads: [], biomeAt: () => "meadow", heightAt: () => 0 }) };
});

import { RealmFrame, type RealmFrameProps } from "./realm-frame";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  access.recorded = [];
});

const props = (isChildView: boolean): RealmFrameProps => ({
  realm: {
    childId: "demo-child-1",
    isChildView,
    kingdom: { tone: "gentle", buildings: [] },
    castleType: "campsite",
    banners: 0,
    profile: DEFAULT_LEARNING_PROFILE,
    depth: "full",
    toneMode: "gentle",
  },
  heroName: "Emma",
  avatar: null,
  spellbook: null,
  viewer: isChildView ? "child" : "parent",
  castleUnlocked: false,
});

async function open(isChildView: boolean, result: AccessResult) {
  access.result = result;
  render(<RealmFrame {...props(isChildView)} />);
  await act(async () => {});
}

describe("the Realm's door", () => {
  it("covers the whole app, over its banner and bottom bar, and tells the app's popups to stand down", async () => {
    await open(true, { allowed: true, minutesRemaining: 30, source: "earned" });
    expect(document.body.querySelector(":scope > .r3-root")).not.toBeNull();
    expect(document.body.hasAttribute("data-realm-open")).toBe(true);
    cleanup();
    expect(document.body.hasAttribute("data-realm-open")).toBe(false);
  });

  it("keeps a child out with the gate's own words when it is shut", async () => {
    await open(true, { allowed: false, reason: "school_hours" });
    expect(screen.getByRole("heading", { name: "It's school time." })).toBeInTheDocument();
    expect(screen.queryByTestId("canvas")).toBeNull();
  });

  it("lets a child in, against their minutes", async () => {
    await open(true, { allowed: true, minutesRemaining: 30, source: "earned" });
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
    expect(screen.getByText("30 min left")).toBeInTheDocument();
  });

  it("lets a grown-up in when the child's gate is shut, and says so instead of spending", async () => {
    await open(false, { allowed: false, reason: "cap_reached" });
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
    expect(screen.getByText("Closed for Emma now")).toBeInTheDocument();
  });

  it("goes quiet, not closed, when the clock runs out and the gate says quiet", async () => {
    vi.useFakeTimers();
    await open(true, { allowed: true, minutesRemaining: 1, source: "earned" });
    access.result = { allowed: true, minutesRemaining: 0, source: "quiet" };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Well played, Emma!" })).toBeNull();
  });

  it("closes when the clock runs out on the day's cap", async () => {
    vi.useFakeTimers();
    await open(true, { allowed: true, minutesRemaining: 1, source: "earned" });
    access.result = { allowed: false, reason: "cap_reached" };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.getByRole("heading", { name: "Well played, Emma!" })).toBeInTheDocument();
    expect(screen.getByText("The Realm will be waiting tomorrow.")).toBeInTheDocument();
    expect(screen.queryByTestId("canvas")).toBeNull();
  });

  it("until the quiet gate is drawn, a child at 0 walks into the quiet world, and its clock never shuts it", async () => {
    vi.useFakeTimers();
    await open(true, { allowed: true, minutesRemaining: 0, source: "quiet" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
    expect(access.recorded).toEqual([]);
  });

  it("says how minutes are earned when minutes are what the child is missing (earningLines)", async () => {
    access.result = { allowed: false, reason: "no_minutes" };
    const p = props(true);
    const earning = { enabled: true, accessMode: "earned" as const, earnedMinutesPerQuest: 5, dailyCapMinutes: 30, troubleBonusCapMinutes: 0 };
    render(<RealmFrame {...p} realm={{ ...p.realm, earning }} />);
    await act(async () => {});
    await act(async () => {});
    expect(screen.getByText("Finish a quest and you earn 5 more minutes here, up to 30 a day.")).toBeInTheDocument();
  });

  it("says nothing of earning when the gate is shut for another reason", async () => {
    access.result = { allowed: false, reason: "school_hours" };
    const p = props(true);
    const earning = { enabled: true, accessMode: "earned" as const, earnedMinutesPerQuest: 5, dailyCapMinutes: 30, troubleBonusCapMinutes: 5 };
    render(<RealmFrame {...p} realm={{ ...p.realm, earning }} />);
    await act(async () => {});
    await act(async () => {});
    expect(screen.queryByText(/Finish a quest and you earn/)).toBeNull();
  });
});
