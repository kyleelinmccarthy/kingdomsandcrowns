import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import type { TroubleBus } from "@/lib/realm3d/trouble-bus";
import type { CastQueue } from "@/lib/realm3d/casting";
import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/utils/avatar-catalog";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

/**
 * The composition root, with the canvas swapped for a stub that keeps what it was handed. The
 * real canvas imports `three`, which nothing under Vitest may load; the stub is also the
 * scene's half of the contract, so these tests play the scene — fire `onNear`, fire
 * `onInteract`, read `bus.paused` — exactly as the real one will.
 */
/** How many times a canvas has been mounted: a save must not remount it. */
const canvasMounts = { n: 0 };
const handed: { bus?: HudBus; casts?: CastQueue; props?: Record<string, unknown> } = {};
vi.mock("./spike-scene", () => ({
  default: function Canvas(props: Record<string, unknown>) {
    handed.bus = props.bus as HudBus;
    handed.casts = props.casts as CastQueue;
    handed.props = props;
    useEffect(() => {
      canvasMounts.n++;
    }, []);
    return <div data-testid="canvas" />;
  },
}));
vi.mock("next/dynamic", () => ({
  default: () => {
    // Resolve the (mocked) scene synchronously, so the first render already has the canvas.
    return function Dynamic(props: Record<string, unknown>) {
      handed.bus = props.bus as HudBus;
      handed.casts = props.casts as CastQueue;
      handed.props = props;
      useEffect(() => {
        canvasMounts.n++;
      }, []);
      return <div data-testid="canvas" />;
    };
  },
}));
vi.mock("@/lib/actions/realm-settings", () => ({
  setRealmDepth: vi.fn(async () => {}),
  updateRealmSettings: vi.fn(async () => {}),
  setTutorialStep: vi.fn(async () => {}),
  markRealmHelpSeen: vi.fn(async () => {}),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/actions/avatar", () => ({
  getWardrobe: vi.fn(async () => ({ level: 5, earnedBadgeIds: [], questUnlockedItems: [], crowns: [] })),
  updateAvatarConfig: vi.fn(async () => {}),
}));
vi.mock("@/lib/actions/realm-sound", () => ({ saveRealmSound: vi.fn(async () => {}) }));
vi.mock("@/lib/actions/deeds", () => ({ startDeedRun: vi.fn(), answerDeedQuestion: vi.fn(), retryDeedQuestion: vi.fn(), resolveDeedQuestion: vi.fn(), completeDeedRun: vi.fn() }));
vi.mock("@/lib/actions/seasons", () => ({ markCeremonySeen: vi.fn(async () => {}) }));
vi.mock("@/lib/actions/improvements", () => ({ markBuildingsAnnounced: vi.fn(async () => {}), markDeliverySeen: vi.fn(async () => {}), startBuildRun: vi.fn(), pinPlan: vi.fn(async () => {}) }));
vi.mock("@/lib/actions/realm-chronicle", () => ({ getChronicle: vi.fn(async () => ({ weeks: [], canSeal: false, lore: [] })) }));
vi.mock("@/lib/actions/review", () => ({ startReviewRun: vi.fn(), getReviewDue: vi.fn(async () => false) }));
vi.mock("@/lib/actions/world-locks", () => ({ startWorldLockRun: vi.fn(), startTowerRun: vi.fn() }));
vi.mock("@/lib/actions/rune-objects", () => ({ startRuneObjectRun: vi.fn() }));
vi.mock("@/lib/actions/spells", () => ({ getSpellbook: vi.fn(async () => ({ spells: [], slots: 4, level: 3, unlocked: ["ember", "tide", "bolt", "orb"], schoolCounts: { element: 2, form: 0, modifier: 0 }, subjectNamesBySchool: { element: ["Math"], form: [], modifier: [] } })) }));
vi.mock("@/lib/actions/realm", () => ({ getRealmKingdom: vi.fn() }));
vi.mock("@/lib/actions/quest-assignments", () => ({ getAssignmentQuestInfo: vi.fn(async () => null) }));
vi.mock("@/lib/actions/realm-play", () => ({
  getRealmAccess: vi.fn(),
  recordRealmPlay: vi.fn(async () => {}),
  getTroubleBounty: vi.fn(async () => ({ enabled: false, capMinutes: 0, subCapMinutes: 0, paidMinutes: 0, remainingMinutes: 0, clearsToday: 0, paidHomes: [] })),
  recordTroubleClears: vi.fn(),
}));
// Pass-through, so a test can see the frame mirror a rune finish even where the canvas draws no runes (runes off).
vi.mock("@/lib/realm/world-state", async (orig) => {
  const real = await orig<typeof import("@/lib/realm/world-state")>();
  return { ...real, applyRuneOutcomes: vi.fn(real.applyRuneOutcomes) };
});
vi.mock("@/lib/realm3d/worldgen", async (orig) => {
  const real = await orig<typeof import("@/lib/realm3d/worldgen")>();
  const world = {
    landmarks: [{ id: "summit-1", name: "Cloudfoot", line: "The whole realm, from up here.", position: { x: 40, z: -60 }, y: 40, radius: 15, biome: "crag", kind: "summit" }],
    roads: [],
    biomeAt: () => "meadow",
    heightAt: () => 0,
  };
  return { ...real, realmWorld: () => world };
});

import { answerDeedQuestion, completeDeedRun, retryDeedQuestion, startDeedRun } from "@/lib/actions/deeds";
import { updateAvatarConfig } from "@/lib/actions/avatar";
import { getRealmKingdom } from "@/lib/actions/realm";
import { markRealmHelpSeen, setTutorialStep } from "@/lib/actions/realm-settings";
import { markCeremonySeen } from "@/lib/actions/seasons";
import { markBuildingsAnnounced, markDeliverySeen, pinPlan, startBuildRun } from "@/lib/actions/improvements";
import { KEEP_YARD } from "@/lib/realm/keep-yard";
import { EMPTY_WORKS, type Works } from "@/lib/realm/works-state";
import { CHRONICLE_TARGET, PLANS_TARGET } from "@/lib/realm3d/interact";
import { getChronicle } from "@/lib/actions/realm-chronicle";
import { BUILD_HERO_ONLY } from "@/lib/utils/deed-refusals";
import { startReviewRun } from "@/lib/actions/review";
import { startTowerRun, startWorldLockRun } from "@/lib/actions/world-locks";
import { startRuneObjectRun } from "@/lib/actions/rune-objects";
import { toClientTask } from "@/lib/tasks/registry";
import { RUNE_HOLDS_LINE, RUNE_TITLE } from "@/lib/tasks/rune-copy";
import { RUNE_FIXED } from "@/lib/utils/deed-refusals";
import { runeStub } from "@/test/rune-stubs";
import { applyRuneOutcomes, worldCanvas, type WorldStateView } from "@/lib/realm/world-state";
import { RUNE_DONE, RUNE_FINISH, RUNE_HOLDS_HERE, RUNE_LEAVE, RUNE_TRACKER_LABEL } from "@/lib/tasks/rune-copy";
import { MEND, RUNE_WALK_SUMMARY, WALK_STOPS, runeWalkRun } from "@/test/rune-walk-run";
import { saveRealmSound } from "@/lib/actions/realm-sound";
import { getRealmAccess, getTroubleBounty, recordTroubleClears } from "@/lib/actions/realm-play";
import { stepRide, type RideBus } from "@/lib/realm3d/riding";
import { LEGACY_STEPS, LESSONS, STORED_MAX } from "@/lib/realm3d/tutorial";
import { findBuilding } from "@/lib/utils/kingdom";
import { RealmGame, type RealmData } from "./realm-game";
import type { RecentQuest } from "@/lib/realm/mentions";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
});
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

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
      deeds: id === "well" ? [{ id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const, bestStars: 0 as const, crowned: false }] : [],
      stars: 0,
      maxStars: id === "well" ? 3 : 0,
      raisedBy: null,
      raisedAt: null,
      done: id === "well" ? 2 : 0,
      total: 5,
      complete: false,
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
  const view = render(
    <RealmGame heroName="Emma" spellbook={spellbook} realm={realm} entry={{ minutes: 240, visit: null, source: "earned" }} castleUnlocked={false} {...over} />,
  );
  const bus = handed.bus!;
  return { view, bus };
}

const esc = () => act(() => void fireEvent.keyDown(window, { key: "Escape" }));

describe("the real village", () => {
  it("feeds the canvas the child's own kingdom, with its objectives marked", () => {
    mount();
    const layout = handed.props!.layout as { villagers: { id: string; status: string }[] };
    expect(layout.villagers.find((v) => v.id === "bram")!.status).toBe("objective");
  });

  it("hands the canvas the viewer and the castle rule it was given", () => {
    mount({ viewer: "parent", castleUnlocked: false });
    expect(handed.props!.viewer).toBe("parent");
    expect(handed.props!.castleUnlocked).toBe(false);
  });

  it("hands the canvas the calm flag and one trouble bus, and the calm child gets calm troubles", () => {
    mount();
    expect(handed.props!.calm).toBe(false);
    expect(handed.props!.troubles).toBeTruthy();
    cleanup();
    mount({ realm: { ...realm, profile: { ...realm.profile, lowStimulus: true } } });
    expect(handed.props!.calm).toBe(true);
  });

  it("keeps every canvas prop the same object across a re-render", () => {
    const { view } = mount();
    const first = { ...handed.props! };
    view.rerender(<RealmGame heroName="Emma" spellbook={spellbook} realm={realm} entry={{ minutes: 240, visit: null, source: "earned" }} castleUnlocked={false} />);
    expect(first).toHaveProperty("gilded");
    for (const k of Object.keys(first)) expect(handed.props![k], k).toBe(first[k]);
  });

  it("hands the canvas the buildings whose stars are all earned, and shows a built site's stars on its plate", () => {
    const starry = {
      ...realm,
      kingdom: { ...realm.kingdom, buildings: realm.kingdom.buildings.map((b) => (b.id === "well" ? { ...b, done: 5, complete: true, stars: 3, maxStars: 3 } : b)) },
    };
    const { view } = mount({ realm: starry });
    expect(handed.props!.gilded).toEqual(["well"]);
    expect(view.container.querySelector(".r3-plate-stars")).toHaveTextContent("★ 3 of 3");
  });

  it("shows the objectives, the village and the clock", () => {
    const { view } = mount();
    expect(view.container.querySelector(".r3-quest-title")).toHaveTextContent("Village Well");
    expect(screen.getByText("0 of 8 built")).toBeInTheDocument();
    expect(screen.getByText("240 min left")).toBeInTheDocument();
  });
});

describe("pausing", () => {
  it("pauses the scene on Esc, and resumes on Esc", () => {
    const { bus } = mount();
    expect(bus.paused).toBe(false);
    esc();
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeInTheDocument();
    expect(bus.paused).toBe(true);
    expect(screen.getByText("240 min left · paused")).toBeInTheDocument();
    esc();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bus.paused).toBe(false);
  });

  it("goes Controls and back to the pause menu, still paused", () => {
    const { bus } = mount();
    esc();
    fireEvent.click(screen.getByRole("button", { name: /Controls/ }));
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    expect(bus.paused).toBe(true);
    esc();
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeInTheDocument();
  });

  it("pauses for an empty page, too", () => {
    const { bus } = mount();
    fireEvent.click(screen.getByRole("button", { name: /Page 2 is empty/ }));
    expect(screen.getByRole("dialog", { name: "Page 2 is empty" })).toBeInTheDocument();
    expect(bus.paused).toBe(true);
  });
});

describe("the E prompt", () => {
  it("appears when the scene says someone is in reach, and goes when they are not", () => {
    const { bus } = mount();
    act(() => bus.onNear({ kind: "villager", id: "bram", label: "Old Bram" }));
    expect(screen.getByRole("button", { name: /Talk to Old Bram/ })).toBeInTheDocument();
    act(() => bus.onNear(null));
    expect(screen.queryByRole("button", { name: /Talk to/ })).toBeNull();
  });

  it("opens a panel naming them when E is pressed, and pauses the world", () => {
    const { bus } = mount();
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    expect(screen.getByRole("dialog", { name: /Old Bram/ })).toBeInTheDocument();
    expect(bus.paused).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Goodbye" }));
    expect(bus.paused).toBe(false);
  });
});

describe("the riddle stones", () => {
  const stone = { kind: "riddle" as const, id: "longwater", label: "the riddle stone", verb: "Read" };

  it("hands the canvas whether a review is due, and E at a stone opens its board on a review there", async () => {
    vi.mocked(startReviewRun).mockResolvedValue({ empty: true });
    const { bus } = mount({ realm: { ...realm, reviewDue: true } });
    expect(handed.props!.reviewDue).toBe(true);
    act(() => bus.onNear(stone));
    expect(screen.getByRole("button", { name: /Read the riddle stone/ })).toBeInTheDocument();
    await act(async () => void bus.onInteract(stone));
    expect(startReviewRun).toHaveBeenCalledWith("demo-child-1", { kind: "stone", placeId: "longwater" });
    expect(screen.getByRole("dialog", { name: "Longwater riddle stone" })).toHaveTextContent("The stone is quiet today.");
    expect(bus.paused).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back to the Realm" }));
    expect(bus.paused).toBe(false);
  });

  it("keeps the stones awake while the world is quiet", async () => {
    vi.mocked(getRealmAccess).mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "quiet" });
    vi.mocked(startReviewRun).mockResolvedValue({ empty: true });
    const { bus } = mount({ entry: { minutes: 0, visit: null, source: "quiet" } });
    await act(async () => void bus.onInteract(stone));
    expect(screen.getByRole("dialog", { name: "Longwater riddle stone" })).toBeInTheDocument();
  });
});

