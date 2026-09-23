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
  recordRealmPlay: vi.fn(async (_c: string, _d: string, m: number) => void access.recorded.push(m)),
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

  it("closes, as the flat Realm does, when the clock runs out", async () => {
    vi.useFakeTimers();
    await open(true, { allowed: true, minutesRemaining: 0, source: "earned" });
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("heading", { name: "Well played, Emma!" })).toBeInTheDocument();
    expect(screen.getByText("Every quest you complete banks minutes here.")).toBeInTheDocument();
    expect(screen.queryByTestId("canvas")).toBeNull();
  });
});
