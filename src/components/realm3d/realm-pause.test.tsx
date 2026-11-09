import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

/**
 * Pausing that protects a child's minutes. The frame is mounted whole, with the real play clock
 * (`usePlayClock`) running on fake timers, so "the clock stopped" means what it means in the game:
 * no minute is written to the ledger. The canvas is a stub (the real one imports `three`); the
 * tests play the scene's half of the bus — `onLookFreed`, `setLookRequester` — as the scene will.
 */
const handed: { bus?: HudBus } = {};
vi.mock("next/dynamic", () => ({
  default: () =>
    function Dynamic(props: Record<string, unknown>) {
      handed.bus = props.bus as HudBus;
      return <div data-testid="canvas" />;
    },
}));
vi.mock("@/lib/actions/realm-settings", () => ({
  setRealmDepth: vi.fn(async () => {}),
  updateRealmSettings: vi.fn(async () => {}),
  setTutorialStep: vi.fn(async () => {}),
  markRealmHelpSeen: vi.fn(async () => {}),
}));
vi.mock("@/lib/actions/realm-sound", () => ({ saveRealmSound: vi.fn(async () => {}) }));
vi.mock("@/lib/actions/seasons", () => ({ markCeremonySeen: vi.fn(async () => {}) }));
vi.mock("@/lib/actions/spells", () => ({ getSpellbook: vi.fn(async () => null) }));
vi.mock("@/lib/actions/realm", () => ({ getRealmKingdom: vi.fn() }));
vi.mock("@/lib/actions/quest-assignments", () => ({ getAssignmentQuestInfo: vi.fn(async () => null) }));
vi.mock("@/lib/actions/realm-play", () => ({
  getRealmAccess: vi.fn(async () => ({ allowed: true, minutesRemaining: 239, source: "earned" })),
  recordRealmPlay: vi.fn(async () => {}),
  refundIdleMinutes: vi.fn(async (_childId: string, minutes: number) => ({ refunded: minutes })),
  getTroubleBounty: vi.fn(async () => ({ enabled: false, capMinutes: 0, subCapMinutes: 0, paidMinutes: 0, remainingMinutes: 0, clearsToday: 0, paidHomes: [] })),
  recordTroubleClears: vi.fn(),
}));
vi.mock("@/lib/realm3d/worldgen", async (orig) => {
  const real = await orig<typeof import("@/lib/realm3d/worldgen")>();
  return { ...real, realmWorld: () => ({ landmarks: [], roads: [], biomeAt: () => "meadow", heightAt: () => 0 }) };
});

import { getRealmAccess, recordRealmPlay, refundIdleMinutes } from "@/lib/actions/realm-play";
import { LOOK_KEY } from "@/lib/realm3d/look-settings";
import { RealmGame, type RealmData } from "./realm-game";

const realm: RealmData = {
  childId: "demo-child-1",
  isChildView: true,
  kingdom: { tone: "gentle", buildings: [] },
  castleType: "campsite",
  banners: 0,
  profile: DEFAULT_LEARNING_PROFILE,
  depth: "full",
  toneMode: "gentle",
};

/** A child with 240 minutes. A minute goes to the ledger after every 60 seconds of play. */
function mountChild() {
  render(<RealmGame heroName="Emma" realm={realm} entry={{ minutes: 240, visit: null, source: "earned" }} castleUnlocked={false} />);
  return handed.bus!;
}

/** A grown-up visiting Emma: no clock of their own. */
function mountParent() {
  render(
    <RealmGame
      heroName="Emma"
      viewer="parent"
      realm={{ ...realm, isChildView: false }}
      entry={{ minutes: 0, visit: { minutes: 40, closedBecause: null }, source: null }}
      castleUnlocked={false}
    />,
  );
  return handed.bus!;
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/** The browser hiding or showing the tab. */
function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => void document.dispatchEvent(new Event("visibilitychange")));
}
const blur = () => act(() => void window.dispatchEvent(new FocusEvent("blur")));
/** Whether the mouse is captured right now (`document.pointerLockElement`). */
function setCaptured(on: boolean) {
  Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => (on ? document.body : null) });
}

let focus: MockInstance<() => boolean>;
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // A child at the game has the window's focus; jsdom's document never does.
  focus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  focus.mockRestore();
  delete (document as { visibilityState?: unknown }).visibilityState;
  delete (document as { pointerLockElement?: unknown }).pointerLockElement;
});