describe("the world's locks", () => {
  const view: WorldStateView = { locksOn: true, runesOn: false, open: ["door:longwater"], fixed: [], decor: ["sundial"], tower: [] };
  const chest = { kind: "lock" as const, id: "chest:west-lane", label: "the old chest", verb: "Open" };
  const lockRun = {
    runId: "lock-1",
    deed: { id: "chest:west-lane", title: "The old chest", story: "An old chest, shut with a puzzle for a lock.", area: "logic" as const },
    questions: [{ kind: "choice" as const, id: "q1", skillId: "logic-g45", prompt: "Which shape comes next?", view: { choices: ["circle", "square"] } }],
    responses: [null] as (string | null)[],
    kind: "world" as const,
    pending: null,
  };

  it("hands the canvas the hero's locks, the same object across a re-render", () => {
    const { view: v } = mount({ realm: { ...realm, worldState: view } });
    expect(handed.props!.worldLocks).toEqual(worldCanvas(view));
    const first = handed.props!.worldLocks;
    v.rerender(<RealmGame heroName="Emma" spellbook={spellbook} realm={{ ...realm, worldState: view }} entry={{ minutes: 240, visit: null, source: "earned" }} castleUnlocked={false} />);
    expect(handed.props!.worldLocks).toBe(first);
  });

  it("opens a chest's lock board when E is pressed at it, and pauses the world", async () => {
    vi.mocked(startWorldLockRun).mockResolvedValue(lockRun);
    const { bus } = mount({ realm: { ...realm, worldState: view } });
    act(() => bus.onNear(chest));
    expect(screen.getByRole("button", { name: /Open the old chest/ })).toBeInTheDocument();
    await act(async () => void bus.onInteract(chest));
    expect(startWorldLockRun).toHaveBeenCalledWith("demo-child-1", "chest:west-lane");
    // One board, the lock's own: never the generic card as well.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "The old chest" })).toHaveTextContent("Which shape comes next?");
    expect(bus.paused).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Leave the lock" }));
    expect(bus.paused).toBe(false);
  });

  it("an open vault door's board says so, to a visiting grown-up too, and starts nothing", async () => {
    const door = { kind: "lock" as const, id: "door:longwater", label: "the vault door", verb: "Look through" };
    const { bus } = mount({ viewer: "parent", realm: { ...realm, isChildView: false, worldState: view } });
    await act(async () => void bus.onInteract(door));
    expect(screen.getByRole("dialog", { name: "The vault door" })).toHaveTextContent("The vault stands open. Its map has been found.");
    expect(screen.getByRole("dialog", { name: "The vault door" })).not.toHaveTextContent(/yours/);
    expect(startWorldLockRun).not.toHaveBeenCalled();
  });

  describe("the Puzzle Tower", () => {
    const tower = { kind: "tower" as const, id: "puzzle-tower", label: "the Puzzle Tower", verb: "Climb" };
    const withTower: WorldStateView = {
      ...view,
      tower: [{ band: "k1", open: true, solved: 2 }, { band: "g23", open: true, solved: 0 }, { band: "g45", open: false, solved: 0 }],
    };
    const towerRun = {
      runId: "tower-1",
      deed: { id: "tower:g23", title: "The Puzzle Tower", story: "A bonus puzzle, just for the joy of it.", area: "logic" as const },
      questions: [{ kind: "choice" as const, id: "q1", skillId: "logic-g23", prompt: "Which shape comes next?", view: { choices: ["circle", "square"] } }],
      responses: [null] as (string | null)[],
      kind: "tower" as const,
      pending: null,
    };

    it("opens the Tower's board when E is pressed at it, over one dialog, and pauses the world", async () => {
      const { bus } = mount({ realm: { ...realm, worldState: withTower } });
      act(() => bus.onNear(tower));
      expect(screen.getByRole("button", { name: /Climb the Puzzle Tower/ })).toBeInTheDocument();
      await act(async () => void bus.onInteract(tower));
      // One board, the Tower's own: never the generic card as well.
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      const board = screen.getByRole("dialog", { name: "The Puzzle Tower" });
      expect(within(board).getAllByRole("listitem")).toHaveLength(3);
      expect(board).toHaveTextContent("Earn 3 stars on a science side quest to open this floor.");
      expect(bus.paused).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Back to the Realm" }));
      expect(bus.paused).toBe(false);
    });

    it("starts a floor's run from the board, for the hero", async () => {
      vi.mocked(startTowerRun).mockResolvedValue(towerRun);
      const { bus } = mount({ realm: { ...realm, worldState: withTower } });
      await act(async () => void bus.onInteract(tower));
      const second = within(screen.getByRole("dialog")).getAllByRole("listitem")[1];
      await act(async () => void fireEvent.click(within(second).getByRole("button", { name: /climb/i })));
      expect(startTowerRun).toHaveBeenCalledWith("demo-child-1", "g23");
      expect(screen.getByRole("dialog", { name: "The Puzzle Tower" })).toHaveTextContent("Which shape comes next?");
    });

    it("mirrors a solved floor's count into the view the board reads", async () => {
      vi.mocked(startTowerRun).mockResolvedValue(towerRun);
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "circle" });
      vi.mocked(completeDeedRun).mockResolvedValue({
        correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 0, previousBest: 0, deedBest: 0, counted: false, crowned: false,
        kind: "tower", building: null, minutesEarned: 0, sideQuestPayFull: false, tower: { band: "g23", solved: 1, solvedNow: true },
      });
      const { bus } = mount({ realm: { ...realm, worldState: withTower } });
      await act(async () => void bus.onInteract(tower));
      await act(async () => void fireEvent.click(within(within(screen.getByRole("dialog")).getAllByRole("listitem")[1]).getByRole("button", { name: /climb/i })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "circle" })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish puzzles" })));
      expect(screen.getByText("Floor solved!")).toBeInTheDocument();
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Back to the floors" })));
      expect(screen.getByText("1 solved here.")).toBeInTheDocument();
    });

    it("hands the canvas one storey for each open floor, and keeps them with the locks off (R-G7)", () => {
      mount({ realm: { ...realm, worldState: withTower } });
      expect(handed.props!.worldLocks).toMatchObject({ locksOn: true, storeys: 2 });
      cleanup();
      mount({ realm: { ...realm, worldState: { ...withTower, locksOn: false } } });
      expect(handed.props!.worldLocks).toMatchObject({ locksOn: false, locks: [], storeys: 2 });
    });

    it("shows a visiting grown-up the floors with no Climb", async () => {
      const { bus } = mount({ viewer: "parent", realm: { ...realm, isChildView: false, worldState: withTower } });
      await act(async () => void bus.onInteract(tower));
      const board = screen.getByRole("dialog", { name: "The Puzzle Tower" });
      expect(within(board).getAllByRole("listitem")).toHaveLength(3);
      expect(within(board).queryByRole("button", { name: /climb/i })).toBeNull();
      expect(startTowerRun).not.toHaveBeenCalled();
    });
  });

  it("the canvas's locks follow the switch, not the clock (RG-l)", () => {
    mount({ realm: { ...realm, worldState: { ...view, locksOn: false } } });
    expect(handed.props!.worldLocks).toMatchObject({ locks: [], locksOn: false, decor: ["sundial"] });
    cleanup();
    // The quiet world rests the troubles, riding and recess; a lock pays nothing, so it is learning and stays.
    vi.mocked(getRealmAccess).mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "quiet" });
    mount({ realm: { ...realm, worldState: view }, entry: { minutes: 0, visit: null, source: "quiet" } });
    expect(handed.props!.troubles).toBeUndefined();
    expect(handed.props!.worldLocks).toEqual(worldCanvas(view));
    expect((handed.props!.worldLocks as ReturnType<typeof worldCanvas>).locks).toHaveLength(8);
  });

  it("draws no locks when the bundle sent no world state", () => {
    mount();
    expect(handed.props!.worldLocks).toEqual({ locksOn: false, locks: [], runes: [], decor: [], storeys: 0, towerKnown: false });
  });
});

describe("the rune objects", () => {
  const view: WorldStateView = { locksOn: true, runesOn: true, open: [], fixed: ["rune:lane-lantern"], decor: [], tower: [] };
  const wagon = { kind: "rune" as const, id: "rune:west-wagon", label: "the broken wagon", verb: "Cast a rune at" };
  const lantern = { kind: "rune" as const, id: "rune:lane-lantern", label: "the lantern", verb: "Look at" };
  const runeRun = {
    runId: "rune-1",
    deed: { id: "rune:west-wagon", title: RUNE_TITLE, story: "Something here needs a rune. Build the word and cast it.", area: "language" as const },
    questions: [toClientTask(runeStub())],
    responses: [null] as (string | null)[],
    kind: "world" as const,
    pending: null,
  };

  it("the canvas has the fifteen rune objects with runes on, and none with them off", () => {
    mount({ realm: { ...realm, worldState: view } });
    expect((handed.props!.worldLocks as ReturnType<typeof worldCanvas>).runes).toHaveLength(15);
    expect(handed.props!.worldLocks).toEqual(worldCanvas(view));
    cleanup();
    mount({ realm: { ...realm, worldState: { ...view, runesOn: false } } });
    expect((handed.props!.worldLocks as ReturnType<typeof worldCanvas>).runes).toHaveLength(0);
    // The records stay: the lock's own canvas is unchanged either way.
    expect(handed.props!.worldLocks).toMatchObject({ locksOn: true });
  });

  it("E at a broken rune object opens its board, not the look panel, and starts its run", async () => {
    vi.mocked(startRuneObjectRun).mockResolvedValue(runeRun);
    const { bus } = mount({ realm: { ...realm, worldState: view } });
    await act(async () => void bus.onInteract(wagon));
    expect(startRuneObjectRun).toHaveBeenCalledWith("demo-child-1", "rune:west-wagon");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: RUNE_TITLE })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "The rune stone" })).toBeInTheDocument();
    expect(bus.paused).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Leave the rune" }));
    expect(bus.paused).toBe(false);
  });

  it("E at a fixed rune object asks the server, as at an open chest (RI-a / S20)", async () => {
    vi.mocked(startRuneObjectRun).mockRejectedValue(new Error(RUNE_FIXED));
    const { bus } = mount({ realm: { ...realm, worldState: view } });
    await act(async () => void bus.onInteract(lantern));
    expect(startRuneObjectRun).toHaveBeenCalledWith("demo-child-1", "rune:lane-lantern");
    expect(screen.getByRole("dialog", { name: RUNE_TITLE })).toHaveTextContent(RUNE_HOLDS_LINE);
  });

  it("a visiting grown-up looks at an object and starts nothing", async () => {
    const { bus } = mount({ viewer: "parent", realm: { ...realm, isChildView: false, worldState: view } });
    await act(async () => void bus.onInteract(lantern));
    expect(screen.getByRole("dialog", { name: RUNE_TITLE })).toHaveTextContent("The rune holds here.");
    expect(startRuneObjectRun).not.toHaveBeenCalled();
  });

  it("Esc at an object's own board closes it and plays on", async () => {
    vi.mocked(startRuneObjectRun).mockResolvedValue(runeRun);
    const { bus } = mount({ realm: { ...realm, worldState: view } });
    await act(async () => void bus.onInteract(wagon));
    expect(screen.getByRole("dialog", { name: RUNE_TITLE })).toBeInTheDocument();
    esc();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bus.paused).toBe(false);
  });

  it("an object id outside the catalog opens no rune board", async () => {
    const { bus } = mount({ realm: { ...realm, worldState: view } });
    await act(async () => void bus.onInteract({ ...wagon, id: "rune:nope" }));
    expect(startRuneObjectRun).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: RUNE_TITLE })).toBeNull();
  });
});

