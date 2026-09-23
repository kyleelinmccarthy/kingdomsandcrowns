import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import type { CastQueue } from "@/lib/realm3d/casting";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

/**
 * Going indoors, played from the frame's side. Both canvases are stubs that keep what they were
 * handed — the island's (`RealmCanvasProps`) and the room's (`RoomViewProps`) — so these tests
 * play the scenes: fire `onInteract` and `onDoor` as the island would, and `onNear` /
 * `onInteract` / `onLeave` as the room would.
 */
const handed: { bus?: HudBus; casts?: CastQueue; island?: Record<string, unknown>; room?: Record<string, unknown> | null } = {};
vi.mock("next/dynamic", () => ({
  default: () =>
    function Dynamic(props: Record<string, unknown>) {
      if ("visit" in props) {
        handed.room = props;
        return <div data-testid="room" data-room={(props.visit as { room: string }).room} />;
      }
      handed.bus = props.bus as HudBus;
      handed.casts = props.casts as CastQueue;
      handed.island = props;
      return <div data-testid="canvas" />;
    },
}));
vi.mock("@/lib/actions/realm-settings", () => ({
  setRealmDepth: vi.fn(async () => {}),
  updateRealmSettings: vi.fn(async () => {}),
  setTutorialStep: vi.fn(async () => {}),
  markRealmHelpSeen: vi.fn(async () => {}),
}));
vi.mock("@/lib/actions/deeds", () => ({ startDeedRun: vi.fn(), answerDeedQuestion: vi.fn(), completeDeedRun: vi.fn() }));
vi.mock("@/lib/actions/seasons", () => ({ markCeremonySeen: vi.fn(async () => {}) }));
vi.mock("@/lib/actions/spells", () => ({ getSpellbook: vi.fn(async () => ({ spells: [], slots: 4, level: 3, unlocked: [], schoolCounts: { element: 0, form: 0, modifier: 0 }, subjectNamesBySchool: { element: [], form: [], modifier: [] } })) }));
vi.mock("@/lib/actions/realm", () => ({ getRealmKingdom: vi.fn() }));
vi.mock("@/lib/actions/quest-assignments", () => ({ getAssignmentQuestInfo: vi.fn(async () => null) }));
vi.mock("@/lib/actions/realm-play", () => ({ getRealmAccess: vi.fn(), recordRealmPlay: vi.fn(async () => {}) }));
vi.mock("@/lib/realm3d/worldgen", async (orig) => {
  const real = await orig<typeof import("@/lib/realm3d/worldgen")>();
  const world = { landmarks: [], roads: [], biomeAt: () => "meadow", heightAt: () => 0 };
  return { ...real, realmWorld: () => world };
});

import { findBuilding } from "@/lib/utils/kingdom";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
import { RealmGame, type RealmData } from "./realm-game";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
});
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  handed.room = null;
});

/** A village with the chapel raised and the well half built. */
const realm: RealmData = {
  childId: "demo-child-1",
  isChildView: true,
  kingdom: {
    tone: "gentle",
    buildings: ["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"].map((id) => ({
      id,
      label: findBuilding(id)!.label,
      description: "",
      icon: "box" as const,
      deeds: [],
      done: id === "chapel" ? 5 : id === "well" ? 2 : 0,
      total: 5,
      complete: id === "chapel",
    })),
  },
  castleType: "campsite",
  banners: 0,
  profile: DEFAULT_LEARNING_PROFILE,
  depth: "full",
  toneMode: "gentle",
};

