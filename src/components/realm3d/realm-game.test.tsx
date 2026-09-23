import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import type { TroubleBus } from "@/lib/realm3d/trouble-bus";
import type { CastQueue } from "@/lib/realm3d/casting";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

/**
 * The composition root, with the canvas swapped for a stub that keeps what it was handed. The
 * real canvas imports `three`, which nothing under Vitest may load; the stub is also the
 * scene's half of the contract, so these tests play the scene — fire `onNear`, fire
 * `onInteract`, read `bus.paused` — exactly as the real one will.
 */
const handed: { bus?: HudBus; casts?: CastQueue; props?: Record<string, unknown> } = {};
vi.mock("./spike-scene", () => ({
  default: (props: Record<string, unknown>) => {
    handed.bus = props.bus as HudBus;
    handed.casts = props.casts as CastQueue;
    handed.props = props;
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
vi.mock("@/lib/actions/realm-sound", () => ({ saveRealmSound: vi.fn(async () => {}) }));
vi.mock("@/lib/actions/deeds", () => ({ startDeedRun: vi.fn(), answerDeedQuestion: vi.fn(), completeDeedRun: vi.fn() }));
vi.mock("@/lib/actions/seasons", () => ({ markCeremonySeen: vi.fn(async () => {}) }));
vi.mock("@/lib/actions/spells", () => ({ getSpellbook: vi.fn(async () => ({ spells: [], slots: 4, level: 3, unlocked: ["ember", "tide", "bolt", "orb"], schoolCounts: { element: 2, form: 0, modifier: 0 }, subjectNamesBySchool: { element: ["Math"], form: [], modifier: [] } })) }));
vi.mock("@/lib/actions/realm", () => ({ getRealmKingdom: vi.fn() }));
vi.mock("@/lib/actions/quest-assignments", () => ({ getAssignmentQuestInfo: vi.fn(async () => null) }));
vi.mock("@/lib/actions/realm-play", () => ({
  getRealmAccess: vi.fn(),
  recordRealmPlay: vi.fn(async () => {}),
  getTroubleBounty: vi.fn(async () => ({ enabled: false, capMinutes: 0, subCapMinutes: 0, paidMinutes: 0, remainingMinutes: 0, clearsToday: 0, paidHomes: [] })),
  recordTroubleClears: vi.fn(),
}));
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

import { answerDeedQuestion, completeDeedRun, startDeedRun } from "@/lib/actions/deeds";
import { getRealmKingdom } from "@/lib/actions/realm";
import { markRealmHelpSeen, setTutorialStep } from "@/lib/actions/realm-settings";
import { markCeremonySeen } from "@/lib/actions/seasons";
import { saveRealmSound } from "@/lib/actions/realm-sound";
import { getTroubleBounty, recordTroubleClears } from "@/lib/actions/realm-play";
import { LEGACY_STEPS, LESSONS, STORED_MAX } from "@/lib/realm3d/tutorial";
import { findBuilding } from "@/lib/utils/kingdom";
import { RealmGame, type RealmData } from "./realm-game";

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
      deeds: id === "well" ? [{ id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const }] : [],
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
    for (const k of Object.keys(first)) expect(handed.props![k], k).toBe(first[k]);
  });

  it("shows the objectives, the village and the clock", () => {
    const { view } = mount();
    expect(view.container.querySelector(".r3-quest-title")).toHaveTextContent("Village Well");
    expect(screen.getByText("0 of 8 raised")).toBeInTheDocument();
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
});

/* ------------------------------------------------------------------ the loop */

const run = {
  runId: "run-1",
  deed: { id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const },
  questions: [
    { id: "q1", skillId: "add-20", prompt: "What is 2 + 3?", choices: ["4", "5", "6", "7"], readAloud: "What is two plus three?" },
    { id: "q2", skillId: "add-20", prompt: "What is 4 + 4?", choices: ["6", "7", "8", "9"] },
  ],
  responses: [null, null],
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
    vi.mocked(answerDeedQuestion).mockResolvedValueOnce({ correct: true, answer: "5" }).mockResolvedValueOnce({ correct: false, answer: "8" });
    vi.mocked(completeDeedRun).mockResolvedValue({
      correctCount: 1,
      total: 2,
      flawless: false,
      masteryChanges: ["Adding within 20 is getting stronger."],
      building: { label: "Village Well", done: 3, total: 5, complete: false },
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
    expect(screen.getByText("Not quite. The answer was 8.")).toBeInTheDocument();
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

  it("still raises the site when the child leaves the results with Esc", async () => {
    vi.mocked(startDeedRun).mockResolvedValue({ ...run, questions: [run.questions[0]], responses: [null] });
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, answer: "5" });
    vi.mocked(completeDeedRun).mockResolvedValue({ correctCount: 1, total: 1, flawless: true, masteryChanges: [], building: { label: "Village Well", done: 3, total: 5, complete: false } });
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
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, answer: "5" });
    vi.mocked(completeDeedRun).mockResolvedValue({ correctCount: 1, total: 1, flawless: true, masteryChanges: [], building: { label: "Village Well", done: 5, total: 5, complete: true } });
    const well = { ...realm, kingdom: { ...realm.kingdom, buildings: realm.kingdom.buildings.map((b) => (b.id === "well" ? { ...b, done: 4 } : b)) } };
    const { bus } = mount({ realm: well });
    act(() => bus.onInteract({ kind: "villager", id: "bram", label: "Old Bram" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "5" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
    fireEvent.click(screen.getByRole("button", { name: /Back to the Realm/ }));
    expect(screen.getByText("1 of 8 raised")).toBeInTheDocument();
    expect(screen.getByText("The Village Well stands!")).toBeInTheDocument();
    expect(screen.getByText("Next: the Grain Mill, with Miller Tessa.")).toBeInTheDocument();
    const layout = handed.props!.layout as { props: { id: string; kind: string }[] };
    expect(layout.props.find((p) => p.id === "well")!.kind).toBe("building");
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
    expect(recordTroubleClears).toHaveBeenCalledWith("demo-child-1", expect.any(String), ["place-summit-1"]);
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
  const done = (label: string, n: number) => ({ correctCount: 1, total: 1, flawless: true, masteryChanges: [], building: { label, done: n, total: 5, complete: false } });

  it("raises the building at once when the child pressed Esc during Finish", async () => {
    vi.mocked(startDeedRun).mockResolvedValue(one);
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, answer: "5" });
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
        buildings: realm.kingdom.buildings.map((b) => (b.id === "mill" ? { ...b, done: 1, deeds: [{ id: "mill-sacks", title: "Count the Sacks", story: "Sacks everywhere.", area: "math" as const }] } : b)),
      },
    };
    vi.mocked(startDeedRun).mockImplementation(async (_c, deedId) => (deedId === "mill-sacks" ? { ...one, runId: "run-2", deed: { ...one.deed, id: "mill-sacks", title: "Count the Sacks" } } : one));
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, answer: "5" });
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
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, answer: "5" });
      vi.mocked(completeDeedRun).mockResolvedValue({ correctCount: 1, total: 1, flawless: true, masteryChanges: [], building: { label: "Village Well", done: 3, total: 5, complete: false } });
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