describe("the keep yard", () => {
  /** Enough for the Banners' first level (4 Dye and 2 Thread). */
  const rich: Works = { ...EMPTY_WORKS, balance: { ...EMPTY_WORKS.balance, dye: 4, thread: 2 } };

  it("hands the canvas the hero's satchel for the stockpile, the same object while it holds the same", () => {
    const { view } = mount({ realm: { ...realm, works: rich } });
    expect(handed.props!.stockpile).toEqual(rich.balance);
    const first = handed.props!.stockpile;
    view.rerender(<RealmGame heroName="Emma" spellbook={spellbook} realm={{ ...realm, works: rich }} entry={{ minutes: 240, visit: null, source: "earned" }} castleUnlocked={false} />);
    expect(handed.props!.stockpile).toBe(first);
  });

  it("opens the plans board when E is pressed at it, and pauses the world", () => {
    const { bus } = mount({ realm: { ...realm, works: rich } });
    act(() => bus.onNear(PLANS_TARGET));
    expect(screen.getByRole("button", { name: /Read Kingdom plans/ })).toBeInTheDocument();
    act(() => bus.onInteract(PLANS_TARGET));
    const board = screen.getByRole("dialog", { name: "Kingdom plans" });
    expect(board).toHaveTextContent("Ready to build");
    expect(screen.getAllByRole("button", { name: "Build" }).length).toBeGreaterThan(0);
    expect(bus.paused).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back to the Realm" }));
    expect(bus.paused).toBe(false);
  });

  it("sends the gold ! to the plans board while the pinned plan is ready, and to the villager otherwise", () => {
    const { bus, view } = mount({ realm: { ...realm, works: { ...rich, pinned: "village-banners" } } });
    expect(bus.goal).toMatchObject({ on: true, x: KEEP_YARD.plansBoard.x, z: KEEP_YARD.plansBoard.z });
    expect(view.container.querySelector(".r3-goal-name")).toHaveTextContent("Banners");
    cleanup();
    // Pinned but short: the villager, as before.
    const short = mount({ realm: { ...realm, works: { ...EMPTY_WORKS, pinned: "village-banners" } } });
    expect(short.bus.goal).not.toMatchObject({ x: KEEP_YARD.plansBoard.x, z: KEEP_YARD.plansBoard.z });
    expect(short.view.container.querySelector(".r3-goal-name")).toHaveTextContent("Old Bram");
  });

  it("moves the gold ! to the board the moment the hero pins a ready plan there", async () => {
    const { bus } = mount({ realm: { ...realm, works: rich } });
    act(() => bus.onInteract(PLANS_TARGET));
    const banners = screen.getByRole("listitem", { name: "Banners" });
    await act(async () => void fireEvent.click(within(banners).getByRole("button", { name: "Pin" })));
    expect(pinPlan).toHaveBeenCalledWith("demo-child-1", "village-banners");
    expect(bus.goal).toMatchObject({ on: true, x: KEEP_YARD.plansBoard.x, z: KEEP_YARD.plansBoard.z });
  });

  it("says aloud on entry where the beacon leads when it is a plan", () => {
    const said: string[] = [];
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = { cancel: vi.fn(), speak: vi.fn((u: { text: string }) => said.push(u.text)) };
    (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = function (this: { text: string }, text: string) {
      this.text = text;
    };
    try {
      mount({ realm: { ...realm, works: { ...rich, pinned: "village-banners" }, profile: { ...realm.profile, readAloud: true } } });
      expect(said).toContain("Everything for the Banners is here. Go to the plans board to build it.");
      expect(said.some((s) => s.includes("Old Bram"))).toBe(false);
    } finally {
      delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    }
  });

  it("names no villager on the welcome card while the beacon is on a plan", () => {
    mount({ realm: { ...realm, works: { ...rich, pinned: "village-banners" }, helpSeen: false } });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(/Banners is waiting/)).toBeNull();
  });

  it("shows a grown-up the plans, with no pin and no build", () => {
    const { bus } = mount({ viewer: "parent", realm: { ...realm, isChildView: false, works: rich } });
    act(() => bus.onInteract(PLANS_TARGET));
    expect(screen.getByRole("dialog", { name: "Kingdom plans" })).toHaveTextContent("Ready to build");
    expect(screen.queryByRole("button", { name: "Build" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pin" })).toBeNull();
    expect(screen.getByText(BUILD_HERO_ONLY)).toBeInTheDocument();
    expect(startBuildRun).not.toHaveBeenCalled();
  });
});

describe("the Scribe's lectern", () => {
  const week = { weekStart: "2026-11-16", entries: [{ assignmentId: "a1", date: "2026-11-17", title: "Fractions", subject: "Math", materialColor: "#888888", notes: "I did the hard ones.", drawing: null, seal: null }] };

  it("opens the Chronicle when E is pressed at it, and pauses the world", async () => {
    vi.mocked(getChronicle).mockResolvedValueOnce({ weeks: [week], canSeal: false, lore: [] });
    const { bus } = mount();
    act(() => bus.onNear(CHRONICLE_TARGET));
    expect(screen.getByRole("button", { name: /Read The Chronicle/ })).toBeInTheDocument();
    act(() => bus.onInteract(CHRONICLE_TARGET));
    const book = screen.getByRole("dialog", { name: "Your Chronicle" });
    expect(bus.paused).toBe(true);
    expect(await within(book).findByText("Fractions")).toBeInTheDocument();
    expect(getChronicle).toHaveBeenCalledWith("demo-child-1");
    fireEvent.click(within(book).getByRole("button", { name: "Back to the Realm" }));
    expect(bus.paused).toBe(false);
  });

  it("lets a grown-up read it under the hero's name", async () => {
    const { bus } = mount({ viewer: "parent", realm: { ...realm, isChildView: false } });
    act(() => bus.onInteract(CHRONICLE_TARGET));
    expect(screen.getByRole("dialog", { name: "Emma's Chronicle" })).toBeInTheDocument();
    expect(await screen.findByText("Emma's Chronicle is waiting for its first page.")).toBeInTheDocument();
  });
});

describe("built plans and their plaques", () => {
  const plaque = { improvementId: "village-banners" as const, level: 1, label: "Banners", builtBy: "Emma", season: "Autumn 2026", sources: ["Fractions p.12"], stars: 2 };
  const built: Works = { ...EMPTY_WORKS, built: { "village-banners": 1 }, plaques: [plaque] };
  const stone = { kind: "plaque" as const, id: "village-banners", label: "the Banners plaque", verb: "Read" };

  it("hands the canvas what the hero has built, the same object across a re-render", () => {
    const { view } = mount({ realm: { ...realm, works: built } });
    expect(handed.props!.built).toEqual({ "village-banners": 1 });
    const first = handed.props!.built;
    view.rerender(<RealmGame heroName="Emma" spellbook={spellbook} realm={{ ...realm, works: built }} entry={{ minutes: 240, visit: null, source: "earned" }} castleUnlocked={false} />);
    expect(handed.props!.built).toBe(first);
  });

  it("opens the plaque when E is pressed at it, and pauses the world", () => {
    const { bus } = mount({ realm: { ...realm, works: built } });
    act(() => bus.onNear(stone));
    expect(screen.getByRole("button", { name: /Read the Banners plaque/ })).toBeInTheDocument();
    act(() => bus.onInteract(stone));
    const panel = screen.getByRole("dialog", { name: "Banners plaque" });
    expect(panel).toHaveTextContent("Banners · built by Emma · Autumn 2026 · from: Fractions p.12");
    expect(screen.getByRole("img", { name: "2 of 3 stars" })).toBeInTheDocument();
    expect(bus.paused).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back to the Realm" }));
    expect(bus.paused).toBe(false);
  });

  it("lets a visiting grown-up read the plaque too", () => {
    const { bus } = mount({ viewer: "parent", realm: { ...realm, isChildView: false, works: built } });
    act(() => bus.onInteract(stone));
    expect(screen.getByRole("dialog", { name: "Banners plaque" })).toHaveTextContent("built by Emma");
  });

  it("has the keeper of a standing building say who raised it and in which season, in the family's zone", () => {
    const standing = {
      ...realm,
      timezone: "Australia/Sydney",
      kingdom: {
        ...realm.kingdom,
        buildings: realm.kingdom.buildings.map((b) => (b.id === "well" ? { ...b, done: 5, complete: true, raisedBy: "Emma", raisedAt: Date.parse("2026-04-15T18:00:00Z") / 1000 } : b)),
      },
    };
    const { bus } = mount({ realm: standing });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    expect(screen.getByRole("dialog", { name: /Old Bram/ })).toHaveTextContent("Raised by Emma · Autumn 2026.");
  });
});

describe("the carts, the satchel and the quiet clock (minutes, quieter)", () => {
  const carts: Works = {
    ...EMPTY_WORKS,
    balance: { ...EMPTY_WORKS.balance, stone: 2, ink: 1 },
    delivery: {
      rows: [
        { materialId: "stone", amount: 1, title: "Fractions p.12", origin: "quest" },
        { materialId: "stone", amount: 1, title: "Times tables", origin: "quest" },
        { materialId: "ink", amount: 1, title: "Volcanoes, part 2", origin: "quest" },
      ],
      through: 1_790_000_000,
    },
  };
  const seen = { ...realm, helpSeen: true, works: carts };

  it("brings the carts in on entry, pauses the world, and writes them down as seen once when closed", () => {
    const { bus } = mount({ realm: seen });
    const card = screen.getByRole("dialog", { name: "The carts are in!" });
    expect(card).toHaveTextContent("2 Stone from Fractions p.12 and Times tables");
    expect(card).toHaveTextContent("1 Ink from Volcanoes, part 2");
    expect(bus.paused).toBe(true);
    expect(markDeliverySeen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "To the kingdom!" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bus.paused).toBe(false);
    expect(markDeliverySeen).toHaveBeenCalledTimes(1);
    expect(markDeliverySeen).toHaveBeenCalledWith("demo-child-1", 1_790_000_000);
    // Opening and closing something else afterwards writes nothing more.
    esc();
    esc();
    expect(markDeliverySeen).toHaveBeenCalledTimes(1);
  });

  it("is written down as seen when skipped with Esc, too, and a failed write only logs", async () => {
    vi.mocked(markDeliverySeen).mockRejectedValueOnce(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mount({ realm: seen });
      esc();
      await act(async () => {});
      expect(markDeliverySeen).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("comes after the first-visit welcome and before the crown ceremony, and the rises wait for all three", async () => {
    const all = {
      ...realm,
      helpSeen: false,
      tutorialStep: 0,
      works: carts,
      ceremony: { seasonId: "season-1", crownId: "crown-copper", ordinal: 1, seasonLabel: "Autumn 2026" },
      kingdom: { ...realm.kingdom, buildings: realm.kingdom.buildings.map((b) => (b.id === "well" ? { ...b, done: 5, complete: true } : b)) },
      unannounced: ["well"],
    };
    mount({ realm: all });
    expect(screen.getByRole("dialog", { name: "Welcome to your Realm" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I know how to play" }));
    expect(screen.getByRole("dialog", { name: "The carts are in!" })).toBeInTheDocument();
    expect(screen.queryByText("The Village Well stands!")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "To the kingdom!" }));
    expect(markDeliverySeen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "The crown ceremony" })).toBeInTheDocument();
    expect(screen.queryByText("The Village Well stands!")).toBeNull();
    expect(markBuildingsAnnounced).not.toHaveBeenCalled();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /Wear it proudly/ })));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("The Village Well stands!")).toBeInTheDocument();
    expect(markBuildingsAnnounced).toHaveBeenCalledWith("demo-child-1", ["well"]);
  });

  it("goes straight from the carts to the ceremony when the welcome was had before", () => {
    mount({ realm: { ...seen, ceremony: { seasonId: "season-1", crownId: "crown-copper", ordinal: 1, seasonLabel: "Autumn 2026" } } });
    fireEvent.click(screen.getByRole("button", { name: "To the kingdom!" }));
    expect(screen.getByRole("dialog", { name: "The crown ceremony" })).toBeInTheDocument();
  });

  it("never shows a grown-up the carts, nor uses them up (a visit, or a parent's view of the hero's page)", () => {
    mount({ viewer: "parent", realm: { ...seen, isChildView: false } });
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    mount({ viewer: "parent", realm: seen });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(markDeliverySeen).not.toHaveBeenCalled();
  });

  it("shows no card for empty carts", () => {
    mount({ realm: { ...seen, works: { ...carts, delivery: { rows: [], through: 5 } } } });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(markDeliverySeen).not.toHaveBeenCalled();
  });

  it("stands the satchel under the objective card, and a pin on the board shows in it at once", async () => {
    const { bus, view } = mount({ realm: { ...realm, works: { ...carts, delivery: null, balance: { ...EMPTY_WORKS.balance, dye: 4, thread: 2 } } } });
    const stack = view.container.querySelector(".r3-frame > .r3-left-stack")!;
    expect([...stack.children].map((c) => c.className)).toEqual(["r3-quest r3-plank", "r3-satchel r3-plank"]);
    expect(screen.getByRole("img", { name: "4 Dye" })).toBeInTheDocument();
    expect(view.container.querySelector(".r3-satchel-plan")).toBeNull();
    act(() => bus.onInteract(PLANS_TARGET));
    await act(async () => void fireEvent.click(within(screen.getByRole("listitem", { name: "Banners" })).getByRole("button", { name: "Pin" })));
    expect(view.container.querySelector(".r3-satchel-plan")).toHaveTextContent("Banners");
    expect(view.container.querySelector(".r3-satchel-plan")).toHaveTextContent("Ready to build");
  });

  it("shows a visiting grown-up the hero's satchel too", () => {
    mount({ viewer: "parent", realm: { ...realm, isChildView: false, works: carts } });
    expect(screen.getByRole("region", { name: "Emma's satchel" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "2 Stone" })).toBeInTheDocument();
  });

  it("steps the hero's clock back to a chip, and leaves a grown-up's visit line as it was", () => {
    mount();
    expect(screen.getByRole("timer")).toHaveClass("r3-clock--quiet");
    cleanup();
    mount({ viewer: "parent", realm: { ...realm, isChildView: false } });
    expect(screen.getByRole("timer")).not.toHaveClass("r3-clock--quiet");
  });

  it("has the objective card say the plan is ready while the gold ! is on the plans board", () => {
    const rich: Works = { ...EMPTY_WORKS, balance: { ...EMPTY_WORKS.balance, dye: 4, thread: 2 }, pinned: "village-banners" };
    mount({ realm: { ...realm, works: rich } });
    expect(screen.getByText(/Everything for the Banners is ready\. Follow the gold ! to the plans board\./)).toBeInTheDocument();
    expect(screen.queryByText("Old Bram is waiting.")).toBeNull();
  });

  it("has the tutorial's find lesson say where the gold ! is while it is on the plans board", () => {
    const rich: Works = { ...EMPTY_WORKS, balance: { ...EMPTY_WORKS.balance, dye: 4, thread: 2 }, pinned: "village-banners" };
    mount({ realm: { ...realm, helpSeen: true, tutorialStep: LEGACY_STEPS + 3, works: rich } });
    expect(screen.getByText("Find a villager.")).toBeInTheDocument();
    expect(screen.getByText(/The gold ! is on the plans board/)).toBeInTheDocument();
  });
});

describe("casting by click", () => {
  it("queues the page for the scene exactly as its number key does", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Ember Bolt/ }));
    expect(handed.casts!.n).toBe(1);
    expect(handed.casts!.slots[0]).toBe(1);
  });
});