const spellbook = { spells: [{ slot: 1, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" }] as never, slots: 4 };

function mount(over: Partial<React.ComponentProps<typeof RealmGame>> = {}) {
  const view = render(<RealmGame heroName="Emma" spellbook={spellbook} realm={realm} entry={{ minutes: 240, visit: null, source: "earned" }} castleUnlocked={false} {...over} />);
  return { view, bus: handed.bus! };
}

const chapel = { kind: "site" as const, id: "chapel", label: "the Chapel", verb: "Go into" };

describe("going in", () => {
  it("E at a raised building takes the child inside: the room is drawn, the island stops, the plaque says where", () => {
    const { view, bus } = mount();
    act(() => bus.onNear(chapel));
    expect(screen.getByRole("button", { name: /Go into the Chapel/ })).toBeInTheDocument();
    act(() => bus.onInteract(chapel));
    expect(screen.getByTestId("room")).toHaveAttribute("data-room", "chapel");
    expect(handed.island!.frozen).toBe(true);
    expect(bus.paused).toBe(true); // the ISLAND takes no keys; the room has its own
    expect(handed.room!.paused).toBe(false); // ...and indoors is still playing
    expect(view.container.querySelector(".r3-who-where")).toHaveTextContent("Inside the Chapel");
    expect(view.container.querySelector(".r3-game")).toHaveClass("r3-game--indoors");
    // The island's prompt does not follow the child in.
    expect(screen.queryByRole("button", { name: /Go into the Chapel/ })).toBeNull();
  });

  it("walking into its doorway does the same", () => {
    const { bus } = mount();
    act(() => bus.onDoor("chapel"));
    expect(screen.getByTestId("room")).toHaveAttribute("data-room", "chapel");
  });

  it("a site still going up has no inside: E there is still its villager's conversation", () => {
    const { bus } = mount();
    act(() => bus.onInteract({ kind: "site", id: "well", label: "the Village Well" }));
    expect(screen.queryByTestId("room")).toBeNull();
    expect(screen.getByRole("dialog", { name: /Old Bram/ })).toBeInTheDocument();
    act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    act(() => bus.onDoor("well"));
    expect(screen.queryByTestId("room")).toBeNull();
  });

  it("the castle only once it is the child's", () => {
    const castle = { kind: "castle" as const, id: "castle", label: "your castle" };
    const locked = mount();
    act(() => locked.bus.onInteract(castle));
    expect(screen.queryByTestId("room")).toBeNull();
    cleanup();
    const open = mount({ castleUnlocked: true });
    act(() => open.bus.onInteract(castle));
    expect(screen.getByTestId("room")).toHaveAttribute("data-room", "castle");
    expect(open.view.container.querySelector(".r3-who-where")).toHaveTextContent("Inside your castle");
  });

  it("the castle's banners are the child's own colours", () => {
    const { bus } = mount({ castleUnlocked: true, avatar: { ...DEFAULT_AVATAR, backgroundColor: "#123456", accessoryColor: "#abcdef" } });
    act(() => bus.onDoor("castle"));
    expect(handed.room!.colors).toEqual({ field: "#123456", charge: "#abcdef" });
  });
});

describe("inside", () => {
  it("talks to the keeper with the same conversation as outside", () => {
    const { bus } = mount();
    act(() => bus.onInteract(chapel));
    act(() => bus.onNear({ kind: "villager", id: "wren", label: "Sister Wren" }));
    act(() => bus.onInteract({ kind: "villager", id: "wren", label: "Sister Wren" }));
    expect(screen.getByRole("dialog", { name: /Sister Wren/ })).toBeInTheDocument();
    expect(handed.room!.paused).toBe(true);
    act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    expect(handed.room!.paused).toBe(false);
    expect(screen.getByTestId("room")).toBeInTheDocument(); // still indoors
  });

  it("using the room's thing says something, a different thing each time, with no panel", () => {
    const { view, bus } = mount();
    act(() => bus.onInteract(chapel));
    const bell = { kind: "fixture" as const, id: "bell", label: "the bell", verb: "Ring" };
    act(() => bus.onNear(bell));
    expect(screen.getByRole("button", { name: /Ring the bell/ })).toBeInTheDocument();
    act(() => bus.onInteract(bell));
    const lane = () => view.container.querySelector(".r3-room-line");
    expect(lane()).toHaveTextContent("Dong… dong… The chapel bell rings out over Emma's village.");
    expect(handed.room!.used).toBe(1);
    expect(bus.paused).toBe(true);
    expect(handed.room!.paused).toBe(false);
    act(() => bus.onInteract(bell));
    expect(lane()).toHaveTextContent("Sister Wren smiles.");
    expect(handed.room!.used).toBe(2);
  });

  it("casts nothing indoors, even from a click on the bar", () => {
    const { bus } = mount();
    act(() => bus.onInteract(chapel));
    fireEvent.click(screen.getByRole("button", { name: /Ember Bolt/ }));
    expect(handed.casts!.n).toBe(0);
  });
});

describe("coming out", () => {
  it("the door, or walking into it, goes back outside: the island draws again and is told which door", () => {
    const { view, bus } = mount();
    act(() => bus.onNear(chapel));
    act(() => bus.onInteract(chapel));
    act(() => bus.onInteract({ kind: "door", id: "door", label: "outside", verb: "Go" }));
    expect(screen.queryByTestId("room")).toBeNull();
    expect(handed.island!.frozen).toBe(false);
    expect(bus.paused).toBe(false);
    expect(bus.leaving).toBe("chapel");
    expect(view.container.querySelector(".r3-who-where")).not.toHaveTextContent("Inside");
    // What was in reach at the door is in reach again.
    expect(screen.getByRole("button", { name: /Go into the Chapel/ })).toBeInTheDocument();
    // In and out again by walking.
    act(() => bus.onDoor("chapel"));
    act(() => (handed.room!.onLeave as () => void)());
    expect(screen.queryByTestId("room")).toBeNull();
  });

  it("Esc indoors is the pause menu, and Resume is back indoors", () => {
    const { bus } = mount();
    act(() => bus.onInteract(chapel));
    act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    expect(screen.getByRole("dialog", { name: /Paused/i })).toBeInTheDocument();
    expect(handed.room!.paused).toBe(true);
    act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    expect(handed.room!.paused).toBe(false);
    expect(screen.getByTestId("room")).toBeInTheDocument();
  });
});

describe("a visiting grown-up", () => {
  it("goes in too, as the wizard, and the keeper's side quests are theirs to read", () => {
    const { bus } = mount({ viewer: "parent", realm: { ...realm, isChildView: false } });
    act(() => bus.onInteract(chapel));
    expect(handed.room!.viewer).toBe("parent");
    act(() => bus.onInteract({ kind: "villager", id: "wren", label: "Sister Wren" }));
    expect(screen.getByRole("dialog", { name: /Sister Wren/ })).toHaveTextContent("Side Quests are for Emma to play");
  });
});