describe("every way the game pauses by itself stops a child's minutes", () => {
  it("the tab hidden: the game pauses, says why, and writes not a minute until the child resumes", async () => {
    const bus = mountChild();
    setVisibility("hidden");
    expect(screen.getByRole("dialog", { name: "Paused" })).toHaveTextContent("Paused while you were away — your minutes stopped too.");
    expect(bus.paused).toBe(true);

    // Back at the tab, the pause stays until the child chooses to play.
    setVisibility("visible");
    await advance(5 * 60_000);
    expect(recordRealmPlay).not.toHaveBeenCalled();
    expect(screen.getByText("240 min left · paused")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(bus.paused).toBe(false);
    await advance(65_000);
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);
  });

  it("the window losing focus: the same", async () => {
    const bus = mountChild();
    blur();
    expect(screen.getByRole("dialog", { name: "Paused" })).toHaveTextContent("Paused while you were away — your minutes stopped too.");
    expect(bus.paused).toBe(true);
    await advance(5 * 60_000);
    expect(recordRealmPlay).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await advance(65_000);
    expect(recordRealmPlay).toHaveBeenCalledTimes(1);
  });

  it("the captured mouse let go (Esc while looking, which the page never hears): the pause menu, as Esc", async () => {
    const bus = mountChild();
    act(() => bus.onLookFreed());
    const board = screen.getByRole("dialog", { name: "Paused" });
    expect(board).toHaveTextContent("The world waits for you. Your minutes are not ticking.");
    expect(board).not.toHaveTextContent("while you were away");
    await advance(5 * 60_000);
    expect(recordRealmPlay).not.toHaveBeenCalled();
  });

  it("the mouse let go because the window lost focus counts as away", () => {
    const bus = mountChild();
    focus.mockReturnValue(false);
    act(() => bus.onLookFreed());
    expect(screen.getByRole("dialog", { name: "Paused" })).toHaveTextContent("Paused while you were away");
  });

  it("two minutes untouched: 'Are you there, Emma?', the idle minutes given back, the clock stopped, and one click plays on", async () => {
    mountChild();
    await advance(119_000);
    expect(screen.queryByRole("dialog")).toBeNull();
    await advance(1_000);
    const card = screen.getByRole("dialog", { name: "Are you there, Emma?" });

    // The minutes the clock wrote while nobody was there go back (spec §4.6), and the card says how many.
    expect(refundIdleMinutes).toHaveBeenCalledOnce();
    const [childId, asked] = vi.mocked(refundIdleMinutes).mock.calls[0];
    expect(childId).toBe("demo-child-1");
    expect(card).toHaveTextContent(`You stepped away, so the Realm paused and gave back ${asked} ${asked === 1 ? "minute" : "minutes"}.`);

    // Nothing after the card is charged.
    const written = vi.mocked(recordRealmPlay).mock.calls.length;
    await advance(5 * 60_000);
    expect(recordRealmPlay).toHaveBeenCalledTimes(written);

    fireEvent.click(screen.getByRole("button", { name: "I'm back!" }));
    await advance(65_000);
    expect(recordRealmPlay).toHaveBeenCalledTimes(written + 1);
  });

  it("an idle pause whose give-back fails says the minutes stopped, never an error, and leaves them charged", async () => {
    vi.mocked(refundIdleMinutes).mockRejectedValueOnce(new Error("The ledger is unreachable."));
    mountChild();
    await advance(120_000);
    const card = screen.getByRole("dialog", { name: "Are you there, Emma?" });
    expect(card).toHaveTextContent("You stepped away, so the Realm paused — your minutes stopped too.");
    expect(screen.queryByText(/unreachable/)).toBeNull();
  });

  it("the quiet world has nothing to give back: the idle pause says so plainly", async () => {
    // The quiet clock's once-a-minute ask still finds the Realm quiet.
    vi.mocked(getRealmAccess).mockResolvedValueOnce({ allowed: true, minutesRemaining: 0, source: "quiet" }).mockResolvedValueOnce({ allowed: true, minutesRemaining: 0, source: "quiet" });
    render(<RealmGame heroName="Emma" realm={realm} entry={{ minutes: 0, visit: null, source: "quiet" }} castleUnlocked={false} />);
    await advance(120_000);
    expect(screen.getByRole("dialog", { name: "Are you there, Emma?" })).toHaveTextContent("your minutes stopped too");
    expect(refundIdleMinutes).not.toHaveBeenCalled();
    expect(getRealmAccess).toHaveBeenCalledTimes(2);
  });

  it("starts the two minutes again at every key, click or mouse move", async () => {
    mountChild();
    await advance(100_000);
    act(() => void fireEvent.keyDown(window, { code: "KeyW", key: "w" }));
    await advance(100_000);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void fireEvent.pointerMove(window));
    await advance(119_000);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void fireEvent.pointerDown(window));
    await advance(119_000);
    expect(screen.queryByRole("dialog")).toBeNull();
    await advance(1_000);
    expect(screen.getByRole("dialog", { name: "Are you there, Emma?" })).toBeInTheDocument();
  });

  it("counts no idle time while a panel is open: the two minutes start again when the child comes back", async () => {
    mountChild();
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    await advance(5 * 60_000);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await advance(119_000);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("indoors too: the tab hidden pauses (the clock runs in a room), and Resume is back in the room", () => {
    const bus = mountChild();
    act(() => window.__realmEnter!("chapel"));
    expect(document.querySelector(".r3-game--indoors")).not.toBeNull();
    setVisibility("hidden");
    expect(screen.getByRole("dialog", { name: "Paused" })).toHaveTextContent("Paused while you were away — your minutes stopped too.");
    setVisibility("visible");
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(document.querySelector(".r3-game--indoors")).not.toBeNull();
    expect(bus.paused).toBe(true); // the island stays paused: the child's hands are the room's
  });
});