describe("a visiting parent", () => {
  it("is told whose Realm this is, and runs no clock of their own", () => {
    mount({ viewer: "parent", realm: { ...realm, isChildView: false }, entry: { minutes: 0, visit: { minutes: 40, closedBecause: null }, source: null } });
    expect(screen.getByText(/as the Quest Giver/)).toBeInTheDocument();
    expect(screen.getByText("Emma has 40 min today")).toBeInTheDocument();
    expect(screen.getByText("Old Bram is waiting for Emma.")).toBeInTheDocument();
  });

  it("wears the visitor ribbon at the head of the top lane, so the lane's messages stack under it", () => {
    const { container } = mount({ viewer: "parent", realm: { ...realm, isChildView: false } }).view;
    const lane = container.querySelector(".r3-top-lane")!;
    expect(lane.firstElementChild?.classList.contains("r3-ribbon")).toBe(true);
    expect(container.querySelectorAll(".r3-ribbon")).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ the loop */

const run = {
  runId: "run-1",
  deed: { id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const },
  questions: [
    { kind: "choice" as const, id: "q1", skillId: "add-20", prompt: "What is 2 + 3?", view: { choices: ["4", "5", "6", "7"] }, readAloud: "What is two plus three?" },
    { kind: "choice" as const, id: "q2", skillId: "add-20", prompt: "What is 4 + 4?", view: { choices: ["6", "7", "8", "9"] } },
  ],
  responses: [null, null],
  kind: "deed" as const,
  pending: null,
};

describe("talking to a villager, and doing their side quest", () => {
  it("opens a real conversation: who they are, what they need, and what the child can do", () => {
    const { bus } = mount();
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    const dialog = screen.getByRole("dialog", { name: /Old Bram/ });
    expect(dialog).toHaveTextContent("Keeper of the Village Well");
    expect(dialog).toHaveTextContent("There you are!");
    expect(dialog).toHaveTextContent("The Village Well needs 3 more side quests to rise.");
    expect(screen.getByRole("button", { name: "Begin Count the Well Stones" })).toBeInTheDocument();
  });

  it("opens the same conversation from the site itself", () => {
    const { bus } = mount();
    act(() => bus.onInteract({ kind: "site", id: "well", label: "the Village Well" }));
    expect(screen.getByRole("dialog", { name: /Old Bram/ })).toBeInTheDocument();
  });

  it("plays a whole side quest on the deed engine's actions, and raises the site as the panel closes", async () => {
    vi.mocked(startDeedRun).mockResolvedValue(run);
    vi.mocked(answerDeedQuestion).mockResolvedValueOnce({ correct: true, secondChance: false, answer: "5" }).mockResolvedValueOnce({ correct: false, secondChance: false, answer: "8" });
    vi.mocked(completeDeedRun).mockResolvedValue({
      correctCount: 1,
      total: 2,
      flawless: false,
      masteryChanges: ["Adding within 20 is getting stronger."],
      stars: 1,
      previousBest: 0,
      deedBest: 1,
      counted: true,
      crowned: false,
      kind: "deed",
      building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 0, maxStars: 0, practice: false }, minutesEarned: 0, sideQuestPayFull: false,
    });
    const { bus, view } = mount();
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    expect(startDeedRun).toHaveBeenCalledWith("demo-child-1", "well-stones", "realm");
    expect(screen.getByText("What is 2 + 3?")).toBeInTheDocument();

    // The number row answers, the way it casts.
    await act(async () => void fireEvent.keyDown(window, { code: "Digit2", key: "2" }));
    expect(answerDeedQuestion).toHaveBeenCalledWith("run-1", 0, "5");
    expect(screen.getByText(/That's it! Old Bram is pleased/)).toBeInTheDocument();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Next question" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "6" })));
    expect(screen.getByText("The answer was 8.")).toBeInTheDocument();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
    expect(completeDeedRun).toHaveBeenCalledWith("run-1");
    expect(screen.getByText("Side quest done!")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 right in Count the Well Stones.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Adding within 20 is getting stronger.")).toBeInTheDocument();
    // Nothing has moved yet: the site rises as the child comes back to the world.
    expect(view.container.querySelector(".r3-quest .r3-progress-text")).toHaveTextContent("2 of 5");

    fireEvent.click(screen.getByRole("button", { name: /Back to the Realm/ }));
    expect(bus.paused).toBe(false);
    expect(view.container.querySelector(".r3-quest .r3-progress-text")).toHaveTextContent("3 of 5");
    expect(screen.getByText("The Village Well is rising!")).toBeInTheDocument();
    expect(screen.getByText("Old Bram says thank you.")).toBeInTheDocument();
    const layout = handed.props!.layout as { villagers: { id: string; done: number }[] };
    expect(layout.villagers.find((v) => v.id === "bram")!.done).toBe(3);
  });

  it("a side quest that earned no star does not say the building rose, and the board keeps its stars", async () => {
    vi.mocked(startDeedRun).mockResolvedValue({ ...run, questions: [run.questions[0]], responses: [null] });
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: false, secondChance: false, answer: "5" });
    vi.mocked(completeDeedRun).mockResolvedValue({ correctCount: 0, total: 1, flawless: false, masteryChanges: [], stars: 0, previousBest: 0, deedBest: 0, counted: false, crowned: false, kind: "deed" as const, building: { label: "Village Well", done: 2, total: 5, complete: false, stars: 0, maxStars: 3, practice: false }, minutesEarned: 0, sideQuestPayFull: false });
    const { bus } = mount();
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "6" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
    fireEvent.click(screen.getByRole("button", { name: /Back to the Realm/ }));
    expect(screen.getByText("Old Bram will help you try again.")).toBeInTheDocument();
    expect(screen.queryByText(/is rising/)).toBeNull();
  });

  it("shows the new best when the child returns to the villager without a reload", async () => {
    vi.mocked(startDeedRun).mockResolvedValue({ ...run, questions: [run.questions[0]], responses: [null] });
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
    vi.mocked(completeDeedRun).mockResolvedValue({ correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 3, previousBest: 0, deedBest: 3, counted: true, crowned: false, kind: "deed" as const, building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 3, maxStars: 3, practice: false }, minutesEarned: 0, sideQuestPayFull: false });
    const { bus } = mount();
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    expect(screen.getByRole("img", { name: "0 of 3 stars" })).toBeInTheDocument();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "5" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
    fireEvent.click(screen.getByRole("button", { name: /Back to the Realm/ }));
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    expect(screen.getByRole("img", { name: "3 of 3 stars" })).toBeInTheDocument();
  });

  it("a won Crown Challenge says so over the world and shows its crown without a reload", async () => {
    const starred = { ...realm, kingdom: { ...realm.kingdom, buildings: realm.kingdom.buildings.map((b) => (b.id === "well" ? { ...b, deeds: b.deeds.map((d) => ({ ...d, bestStars: 3 as const })) } : b)) } };
    vi.mocked(startDeedRun).mockResolvedValue({ ...run, kind: "challenge", questions: [run.questions[0]], responses: [null] });
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
    vi.mocked(completeDeedRun).mockResolvedValue({ correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 0, previousBest: 3, deedBest: 3, counted: false, crowned: true, kind: "challenge" as const, building: { label: "Village Well", done: 2, total: 5, complete: false, stars: 3, maxStars: 3, practice: false }, minutesEarned: 0, sideQuestPayFull: false });
    const { bus } = mount({ realm: starred });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    expect(screen.queryByText("Crown earned")).toBeNull();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin the Crown Challenge for Count the Well Stones" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "5" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
    fireEvent.click(screen.getByRole("button", { name: /Back to the Realm/ }));
    expect(screen.getByText("Crowned!")).toBeInTheDocument();
    expect(screen.queryByText(/will help you try again/)).toBeNull();
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    expect(screen.getByText("Crown earned")).toBeInTheDocument();
  });

  it("still raises the site when the child leaves the results with Esc", async () => {
    vi.mocked(startDeedRun).mockResolvedValue({ ...run, questions: [run.questions[0]], responses: [null] });
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
    vi.mocked(completeDeedRun).mockResolvedValue({ correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 1, previousBest: 0, deedBest: 1, counted: true, crowned: false, kind: "deed" as const, building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 0, maxStars: 0, practice: false }, minutesEarned: 0, sideQuestPayFull: false });
    const { bus, view } = mount();
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "5" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
    expect(screen.getByText("Flawless!")).toBeInTheDocument();
    esc();
    expect(view.container.querySelector(".r3-quest .r3-progress-text")).toHaveTextContent("3 of 5");
  });

  it("raises a whole building, and the village plank counts it", async () => {
    vi.mocked(startDeedRun).mockResolvedValue({ ...run, questions: [run.questions[0]], responses: [null] });
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
    vi.mocked(completeDeedRun).mockResolvedValue({ correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 1, previousBest: 0, deedBest: 1, counted: true, crowned: false, kind: "deed" as const, building: { label: "Village Well", done: 5, total: 5, complete: true, stars: 0, maxStars: 0, practice: false }, minutesEarned: 0, sideQuestPayFull: false });
    const well = { ...realm, kingdom: { ...realm.kingdom, buildings: realm.kingdom.buildings.map((b) => (b.id === "well" ? { ...b, done: 4 } : b)) } };
    const { bus } = mount({ realm: well });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "5" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
    fireEvent.click(screen.getByRole("button", { name: /Back to the Realm/ }));
    expect(screen.getByText("1 of 8 built")).toBeInTheDocument();
    expect(screen.getByText("The Village Well stands!")).toBeInTheDocument();
    expect(screen.getByText("Next: the Grain Mill, with Miller Tessa.")).toBeInTheDocument();
    const layout = handed.props!.layout as { props: { id: string; kind: string }[] };
    expect(layout.props.find((p) => p.id === "well")!.kind).toBe("building");
    // The hand-up showed the rise, so the world never owes it again.
    expect(markBuildingsAnnounced).toHaveBeenCalledTimes(1);
    expect(markBuildingsAnnounced).toHaveBeenCalledWith("demo-child-1", ["well"]);
  });

  it("marks no rise from a hand-up outside the hero's own view (viewer parent)", () => {
    const well = { ...realm, kingdom: { ...realm.kingdom, buildings: realm.kingdom.buildings.map((b) => (b.id === "well" ? { ...b, done: 4 } : b)) } };
    mount({ viewer: "parent", realm: well });
    // The finished side quest's answer as the board hands it up (`DeedResult`): the building's progress, rose.
    act(() => window.__realmRaise!("well", { label: "Village Well", done: 5, total: 5, complete: true, practice: false, counted: true, minutesEarned: 0 }));
    expect(screen.getByText("The Village Well stands!")).toBeInTheDocument();
    expect(markBuildingsAnnounced).not.toHaveBeenCalled();
  });

  it("marks nothing when a side quest only moved a building along", async () => {
    vi.mocked(startDeedRun).mockResolvedValue({ ...run, questions: [run.questions[0]], responses: [null] });
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
    vi.mocked(completeDeedRun).mockResolvedValue({ correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 1, previousBest: 0, deedBest: 1, counted: true, crowned: false, kind: "deed" as const, building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 0, maxStars: 0, practice: false }, minutesEarned: 0, sideQuestPayFull: false });
    const { bus } = mount();
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "5" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
    fireEvent.click(screen.getByRole("button", { name: /Back to the Realm/ }));
    expect(markBuildingsAnnounced).not.toHaveBeenCalled();
  });

  it("a visiting grown-up reads the side quests and can begin none, and nothing is written", () => {
    const { bus } = mount({ viewer: "parent", realm: { ...realm, isChildView: false, tutorialStep: 0, helpSeen: false } });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    const dialog = screen.getByRole("dialog", { name: /Old Bram/ });
    expect(dialog).toHaveTextContent("Side Quests are for Emma to play.");
    expect(dialog).toHaveTextContent("Count the Well Stones");
    expect(screen.queryByRole("button", { name: /Begin/ })).toBeNull();
    expect(startDeedRun).not.toHaveBeenCalled();
    expect(setTutorialStep).not.toHaveBeenCalled();
    expect(markRealmHelpSeen).not.toHaveBeenCalled();
  });
});

describe("what do I do?", () => {
  it("points the gold ! and the map at the villager who is waiting", () => {
    const { bus, view } = mount();
    const bram = (handed.props!.layout as { villagers: { id: string; position: { x: number; z: number } }[] }).villagers.find((v) => v.id === "bram")!;
    expect(bus.goal).toMatchObject({ on: true, x: bram.position.x, z: bram.position.z });
    expect(view.container.querySelector(".r3-goal-name")).toHaveTextContent("Old Bram");
    expect(view.container.querySelector(".r3-map-goal")).not.toBeNull();
    expect(screen.getByText(/Follow the gold !/)).toBeInTheDocument();
  });

  it("offers the kingdom again when it failed to load", async () => {
    vi.mocked(getRealmKingdom).mockResolvedValue(realm.kingdom);
    const { view } = mount({ realm: { ...realm, kingdom: { tone: "gentle", buildings: [] }, kingdomError: "The villagers are resting. Try again." } });
    expect(screen.getByText("The villagers are resting. Try again.")).toBeInTheDocument();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(getRealmKingdom).toHaveBeenCalledWith("demo-child-1");
    expect(view.container.querySelector(".r3-quest-title")).toHaveTextContent("Village Well");
  });
});

describe("the tutorial", () => {
  const fresh = { ...realm, tutorialStep: 0, helpSeen: true };
  const walk = (bus: HudBus, distance: number) => act(() => bus.onWalked(distance));

  it("teaches by doing: walk with two keys, then look, then jump, then find and talk to Old Bram", () => {
    const { bus } = mount({ realm: fresh });
    expect(screen.getByText("Walk around.")).toBeInTheDocument();
    expect(screen.getByText("Lesson 1 of 7")).toBeInTheDocument();
    // One key is not steering.
    act(() => void fireEvent.keyDown(window, { code: "KeyW" }));
    walk(bus, 6);
    expect(screen.getByText("Walk around.")).toBeInTheDocument();
    act(() => void fireEvent.keyDown(window, { code: "KeyD" }));
    walk(bus, 8);
    expect(screen.getByText("Look around.")).toBeInTheDocument();
    expect(setTutorialStep).toHaveBeenLastCalledWith("demo-child-1", LEGACY_STEPS + 1);
    // The world never paused for any of it.
    expect(bus.paused).toBe(false);
  });

  it("finds Old Bram only when he is the one in reach, and talking to him is the next lesson", () => {
    const { bus } = mount({ realm: { ...fresh, tutorialStep: LEGACY_STEPS + 3 } });
    expect(screen.getByText("Find Old Bram.")).toBeInTheDocument();
    act(() => bus.onNear({ kind: "villager", id: "tessa", label: "Miller Tessa" }));
    expect(screen.getByText("Find Old Bram.")).toBeInTheDocument();
    act(() => bus.onNear({ kind: "villager", id: "bram", label: "Old Bram" }));
    expect(screen.getByText("Talk to Old Bram.")).toBeInTheDocument();
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    fireEvent.click(screen.getByRole("button", { name: "Goodbye" }));
    expect(screen.getByText("Cast Ember Bolt.")).toBeInTheDocument();
    act(() => bus.onCast(1));
    expect(screen.getByText("Get more spells.")).toBeInTheDocument();
  });

  it("does not make a child walk away and back when they are already beside Old Bram", () => {
    const { bus } = mount({ realm: { ...fresh, tutorialStep: LEGACY_STEPS + 2 } });
    act(() => bus.onNear({ kind: "villager", id: "bram", label: "Old Bram" }));
    expect(screen.getByText("Jump!")).toBeInTheDocument();
    act(() => void fireEvent.keyDown(window, { code: "Space" }));
    expect(screen.getByText("Talk to Old Bram.")).toBeInTheDocument();
  });

  it("finishes on the empty page, which says how THIS child earns a spell", async () => {
    mount({ realm: { ...fresh, tutorialStep: LEGACY_STEPS + 6 } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /Page 2 is empty/ })));
    expect(setTutorialStep).toHaveBeenLastCalledWith("demo-child-1", STORED_MAX);
    expect(screen.getByText(/write one now/)).toBeInTheDocument();
    expect(screen.getByText(/3 more Math quests or side quests to go/)).toBeInTheDocument();
  });

  it("can be skipped, and a skip is written down so it never comes back", () => {
    mount({ realm: fresh });
    fireEvent.click(screen.getByRole("button", { name: "Skip the tutorial" }));
    expect(setTutorialStep).toHaveBeenLastCalledWith("demo-child-1", STORED_MAX);
    expect(screen.queryByText("Walk around.")).toBeNull();
  });

  it("never runs for a child who finished it, nor for a visiting grown-up", () => {
    mount({ realm: { ...realm, tutorialStep: STORED_MAX, helpSeen: true } });
    expect(screen.queryByText(/Lesson \d of/)).toBeNull();
    cleanup();
    mount({ viewer: "parent", realm: { ...realm, isChildView: false, tutorialStep: 0, helpSeen: false } });
    expect(screen.queryByText(/Lesson \d of/)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers Skip this step after a long while on one lesson, so a child is never stuck", () => {
    vi.useFakeTimers();
    try {
      mount({ realm: { ...fresh, tutorialStep: LEGACY_STEPS + 3 } });
      expect(screen.getByText("Find Old Bram.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Skip this step" })).toBeNull();
      act(() => void vi.advanceTimersByTime(45_000));
      fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
      expect(screen.getByText("Talk to Old Bram.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Skip this step" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("can be shown again from How to play", () => {
    mount({ realm: { ...realm, tutorialStep: STORED_MAX, helpSeen: true } });
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    fireEvent.click(screen.getByRole("button", { name: "Show me the tutorial again" }));
    expect(setTutorialStep).toHaveBeenLastCalledWith("demo-child-1", 0);
    expect(screen.getByText("Walk around.")).toBeInTheDocument();
  });

  it("counts a flat-Realm graduate as new to the 3D controls", () => {
    mount({ realm: { ...realm, tutorialStep: LEGACY_STEPS, helpSeen: true } });
    expect(screen.getByText("Walk around.")).toBeInTheDocument();
  });

  it("hides while a panel is up", () => {
    mount({ realm: fresh });
    esc();
    expect(screen.queryByText("Walk around.")).toBeNull();
    esc();
    expect(screen.getByText("Walk around.")).toBeInTheDocument();
    expect(LESSONS).toHaveLength(8);
  });
});

describe("a child's first visit", () => {
  it("welcomes them, pauses the world, and starts the tutorial when they ask to be shown", () => {
    const { bus } = mount({ realm: { ...realm, tutorialStep: 0, helpSeen: false } });
    expect(screen.getByRole("dialog", { name: "Welcome to your Realm" })).toHaveTextContent("Old Bram is waiting for you.");
    expect(bus.paused).toBe(true);
    expect(screen.queryByText("Walk around.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show me how to play/ }));
    expect(markRealmHelpSeen).toHaveBeenCalledWith("demo-child-1");
    expect(bus.paused).toBe(false);
    expect(screen.getByText("Walk around.")).toBeInTheDocument();
  });

  it("lets a child who knows the game skip the tutorial from the welcome", () => {
    mount({ realm: { ...realm, tutorialStep: 0, helpSeen: false } });
    fireEvent.click(screen.getByRole("button", { name: "I know how to play" }));
    expect(setTutorialStep).toHaveBeenLastCalledWith("demo-child-1", STORED_MAX);
    expect(screen.queryByText("Walk around.")).toBeNull();
  });

  it("closes on Esc without skipping anything, and writes it down as seen", () => {
    mount({ realm: { ...realm, tutorialStep: 0, helpSeen: false } });
    esc();
    expect(markRealmHelpSeen).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Walk around.")).toBeInTheDocument();
  });
});

describe("a building finished away from the Realm", () => {
  const stands = { ...realm, helpSeen: true, kingdom: { ...realm.kingdom, buildings: realm.kingdom.buildings.map((b) => (b.id === "well" ? { ...b, done: 5, complete: true } : b)) }, unannounced: ["well"] };

  it("rises on entry with the rise toast, and is marked announced", async () => {
    mount({ realm: stands });
    expect(screen.getByText("The Village Well stands!")).toBeInTheDocument();
    expect(markBuildingsAnnounced).toHaveBeenCalledWith("demo-child-1", ["well"]);
  });

  it("says the side quests already finished it when the migration did", () => {
    mount({ realm: { ...stands, regraded: true } });
    expect(screen.getByText("Your side quests already finished the Village Well!")).toBeInTheDocument();
    expect(screen.getByText("It stands now!")).toBeInTheDocument();
  });

  it("waits for the welcome to be closed, and then rises", () => {
    mount({ realm: { ...stands, tutorialStep: 0, helpSeen: false } });
    expect(screen.queryByText("The Village Well stands!")).toBeNull();
    expect(markBuildingsAnnounced).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "I know how to play" }));
    expect(screen.getByText("The Village Well stands!")).toBeInTheDocument();
    expect(markBuildingsAnnounced).toHaveBeenCalledTimes(1);
  });

  it("is not shown to a grown-up visiting, and does not use up the hero's moment", () => {
    mount({ viewer: "parent", realm: { ...stands, isChildView: false } });
    expect(screen.queryByText("The Village Well stands!")).toBeNull();
    expect(markBuildingsAnnounced).not.toHaveBeenCalled();
  });

  it("is not used up by a parent's view of the hero's page either (viewer parent), like every other hero write", () => {
    mount({ viewer: "parent", realm: stands });
    expect(screen.queryByText("The Village Well stands!")).toBeNull();
    expect(markBuildingsAnnounced).not.toHaveBeenCalled();
  });
});

describe("the crown ceremony", () => {
  const crowned = { ...realm, helpSeen: true, ceremony: { seasonId: "season-1", crownId: "crown-copper", ordinal: 1, seasonLabel: "Autumn 2026" } };

  it("is held on arrival and recorded when the child hails it", async () => {
    const { bus } = mount({ realm: crowned });
    expect(screen.getByRole("dialog", { name: "The crown ceremony" })).toHaveTextContent("Season 1 complete");
    expect(screen.getByText("The people of the Realm gather.")).toBeInTheDocument();
    expect(bus.paused).toBe(true);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /Wear it proudly/ })));
    expect(markCeremonySeen).toHaveBeenCalledWith("demo-child-1", "season-1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is recorded even when skipped with Esc, as the flat Realm's Skip was", () => {
    mount({ realm: crowned });
    esc();
    expect(markCeremonySeen).toHaveBeenCalledWith("demo-child-1", "season-1");
  });

  it("says so when the record fails, and stays to try again", async () => {
    vi.mocked(markCeremonySeen).mockRejectedValueOnce(new Error("no"));
    mount({ realm: crowned });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /Wear it proudly/ })));
    expect(screen.getByText("The crown could not be recorded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });

  it("follows the first-visit welcome rather than covering it", () => {
    mount({ realm: { ...crowned, helpSeen: false, tutorialStep: 0 } });
    expect(screen.getByRole("dialog", { name: "Welcome to your Realm" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show me how to play/ }));
    expect(screen.getByRole("dialog", { name: "The crown ceremony" })).toBeInTheDocument();
  });

  it("is never held for a visiting grown-up", () => {
    mount({ viewer: "parent", realm: { ...crowned, isChildView: false } });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("clearing a trouble, through the whole frame", () => {
  // Each half of this was tested alone and passed while the whole lost the trouble's home: the
  // sound's tap on the trouble bus dropped the third argument. So this goes through everything
  // `RealmGame` really mounts on the one bus — the sound, the notices, the bounty — and fires the
  // event exactly as `troubles-scene.tsx` does.
  it("sends the cleared trouble's home to the bounty, with the sound listening in", async () => {
    vi.mocked(getTroubleBounty).mockResolvedValue({ enabled: true, capMinutes: 5, subCapMinutes: 5, paidMinutes: 0, remainingMinutes: 5, clearsToday: 0, paidHomes: [] });
    vi.mocked(recordTroubleClears).mockResolvedValue({
      awarded: 1,
      status: { enabled: true, capMinutes: 5, subCapMinutes: 5, paidMinutes: 1, remainingMinutes: 4, clearsToday: 1, paidHomes: ["place-summit-1"] },
    } as never);
    const { view } = mount();
    // The purse is seeded from the server first.
    await act(async () => {});
    const tbus = handed.props!.troubles as TroubleBus;
    await act(async () => tbus.onEvent({ kind: "cleared", trouble: "fog", home: 0, x: 0, z: 0, count: 1 }, "Cloudfoot", "place-summit-1"));
    expect(recordTroubleClears).toHaveBeenCalledWith("demo-child-1", ["place-summit-1"]);
    expect(screen.getByText(/\+1 minute/)).toBeInTheDocument();
    view.unmount();
  });
});

describe("a side quest's answer that arrives after the board has closed", () => {
  const one = { ...run, questions: [run.questions[0]], responses: [null] };
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  };
  const done = (label: string, n: number) => ({ correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 1, previousBest: 0, deedBest: 1, counted: true, crowned: false, kind: "deed" as const, building: { label, done: n, total: 5, complete: false, stars: 0, maxStars: 0 }, minutesEarned: 0, sideQuestPayFull: false });

  it("raises the building at once when the child pressed Esc during Finish", async () => {
    vi.mocked(startDeedRun).mockResolvedValue(one);
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
    const late = deferred<ReturnType<typeof done>>();
    vi.mocked(completeDeedRun).mockReturnValue(late.promise as never);
    const { bus, view } = mount();
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "5" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
    esc();
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => late.resolve(done("Village Well", 3)));
    expect(view.container.querySelector(".r3-quest .r3-progress-text")).toHaveTextContent("3 of 5");
    expect(screen.getByText("The Village Well is rising!")).toBeInTheDocument();
  });

  it("keeps two buildings' answers apart: neither is lost when the second board closes", async () => {
    const withMill = {
      ...realm,
      kingdom: {
        ...realm.kingdom,
        buildings: realm.kingdom.buildings.map((b) => (b.id === "mill" ? { ...b, done: 1, deeds: [{ id: "mill-sacks", title: "Count the Sacks", story: "Sacks everywhere.", area: "math" as const, bestStars: 0 as const, crowned: false }] } : b)),
      },
    };
    vi.mocked(startDeedRun).mockImplementation(async (_c, deedId) => (deedId === "mill-sacks" ? { ...one, runId: "run-2", deed: { ...one.deed, id: "mill-sacks", title: "Count the Sacks" } } : one));
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
    const wellLate = deferred<ReturnType<typeof done>>();
    vi.mocked(completeDeedRun).mockImplementation(async (runId) => (runId === "run-1" ? (wellLate.promise as never) : (done("Grain Mill", 2) as never)));
    const { bus } = mount({ realm: withMill });
    // The well's Finish goes out; the child walks away before it answers...
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "5" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
    esc();
    // ...straight to the mill, whose board is open when the well's answer lands.
    act(() => bus.onInteract({ kind: "villager", id: "tessa", label: "Miller Tessa" }));
    await act(async () => wellLate.resolve(done("Village Well", 3)));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Sacks" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "5" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
    fireEvent.click(screen.getByRole("button", { name: /Back to the Realm/ }));
    const layout = handed.props!.layout as { villagers: { id: string; done: number }[] };
    expect(layout.villagers.find((v) => v.id === "bram")!.done).toBe(3);
    expect(layout.villagers.find((v) => v.id === "tessa")!.done).toBe(2);
  });
});

describe("read-aloud, as a side quest ends", () => {
  it("says the building is rising, and leaving the board does not cut it off", async () => {
    const said: string[] = [];
    const synth = { cancel: vi.fn(() => said.push("cancel")), speak: vi.fn((u: { text: string }) => said.push(`speak:${u.text}`)) };
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = synth;
    (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = function (this: { text: string }, text: string) {
      this.text = text;
    };
    try {
      vi.mocked(startDeedRun).mockResolvedValue({ ...run, questions: [run.questions[0]], responses: [null] });
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
      vi.mocked(completeDeedRun).mockResolvedValue({ correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 1, previousBest: 0, deedBest: 1, counted: true, crowned: false, kind: "deed" as const, building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 0, maxStars: 0, practice: false }, minutesEarned: 0, sideQuestPayFull: false });
      const { bus } = mount({ realm: { ...realm, profile: { ...realm.profile, readAloud: true } } });
      act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "5" })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
      said.length = 0;
      fireEvent.click(screen.getByRole("button", { name: /Back to the Realm/ }));
      const rising = said.findIndex((s) => s.startsWith("speak:The Village Well is rising!"));
      expect(rising).toBeGreaterThanOrEqual(0);
      // Nothing cancels it after it was asked for.
      expect(said.slice(rising + 1)).not.toContain("cancel");
    } finally {
      delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    }
  });
});

describe("where the keyboard lands when a panel opens", () => {
  it("is the welcome's go button, never a setting a stray Enter would write", () => {
    mount({ realm: { ...realm, helpSeen: false, tutorialStep: 0 } });
    expect(screen.getByRole("dialog", { name: "Welcome to your Realm" })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Show me how to play/ }));
  });
});