describe("nothing pauses over a panel, or traps the child", () => {
  it("leaves an open panel alone: the tab, the window, the mouse and idleness open nothing over it", async () => {
    const bus = mountChild();
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    setVisibility("hidden");
    setVisibility("visible");
    blur();
    act(() => bus.onLookFreed());
    await advance(5 * 60_000);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
  });

  it("an auto-pause is one press from play: Esc resumes it", () => {
    const bus = mountChild();
    blur();
    act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bus.paused).toBe(false);
  });
});

describe("P", () => {
  it("pauses, and P again plays on", () => {
    const bus = mountChild();
    act(() => void fireEvent.keyDown(window, { code: "KeyP", key: "p" }));
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeInTheDocument();
    expect(bus.paused).toBe(true);
    act(() => void fireEvent.keyDown(window, { code: "KeyP", key: "p" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bus.paused).toBe(false);
  });

  it("does nothing over another panel", () => {
    mountChild();
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    act(() => void fireEvent.keyDown(window, { code: "KeyP", key: "p" }));
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Paused" })).toBeNull();
  });
});

describe("Resume catches the mouse again, when it was caught before the pause", () => {
  it("after the mouse was let go by Esc: the Resume click asks the scene to capture it", () => {
    const bus = mountChild();
    const request = vi.fn();
    bus.setLookRequester(request);
    act(() => bus.onLookFreed());
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("after P while looking, and after the window lost focus while looking", () => {
    const bus = mountChild();
    const request = vi.fn();
    bus.setLookRequester(request);
    setCaptured(true);
    act(() => void fireEvent.keyDown(window, { code: "KeyP", key: "p" }));
    setCaptured(false);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(request).toHaveBeenCalledTimes(1);

    setCaptured(true);
    blur();
    setCaptured(false);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("not after a pause from the button, when the mouse was free", () => {
    const bus = mountChild();
    const request = vi.fn();
    bus.setLookRequester(request);
    act(() => bus.onLookFreed());
    act(() => void fireEvent.keyDown(window, { key: "Escape" })); // played on without Resume
    fireEvent.click(screen.getByRole("button", { name: /^Pause/ }));
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(request).not.toHaveBeenCalled();
  });
});

describe("the mouse's look settings, in the pause menu", () => {
  it("are handed to the scene from the moment the game opens, from what this computer kept", () => {
    localStorage.setItem(LOOK_KEY, JSON.stringify({ sensitivity: 0.75, invertY: true }));
    const bus = mountChild();
    expect(bus.look).toEqual({ sensitivity: 0.75, invertY: true });
    localStorage.clear();
  });

  it("sit right beside Sound, for a child and for a visiting grown-up, and change the scene's look", () => {
    const bus = mountChild();
    fireEvent.click(screen.getByRole("button", { name: /^Pause/ }));
    const board = screen.getByRole("dialog", { name: "Paused" });
    expect(board.querySelector(".r3-look")?.nextElementSibling).toBe(board.querySelector(".r3-sound"));
    fireEvent.change(within(board).getByRole("slider", { name: "Look speed" }), { target: { value: "200" } });
    expect(bus.look.sensitivity).toBe(2);
    cleanup();
    localStorage.clear();

    mountParent();
    act(() => void fireEvent.keyDown(window, { code: "KeyP", key: "p" }));
    expect(within(screen.getByRole("dialog", { name: "Paused" })).getByRole("group", { name: "Invert up/down" })).toBeInTheDocument();
  });
});

describe("a visiting grown-up", () => {
  it("is never paused by the tab, the window or idleness: nothing covers their view", async () => {
    const bus = mountParent();
    setVisibility("hidden");
    setVisibility("visible");
    blur();
    focus.mockReturnValue(false);
    act(() => bus.onLookFreed());
    await advance(5 * 60_000);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bus.paused).toBe(false);
  });

  it("is paused by Esc while looking, and the pause only holds the child's world still", () => {
    const bus = mountParent();
    act(() => bus.onLookFreed());
    const board = screen.getByRole("dialog", { name: "Paused" });
    expect(board).toHaveTextContent("Emma's Realm waits while you look.");
    expect(board).not.toHaveTextContent("minutes");
    expect(bus.paused).toBe(true);
  });
});