describe("a grown-up who may only look", () => {
  const visit = { viewer: "parent" as const, realm: { ...realm, isChildView: false } };

  it("gets the depth and tone choices when they may write", () => {
    mount(visit);
    esc();
    expect(screen.getByRole("group", { name: "How much to show" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Troubles look like" })).toBeInTheDocument();
  });

  it("is offered nothing that would be refused, and their own sound still saves (a visitor's sound needs read access only)", () => {
    vi.useFakeTimers();
    try {
      mount({ ...visit, realm: { ...visit.realm, viewerCanWrite: false } });
      esc();
      expect(screen.queryByRole("group", { name: "How much to show" })).toBeNull();
      expect(screen.queryByRole("group", { name: "Troubles look like" })).toBeNull();
      expect(screen.getByText("Sound (just for you)")).toBeInTheDocument();
      fireEvent.change(screen.getByRole("slider", { name: "Volume" }), { target: { value: "40" } });
      act(() => void vi.advanceTimersByTime(2000));
      expect(saveRealmSound).toHaveBeenCalled();
      expect(screen.queryByText("That didn't save. Try again.")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the wardrobe", () => {
  const openWardrobe = async () => {
    esc();
    fireEvent.click(screen.getByRole("button", { name: /Wardrobe/ }));
    await screen.findByText("Customize Your Hero");
  };

  it("dresses the hero from the pause menu, in the world, without a reload", async () => {
    mount({ avatar: { ...DEFAULT_AVATAR, hairStyle: "short" } });
    await openWardrobe();
    const mounted = canvasMounts.n;
    expect(screen.queryByRole("button", { name: "Mount" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hair" }));
    fireEvent.click(screen.getByRole("button", { name: /^Long/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Hero Look" }));
    await waitFor(() => expect((handed.props!.avatar as AvatarConfig).hairStyle).toBe("long"));
    expect(updateAvatarConfig).toHaveBeenCalledWith("demo-child-1", expect.objectContaining({ hairStyle: "long" }));
    expect(screen.queryByText("Customize Your Hero")).toBeNull();
    expect(handed.bus!.paused).toBe(false);
    expect(canvasMounts.n).toBe(mounted);
  });

  it("goes back to the pause menu on Esc, still paused", async () => {
    mount();
    await openWardrobe();
    esc();
    expect(screen.queryByText("Customize Your Hero")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeInTheDocument();
    expect(handed.bus!.paused).toBe(true);
  });

  it("keeps the old look, says why, and stays paused when the save is refused", async () => {
    vi.mocked(updateAvatarConfig).mockRejectedValueOnce(new Error('Item "Long" is locked.'));
    mount({ avatar: { ...DEFAULT_AVATAR, hairStyle: "short" } });
    await openWardrobe();
    fireEvent.click(screen.getByRole("button", { name: "Hair" }));
    fireEvent.click(screen.getByRole("button", { name: /^Long/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Hero Look" }));
    expect(await screen.findByText('Item "Long" is locked.')).toBeInTheDocument();
    expect((handed.props!.avatar as AvatarConfig).hairStyle).toBe("short");
    expect(handed.bus!.paused).toBe(true);
  });

  it("is not offered to a visiting grown-up", () => {
    mount({ viewer: "parent", realm: { ...realm, isChildView: false } });
    esc();
    expect(screen.queryByRole("button", { name: /Wardrobe/ })).toBeNull();
  });
});

describe("day and night", () => {
  it("hands the scene the family's timezone", () => {
    mount({ realm: { ...realm, timezone: "Asia/Tokyo" } });
    expect(handed.props!.timeZone).toBe("Asia/Tokyo");
  });
});

describe("the quiet world (0 minutes in an earning mode)", () => {
  const QUIET = "Earn play time with a side quest";
  const quiet = { entry: { minutes: 0, visit: null, source: "quiet" as const }, avatar: { ...DEFAULT_AVATAR, mount: "pony" }, mounts: ["pony"] };
  const arch = { kind: "arch" as const, id: "ring", label: "the Ring", verb: "Run" };
  const one = { ...run, questions: [run.questions[0]], responses: [null] };
  const paid = (minutesEarned: number) => ({ correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 3 as const, previousBest: 0 as const, deedBest: 3 as const, counted: true, crowned: false, kind: "deed" as const, building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 3, maxStars: 3, practice: false }, minutesEarned, sideQuestPayFull: false });
  const pressM = () => act(() => void fireEvent.keyDown(window, { code: "KeyM", key: "m" }));
  const ride = () => handed.props!.ride as RideBus;
  async function playPayingQuest(bus: HudBus, minutes: number) {
    vi.mocked(startDeedRun).mockResolvedValue(one);
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
    vi.mocked(completeDeedRun).mockResolvedValue(paid(minutes));
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "5" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /Back to the Realm/ })));
  }

  it("shows the invitation where the minutes were, and hands the canvas no troubles", () => {
    const { view } = mount(quiet);
    expect(view.container.querySelector(".r3-clock-text")).toHaveTextContent(QUIET);
    expect(screen.queryByText(/min left/)).toBeNull();
    expect(handed.props!.troubles).toBeUndefined();
    // Everything else stays on: the villagers, the objective, the spells.
    expect(handed.props!.layout).toBeDefined();
    expect(handed.props!.recess).toBeDefined();
  });

  it("the saddle rests: no Ride slot, and M invites to a side quest instead of riding", () => {
    mount(quiet);
    expect(screen.queryByRole("button", { name: /Ride your Pony/ })).toBeNull();
    pressM();
    expect(screen.getByText(`Your Pony is resting. ${QUIET}.`)).toBeInTheDocument();
    act(() => {
      for (let i = 0; i < 30; i++) stepRide(ride(), 0.05, 0);
    });
    expect(ride().phase).toBe("off");
  });

  it("the Ring's arch opens nothing, and says why", () => {
    const { bus } = mount(quiet);
    act(() => bus.onInteract(arch));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bus.paused).toBe(false);
    expect(screen.getByText(`The Ring is resting. ${QUIET}.`)).toBeInTheDocument();
  });

  it("a side quest that pays wakes the world: the gate is asked again, a toast, the clock and the troubles", async () => {
    vi.mocked(getRealmAccess).mockResolvedValue({ allowed: true, minutesRemaining: 3, source: "earned" });
    const { bus, view } = mount(quiet);
    await playPayingQuest(bus, 3);
    expect(getRealmAccess).toHaveBeenCalledWith("demo-child-1");
    expect(screen.getByText("+3 minutes — the Realm wakes up!")).toBeInTheDocument();
    expect(view.container.querySelector(".r3-clock-text")).toHaveTextContent("3 min left");
    expect(handed.props!.troubles).toBeDefined();
    expect(screen.getByRole("button", { name: /Ride your Pony/ })).toBeInTheDocument();
  });

  it("one minute is a minute", async () => {
    vi.mocked(getRealmAccess).mockResolvedValue({ allowed: true, minutesRemaining: 1, source: "earned" });
    const { bus } = mount(quiet);
    await playPayingQuest(bus, 1);
    expect(screen.getByText("+1 minute — the Realm wakes up!")).toBeInTheDocument();
  });

  it("a side quest that paid nothing does not ask the gate (and the world stays quiet)", async () => {
    const { bus, view } = mount(quiet);
    await playPayingQuest(bus, 0);
    expect(getRealmAccess).not.toHaveBeenCalled();
    expect(view.container.querySelector(".r3-clock-text")).toHaveTextContent(QUIET);
  });

  it("going quiet mid-visit: off the mount at once, and the troubles leave the world", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getRealmAccess).mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "quiet" });
      const { view } = mount({ ...quiet, entry: { minutes: 0, visit: null, source: "earned" } });
      expect(handed.props!.troubles).toBeDefined();
      pressM();
      act(() => {
        for (let i = 0; i < 30; i++) stepRide(ride(), 0.05, 0);
      });
      expect(ride().phase).toBe("on");
      // The clock at 0 asks the gate on its next tick; the answer is quiet.
      await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
      expect(view.container.querySelector(".r3-clock-text")).toHaveTextContent(QUIET);
      expect(ride().phase).toBe("off");
      expect(handed.props!.troubles).toBeUndefined();
      expect(screen.queryByRole("button", { name: /Get off/ })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a parent visit is never quiet: no clock, so the troubles and the Ring are as they always are", () => {
    const { bus } = mount({ viewer: "parent", realm: { ...realm, isChildView: false }, entry: { minutes: 0, visit: { minutes: 0, closedBecause: null }, source: "quiet" } });
    expect(screen.queryByText(QUIET)).toBeNull();
    expect(screen.getByText("Emma has 0 min today")).toBeInTheDocument();
    expect(handed.props!.troubles).toBeDefined();
    // The arch opens the Ring's board (the child's record), and never says it is resting.
    act(() => bus.onInteract(arch));
    expect(screen.getByRole("dialog", { name: "The Ring" })).toBeInTheDocument();
    expect(screen.queryByText(/The Ring is resting/)).toBeNull();
  });

  it("calm and low-stimulus profiles still render the quiet world", () => {
    const { view } = mount({ ...quiet, realm: { ...realm, profile: { ...DEFAULT_LEARNING_PROFILE, lowStimulus: true, reducedMotion: true } } });
    expect(view.container.querySelector(".r3-clock-text")).toHaveTextContent(QUIET);
    expect(handed.props!.troubles).toBeUndefined();
  });
});

describe("the villagers have heard about real quests", () => {
  const TODAY = "2026-11-19";
  const FRACTIONS: RecentQuest = { assignmentId: "a-frac", title: "Fractions of a Pizza", material: "stone" };
  const withQuests = (...recentQuests: RecentQuest[]): RealmData => ({ ...realm, recentQuests, today: TODAY });
  const GERD = "Stones to count before the lantern's lit.";

  beforeEach(() => sessionStorage.clear());

  it("has the villager mention a quest the hero finished, in their trade, in place of the greeting", () => {
    const { bus } = mount({ realm: withQuests(FRACTIONS) });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    const dialog = screen.getByRole("dialog", { name: /Old Bram/ });
    expect(dialog).toHaveTextContent("Fractions of a Pizza");
    expect(dialog).not.toHaveTextContent("The bucket's dry again");
    // The objective's hello stays: Bram is the villager the gold ! led the hero to.
    expect(dialog).toHaveTextContent("There you are!");
  });

  it("shows the title as plain text, never as markup", () => {
    const title = "<b>Bold</b> & <img src=x>";
    const { bus } = mount({ realm: withQuests({ ...FRACTIONS, title }) });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    const dialog = screen.getByRole("dialog", { name: /Old Bram/ });
    expect(dialog).toHaveTextContent(title);
    expect(dialog.querySelector("b, img")).toBeNull();
  });

  it("greets as always when no recent quest is in the villager's trade, or there are none", () => {
    const { bus } = mount({ realm: withQuests({ ...FRACTIONS, material: "ink" }) });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    expect(screen.getByRole("dialog", { name: /Old Bram/ })).toHaveTextContent("The bucket's dry again");
    cleanup();
    sessionStorage.clear();
    const bare = mount({ realm: { ...realm, today: TODAY } });
    act(() => bare.bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    expect(screen.getByRole("dialog", { name: /Old Bram/ })).toHaveTextContent("The bucket's dry again");
  });

  it("gives a grown-up's visit no mention, and writes nothing to the day's memory", () => {
    const { bus } = mount({ viewer: "parent", realm: { ...withQuests(FRACTIONS), isChildView: false } });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    const dialog = screen.getByRole("dialog", { name: /Old Bram/ });
    expect(dialog).not.toHaveTextContent("Fractions of a Pizza");
    expect(dialog).toHaveTextContent("The bucket's dry again");
    expect(sessionStorage.length).toBe(0);
  });

  it("gives the hero seen as a visitor (viewer=parent) no mention either", () => {
    const { bus } = mount({ viewer: "parent", realm: withQuests(FRACTIONS) });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    expect(screen.getByRole("dialog", { name: /Old Bram/ })).not.toHaveTextContent("Fractions of a Pizza");
    expect(sessionStorage.length).toBe(0);
  });

  it("does not repeat the quest to a second villager the same day", () => {
    const { bus } = mount({ realm: withQuests(FRACTIONS) });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    expect(screen.getByRole("dialog", { name: /Old Bram/ })).toHaveTextContent("Fractions of a Pizza");
    esc();
    // Gerd cares about stone too; the quest is spoken for, so he greets.
    act(() => bus.onInteract({ kind: "villager", id: "gerd", label: "Mason Gerd" }));
    const dialog = screen.getByRole("dialog", { name: /Mason Gerd/ });
    expect(dialog).not.toHaveTextContent("Fractions of a Pizza");
    expect(dialog).toHaveTextContent(GERD);
  });

  it("keeps the line steady while the board is open, and does not use up a second quest on a re-render", () => {
    const second: RecentQuest = { assignmentId: "a-two", title: "Long Division", material: "stone" };
    const { bus, view } = mount({ realm: withQuests(FRACTIONS, second) });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    const said = screen.getByRole("dialog", { name: /Old Bram/ }).textContent;
    view.rerender(<RealmGame heroName="Emma" spellbook={spellbook} realm={withQuests(FRACTIONS, second)} entry={{ minutes: 240, visit: null, source: "earned" }} castleUnlocked={false} />);
    expect(screen.getByRole("dialog", { name: /Old Bram/ }).textContent).toBe(said);
    expect(JSON.parse(sessionStorage.getItem("realm-mentions:demo-child-1:2026-11-19")!)).toHaveLength(1);
  });

  it("on a finished building, follows the 'Raised by' sentence", () => {
    const standing: RealmData = {
      ...withQuests(FRACTIONS),
      kingdom: { ...realm.kingdom, buildings: realm.kingdom.buildings.map((b) => (b.id === "well" ? { ...b, complete: true, done: 5, raisedBy: "Emma", raisedAt: null } : b)) },
    };
    const { bus } = mount({ realm: standing });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    const says = screen.getByRole("dialog", { name: /Old Bram/ }).textContent ?? "";
    expect(says).toMatch(/Raised by Emma\.\s+\S.*Fractions of a Pizza/);
  });
});

/* ------------------------------------------------------------------ a reading trail, walked (H9) */

describe("a reading trail, walked in the Realm (R-H14)", () => {
  const clue = (n: number, prompt: string) => ({ kind: "trail" as const, id: `read-g1:trail:0000000${n}`, skillId: "read-g1", prompt, view: {} });
  const trailRun = {
    runId: "r1",
    deed: { id: "well-signs", title: "Signs for the Well", story: "The sign-painter left clues.", area: "reading" as const },
    questions: [clue(1, "Go where the big wheel turns."), clue(2, "Go where the bees make honey.")],
    responses: [null, null] as (string | null)[],
    kind: "deed" as const,
    pending: null,
  };
  const RIGHT = { correct: true, secondChance: false };
  const OPEN = { correct: false, secondChance: true, hint: "That is where water is drawn.", feedback: "wrong_place" as const, firstPick: "landmark:well" };
  const MISS = { correct: false, secondChance: false, answer: "It was the mill.", explain: "Flour is ground at the mill.", reveal: "landmark:mill" };
  const walkedSummary = {
    correctCount: 2, total: 2, flawless: true, masteryChanges: [], stars: 3 as const, previousBest: 0 as const, deedBest: 3 as const, counted: true, crowned: false, kind: "deed" as const,
    building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 3, maxStars: 3, practice: false }, minutesEarned: 0, sideQuestPayFull: false,
  };
  const mill = { kind: "anchor" as const, id: "landmark:mill", label: "the mill", verb: "Search" };
  const beehives = { kind: "anchor" as const, id: "object:beehives", label: "the beehives", verb: "Search" };
  const tracker = () => screen.queryByRole("region", { name: "Reading trail" });

  async function setOff(over: Partial<React.ComponentProps<typeof RealmGame>> = {}) {
    vi.mocked(startDeedRun).mockResolvedValue(trailRun);
    const { bus, view } = mount(over);
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Set off" })));
    return { bus, view };
  }

  it("Set off closes the board, shows the tracker, and hands the canvas trailOn", async () => {
    mount();
    expect(handed.props!.trailOn).toBe(false);
    expect(handed.props!.trailRevealed).toBeNull();
    cleanup();
    const { bus, view } = await setOff();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(tracker()).toHaveTextContent("Go where the big wheel turns.");
    // The column's own child, ahead of the objective card: what the phone layout's `:has(> .trail-walk)` reads (trail-walk.css).
    expect(view.container.querySelector(".r3-left-stack > .trail-walk + .r3-quest")).not.toBeNull();
    expect(handed.props!.trailOn).toBe(true);
    // The world is played, not paused: the clock runs while the hero walks (§4.10).
    expect(bus.paused).toBe(false);
  });

  it("E at a stake answers the clue, and no panel opens", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const { bus } = await setOff();
    await act(async () => bus.onInteract(mill));
    expect(answerDeedQuestion).toHaveBeenCalledWith("r1", 0, "landmark:mill");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bus.paused).toBe(false);
    expect(tracker()).toHaveTextContent("Go where the bees make honey.");
  });

  it("E at a stake with no walk does nothing, and an id that is no anchor is never sent", async () => {
    const { bus } = mount();
    await act(async () => bus.onInteract(mill));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bus.paused).toBe(false);
    cleanup();
    const walking = await setOff();
    await act(async () => walking.bus.onInteract({ ...mill, id: "landmark:longwater" }));
    await act(async () => walking.bus.onInteract({ ...mill, id: "__proto__" }));
    expect(answerDeedQuestion).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the walk survives the pause menu: hidden under it, and clue 2 is still shown after", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const { bus } = await setOff();
    await act(async () => bus.onInteract(mill));
    esc();
    expect(bus.paused).toBe(true);
    expect(tracker()).toBeNull();
    // E is the scene's while a menu is up: nothing is searched.
    await act(async () => bus.onInteract(beehives));
    expect(answerDeedQuestion).toHaveBeenCalledTimes(1);
    esc();
    expect(tracker()).toHaveTextContent("Go where the bees make honey.");
    expect(handed.props!.trailOn).toBe(true);
  });

  it("a missed clue's answer turns its stake gold; a reveal that is no anchor turns none (F-17)", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    vi.mocked(retryDeedQuestion).mockResolvedValueOnce(MISS);
    const { bus } = await setOff();
    await act(async () => bus.onInteract({ ...mill, id: "landmark:well", label: "the well" }));
    expect(tracker()).toHaveTextContent("Not here. That is where water is drawn.");
    expect(handed.props!.trailRevealed).toBeNull();
    await act(async () => bus.onInteract({ ...mill, id: "landmark:garden", label: "the garden" }));
    expect(handed.props!.trailRevealed).toBe("landmark:mill");
    expect(tracker()).toHaveTextContent("It was the mill.");
    cleanup();
    vi.mocked(retryDeedQuestion).mockResolvedValueOnce({ ...MISS, reveal: "landmark:gone" });
    const again = await setOff();
    await act(async () => again.bus.onInteract({ ...mill, id: "landmark:well", label: "the well" }));
    await act(async () => again.bus.onInteract({ ...mill, id: "landmark:garden", label: "the garden" }));
    expect(handed.props!.trailRevealed).toBeNull();
  });

  it("a finished trail opens the villager's board on its result, and the well rises when it closes", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    vi.mocked(completeDeedRun).mockResolvedValue(walkedSummary);
    const { bus, view } = await setOff();
    const doneOf = () => (handed.props!.layout as { villagers: { id: string; done: number }[] }).villagers.find((v) => v.id === "bram")!.done;
    await act(async () => bus.onInteract(mill));
    await act(async () => bus.onInteract(beehives));
    expect(completeDeedRun).toHaveBeenCalledTimes(1);
    expect(completeDeedRun).toHaveBeenCalledWith("r1");
    expect(tracker()).toBeNull();
    expect(handed.props!.trailOn).toBe(false);
    const board = screen.getByRole("dialog", { name: /Signs for the Well/ });
    expect(within(board).getByText("Flawless!")).toBeInTheDocument();
    expect(within(board).getByText("2 of 2 right in Signs for the Well.", { exact: false })).toBeInTheDocument();
    expect(bus.paused).toBe(true);
    // Nothing has moved yet: the well rises as the hero comes back to the world.
    expect(doneOf()).toBe(2);
    expect(view.container.querySelector(".r3-quest .r3-progress-text")).toHaveTextContent("2 of 5");
    fireEvent.click(screen.getByRole("button", { name: /Back to the Realm/ }));
    expect(doneOf()).toBe(3);
    expect(screen.getByText("The Village Well is rising!")).toBeInTheDocument();
  });

  it("Esc on the result board, then a second talk, shows the normal board (F-8)", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    vi.mocked(completeDeedRun).mockResolvedValue(walkedSummary);
    const { bus } = await setOff();
    await act(async () => bus.onInteract(mill));
    await act(async () => bus.onInteract(beehives));
    expect(screen.getByText("Flawless!")).toBeInTheDocument();
    esc();
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    expect(screen.getByRole("dialog", { name: /Old Bram/ })).toBeInTheDocument();
    expect(screen.queryByText("Flawless!")).toBeNull();
    expect(screen.getByRole("button", { name: "Begin Count the Well Stones" })).toBeInTheDocument();
  });

  it("Leave the trail ends the walk: trailOn is false, and a stake searches nothing", async () => {
    const { bus } = await setOff();
    fireEvent.click(screen.getByRole("button", { name: "Leave the trail" }));
    expect(tracker()).toBeNull();
    expect(handed.props!.trailOn).toBe(false);
    await act(async () => bus.onInteract(mill));
    expect(answerDeedQuestion).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the villager picks a left walk back up: Begin resumes the open run, and Set off walks it from where it was", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const { bus } = await setOff();
    await act(async () => bus.onInteract(mill));
    fireEvent.click(screen.getByRole("button", { name: "Leave the trail" }));
    vi.mocked(startDeedRun).mockResolvedValue({ ...trailRun, responses: ["landmark:mill", null] });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Set off" })));
    expect(tracker()).toHaveTextContent("Go where the bees make honey.");
    await act(async () => bus.onInteract(beehives));
    expect(answerDeedQuestion).toHaveBeenLastCalledWith("r1", 1, "object:beehives");
  });

  it("a walk picked back up on an open second chance: the line is on show, the place already searched is refused, another is the retry", async () => {
    vi.mocked(retryDeedQuestion).mockResolvedValue(MISS);
    const { bus } = await setOff();
    fireEvent.click(screen.getByRole("button", { name: "Leave the trail" }));
    vi.mocked(startDeedRun).mockResolvedValue({ ...trailRun, pending: { index: 0, ruledOut: "landmark:well", hint: "That is where water is drawn." } });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Set off" })));
    expect(tracker()).toHaveTextContent("Not here. That is where water is drawn.");
    expect(within(tracker()!).getByRole("button", { name: "Show me" })).toBeInTheDocument();
    await act(async () => bus.onInteract({ ...mill, id: "landmark:well", label: "the well" }));
    expect(tracker()).toHaveTextContent("You searched here already. Try somewhere else.");
    expect(answerDeedQuestion).not.toHaveBeenCalled();
    expect(retryDeedQuestion).not.toHaveBeenCalled();
    await act(async () => bus.onInteract({ ...mill, id: "landmark:garden", label: "the garden" }));
    expect(retryDeedQuestion).toHaveBeenCalledWith("r1", 0, "landmark:garden");
    expect(handed.props!.trailRevealed).toBe("landmark:mill");
    expect(tracker()).toHaveTextContent("Go where the bees make honey.");
  });

  it("Leave the trail waits while the finish is out, and the result board still opens", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    let settle!: (s: typeof walkedSummary) => void;
    vi.mocked(completeDeedRun).mockReturnValue(new Promise((r) => (settle = r)) as never);
    const { bus } = await setOff();
    await act(async () => bus.onInteract(mill));
    await act(async () => bus.onInteract(beehives));
    fireEvent.click(screen.getByRole("button", { name: "Leave the trail" }));
    expect(tracker()).not.toBeNull();
    await act(async () => settle(walkedSummary));
    expect(screen.getByRole("dialog", { name: /Signs for the Well/ })).toHaveTextContent("Flawless!");
  });

  it("a finish landing on another villager's open run shows the walk's result, never that run under the walk's villager (M1)", async () => {
    const withMill = {
      ...realm,
      kingdom: {
        ...realm.kingdom,
        buildings: realm.kingdom.buildings.map((b) => (b.id === "mill" ? { ...b, done: 1, deeds: [{ id: "mill-sacks", title: "Count the Sacks", story: "Sacks everywhere.", area: "math" as const, bestStars: 0 as const, crowned: false }] } : b)),
      },
    };
    const sacks = { ...run, runId: "run-2", deed: { ...run.deed, id: "mill-sacks", title: "Count the Sacks" } };
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    let settle!: (s: typeof walkedSummary) => void;
    vi.mocked(completeDeedRun).mockReturnValue(new Promise((r) => (settle = r)) as never);
    const { bus } = await setOff({ realm: withMill });
    vi.mocked(startDeedRun).mockImplementation(async (_c, deedId) => (deedId === "mill-sacks" ? sacks : trailRun));
    await act(async () => bus.onInteract(mill));
    await act(async () => bus.onInteract(beehives));
    // The finish is out; the hero talks to the miller and begins her side quest before it lands.
    act(() => bus.onInteract({ kind: "villager", id: "tessa", label: "Miller Tessa" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Sacks" })));
    expect(screen.getByText("What is 2 + 3?")).toBeInTheDocument();
    await act(async () => settle(walkedSummary));
    const board = screen.getByRole("dialog", { name: /Signs for the Well/ });
    expect(within(board).getByText("Flawless!")).toBeInTheDocument();
    expect(screen.queryByText("What is 2 + 3?")).toBeNull();
    expect(screen.queryByRole("dialog", { name: /Count the Sacks/ })).toBeNull();
  });

  it("walks in the quiet world too: a side quest is how minutes are earned, and the quiet clock charges nothing", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const { bus, view } = await setOff({ entry: { minutes: 0, visit: null, source: "quiet" } });
    expect(tracker()).toHaveTextContent("Go where the big wheel turns.");
    expect(view.container.querySelector(".r3-clock-text")).toHaveTextContent("Earn play time with a side quest");
    await act(async () => bus.onInteract(mill));
    expect(answerDeedQuestion).toHaveBeenCalledWith("r1", 0, "landmark:mill");
  });
});

describe("a rune walk in the Realm (R-I2, R-I11, I10)", () => {
  const runesOn: WorldStateView = { locksOn: true, runesOn: true, open: [], fixed: [], decor: [], tower: [] };
  const withRunes = (view: WorldStateView = runesOn) => ({ realm: { ...realm, worldState: view } });
  const stop = (i: number) => ({ kind: "rune" as const, id: WALK_STOPS[i].id, label: WALK_STOPS[i].label, verb: "Cast a rune at" });
  const oldTree = { kind: "rune" as const, id: "rune:old-tree", label: "the wilted tree", verb: "Cast a rune at" };
  const [WAGON, LANTERN, FLOWERS] = WALK_STOPS.map((s) => s.id);
  const RIGHT = { correct: true, secondChance: false, answer: "The word was mend." };
  const OPEN = { correct: false, secondChance: true, hint: "It rhymes with send.", feedback: "wrong_word" as const, firstPick: "r:1,2,4,0" };
  const MISS = { correct: false, secondChance: false, answer: "The word was mend.", explain: "Mend means to make whole.", reveal: MEND };
  const trailRun = {
    runId: "t1",
    deed: { id: "well-signs", title: "Signs for the Well", story: "The sign-painter left clues.", area: "reading" as const },
    questions: [1, 2].map((n) => ({ kind: "trail" as const, id: `read-g1:trail:0000000${n}`, skillId: "read-g1", prompt: `Clue ${n}.`, view: {} })),
    responses: [null, null] as (string | null)[],
    kind: "deed" as const,
    pending: null,
  };
  const card = () => screen.queryByRole("region", { name: RUNE_TRACKER_LABEL });
  const trailCard = () => screen.queryByRole("region", { name: "Reading trail" });
  const stone = () => screen.queryByRole("dialog", { name: "The rune stone" });
  const canvasWalk = () => handed.props!.runeWalk as { named: string[]; mended: string[] } | null;
  const drawnFixed = (id: string) => (handed.props!.worldLocks as ReturnType<typeof worldCanvas>).runes.find((r) => r.id === id)?.fixed;
  const press = (t: Parameters<HudBus["onInteract"]>[0]) => act(async () => void handed.bus!.onInteract(t));
  const click = (name: string | RegExp) => act(async () => void fireEvent.click(screen.getByRole("button", { name })));
  async function cast(...tiles: string[]) {
    const tray = screen.getByRole("group", { name: "Runes to tap" });
    for (const t of tiles) fireEvent.click(within(tray).getByRole("button", { name: t }));
    await click("Cast");
  }
  const castMend = () => cast("m", "e", "n", "d");

  /** Bram's board, Begin (the server hands back `run`), and Set off when the board offers it. */
  async function talkAndBegin(run: ReturnType<typeof runeWalkRun> | typeof trailRun) {
    vi.mocked(startDeedRun).mockResolvedValue(run);
    act(() => handed.bus!.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
  }
  async function setOff(run = runeWalkRun(), over: Partial<React.ComponentProps<typeof RealmGame>> = withRunes()) {
    const mounted = mount(over);
    await talkAndBegin(run);
    await click("Set off");
    return mounted;
  }

  it("Set off on a rune run closes the board, shows the rune tracker, and names the stops on the canvas", async () => {
    mount(withRunes());
    expect(canvasWalk()).toBeNull();
    cleanup();
    const { bus, view } = await setOff();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(card()).toHaveTextContent("Next: the broken wagon");
    // The card sits in the column's walk slot, ahead of the objective card (trail-walk.css's `:has(> .r3-walk-slot > .trail-walk)`).
    expect(view.container.querySelector(".r3-left-stack > .r3-walk-slot > .trail-walk")).toBe(card());
    expect(canvasWalk()).toEqual({ named: [WAGON, LANTERN, FLOWERS], mended: [] });
    expect(handed.props!.trailOn).toBe(false);
    expect(bus.paused).toBe(false);
  });

  it("E at the current stop opens the stone, not the any-time board, and pauses the world", async () => {
    const { bus } = await setOff();
    await press(stop(0));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(stone()!).getByRole("group", { name: "The rune stone" })).toBeInTheDocument();
    expect(stone()).toHaveTextContent("The wagon is broken. Build the word you hear.");
    expect(startRuneObjectRun).not.toHaveBeenCalled();
    expect(bus.paused).toBe(true);
  });

  it("two E presses before a re-render open one stone", async () => {
    await setOff();
    await act(async () => {
      handed.bus!.onInteract(stop(0));
      handed.bus!.onInteract(stop(0));
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("after a right cast the stone stays, and Done moves to the next stop (RI-a / B1)", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    const { bus } = await setOff();
    await press(stop(0));
    await castMend();
    expect(answerDeedQuestion).toHaveBeenCalledWith("r1", 0, MEND);
    expect(stone()).not.toBeNull();
    expect(within(stone()!).getByRole("button", { name: RUNE_DONE })).toBeInTheDocument();
    expect(startRuneObjectRun).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await click(RUNE_DONE);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bus.paused).toBe(false);
    expect(card()).toHaveTextContent("Next: the dark lantern");
    await press(stop(1));
    expect(stone()).toHaveTextContent("The rune stone");
    expect(startRuneObjectRun).not.toHaveBeenCalled();
  });

  it("the stone is not dimmed: it is outside the paused frame, and the card is under it (RI-a / B2)", async () => {
    const { view } = await setOff();
    await press(stop(0));
    expect(stone()!.closest(".r3-frame")).toBeNull();
    expect(view.container.querySelector(".r3-frame--paused")).not.toBeNull();
    expect(card()!.closest(".r3-frame--paused")).not.toBeNull();
  });

  it("a right cast mends the object on the canvas at once; its record lands at the finish (R-I21)", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    await setOff();
    await press(stop(0));
    await castMend();
    expect(canvasWalk()!.mended).toEqual([WAGON]);
    expect(drawnFixed(WAGON)).toBe(false);
  });

  it("E at a later stop says 'First, …' and opens nothing", async () => {
    const { bus } = await setOff();
    await press(stop(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(card()).toHaveTextContent("First, the broken wagon.");
    expect(startRuneObjectRun).not.toHaveBeenCalled();
    expect(bus.paused).toBe(false);
  });

  it("E at a mended stop says the rune holds", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    await setOff();
    await press(stop(0));
    await castMend();
    await click(RUNE_DONE);
    await press(stop(0));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(card()).toHaveTextContent(RUNE_HOLDS_HERE);
    expect(startRuneObjectRun).not.toHaveBeenCalled();
  });

  it("E at a passed, missed stop opens its own board (RI-a / S2)", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    vi.mocked(retryDeedQuestion).mockResolvedValue(MISS);
    vi.mocked(startRuneObjectRun).mockReturnValue(new Promise(() => {}));
    await setOff();
    await press(stop(0));
    await cast("m", "a", "n", "d");
    await castMend();
    expect(stone()).toHaveTextContent("The word was mend.");
    await click(RUNE_DONE);
    expect(canvasWalk()).toEqual({ named: [LANTERN, FLOWERS], mended: [] });
    await press(stop(0));
    expect(startRuneObjectRun).toHaveBeenCalledWith("demo-child-1", WAGON);
  });

  it("E at a rune object that is not a stop opens its own board", async () => {
    vi.mocked(startRuneObjectRun).mockReturnValue(new Promise(() => {}));
    await setOff();
    await press(oldTree);
    expect(startRuneObjectRun).toHaveBeenCalledWith("demo-child-1", "rune:old-tree");
  });

  it("E while the stone is open does nothing (RI-a / S3)", async () => {
    await setOff();
    await press(stop(0));
    await press(oldTree);
    await press(stop(1));
    expect(startRuneObjectRun).not.toHaveBeenCalled();
    expect(answerDeedQuestion).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(card()).not.toHaveTextContent("First,");
  });

  it("Esc at the stone closes it and keeps the stop: it reopens on its second chance", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    const { bus } = await setOff();
    await press(stop(0));
    await cast("m", "a", "n", "d");
    esc();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bus.paused).toBe(false);
    expect(card()).toHaveTextContent("Next: the broken wagon");
    await press(stop(0));
    expect(stone()).toHaveTextContent("Not that word. It rhymes with send.");
    expect(within(stone()!).getByRole("button", { name: "Show me" })).toBeInTheDocument();
    expect(startRuneObjectRun).not.toHaveBeenCalled();
  });

  it("the walk survives the pause menu: hidden under it, and back after", async () => {
    await setOff();
    esc();
    expect(handed.bus!.paused).toBe(true);
    expect(card()).toBeNull();
    esc();
    expect(card()).toHaveTextContent("Next: the broken wagon");
  });

  it("a finished rune walk mirrors the fixes, opens the villager's board on its result, and raises the building when it closes", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    vi.mocked(completeDeedRun).mockResolvedValue(RUNE_WALK_SUMMARY);
    const { bus, view } = await setOff(runeWalkRun({ responses: [MEND, MEND, null] }));
    const doneOf = () => (handed.props!.layout as { villagers: { id: string; done: number }[] }).villagers.find((v) => v.id === "bram")!.done;
    expect(card()).toHaveTextContent("Next: the dry flower bed");
    await press(stop(2));
    await castMend();
    expect(answerDeedQuestion).toHaveBeenCalledWith("r1", 2, MEND);
    await click(RUNE_FINISH);
    expect(completeDeedRun).toHaveBeenCalledTimes(1);
    expect(completeDeedRun).toHaveBeenCalledWith("r1");
    expect(card()).toBeNull();
    expect(canvasWalk()).toBeNull();
    for (const id of [WAGON, LANTERN, FLOWERS]) expect(drawnFixed(id), id).toBe(true);
    const board = screen.getByRole("dialog", { name: /The Mill Ledger/ });
    expect(within(board).getByText("Flawless!")).toBeInTheDocument();
    expect(bus.paused).toBe(true);
    expect(doneOf()).toBe(2);
    expect(view.container.querySelector(".r3-quest .r3-progress-text")).toHaveTextContent("2 of 5");
    fireEvent.click(screen.getByRole("button", { name: /Back to the Realm/ }));
    expect(doneOf()).toBe(3);
    expect(screen.getByText("The Village Well is rising!")).toBeInTheDocument();
  });

  it("beginning a rune walk ends a trail walk, and the reverse", async () => {
    mount(withRunes());
    await talkAndBegin(trailRun);
    await click("Set off");
    expect(trailCard()).not.toBeNull();
    await talkAndBegin(runeWalkRun());
    await click("Set off");
    expect(trailCard()).toBeNull();
    expect(handed.props!.trailOn).toBe(false);
    expect(card()).not.toBeNull();
    expect(canvasWalk()!.named).toHaveLength(3);
    await talkAndBegin(trailRun);
    await click("Set off");
    expect(card()).toBeNull();
    expect(canvasWalk()).toBeNull();
    expect(trailCard()).toHaveTextContent("Clue 1.");
    expect(handed.props!.trailOn).toBe(true);
  });

  it("a rune run picked back up with runes off plays on the board, with no Set off, and its finish mirrors the fixes (RI-a / S7)", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    vi.mocked(completeDeedRun).mockResolvedValue(RUNE_WALK_SUMMARY);
    mount(withRunes({ ...runesOn, runesOn: false }));
    await talkAndBegin(runeWalkRun({ responses: [MEND, MEND, null] }));
    expect(screen.queryByRole("button", { name: "Set off" })).toBeNull();
    expect(screen.getByRole("group", { name: "The rune stone" })).toBeInTheDocument();
    await castMend();
    await click(/^Finish/);
    expect(completeDeedRun).toHaveBeenCalledWith("r1");
    expect(applyRuneOutcomes).toHaveBeenCalledWith(expect.objectContaining({ runesOn: false }), RUNE_WALK_SUMMARY.runes);
    expect(card()).toBeNull();
  });

  it("Leave the rune walk: runeWalk is null on the canvas, the mended marks are gone, and the objects open their own boards", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(RIGHT);
    vi.mocked(startRuneObjectRun).mockReturnValue(new Promise(() => {}));
    await setOff();
    await press(stop(0));
    await castMend();
    await click(RUNE_DONE);
    expect(canvasWalk()!.mended).toEqual([WAGON]);
    fireEvent.click(screen.getByRole("button", { name: RUNE_LEAVE }));
    expect(card()).toBeNull();
    expect(canvasWalk()).toBeNull();
    expect(drawnFixed(WAGON)).toBe(false);
    await press(stop(1));
    expect(startRuneObjectRun).toHaveBeenCalledWith("demo-child-1", LANTERN);
  });
});
