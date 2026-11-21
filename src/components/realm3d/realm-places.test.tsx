import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";

/**
 * THE PLACES A CHILD HAS FOUND, and HOW MINUTES ARE EARNED, through the composition root with
 * the canvas stubbed (it imports `three`). One record drives the HUD's count, the minimap's
 * marks and fast travel; only the hero writes it; and the help card reads `earningLines`.
 */
const handed: { bus?: HudBus; props?: Record<string, unknown> } = {};
vi.mock("next/dynamic", () => ({
  default: () =>
    function Dynamic(props: Record<string, unknown>) {
      handed.bus = props.bus as HudBus;
      handed.props = props;
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
vi.mock("@/lib/actions/deeds", () => ({ startDeedRun: vi.fn(), answerDeedQuestion: vi.fn(), completeDeedRun: vi.fn() }));
vi.mock("@/lib/actions/world-locks", () => ({ startWorldLockRun: vi.fn() }));
vi.mock("@/lib/actions/seasons", () => ({ markCeremonySeen: vi.fn(async () => {}) }));
vi.mock("@/lib/actions/spells", () => ({ getSpellbook: vi.fn(async () => ({ spells: [], slots: 4, level: 3, unlocked: [], schoolCounts: {}, subjectNamesBySchool: {} })) }));
vi.mock("@/lib/actions/realm", () => ({ getRealmKingdom: vi.fn() }));
vi.mock("@/lib/actions/quest-assignments", () => ({ getAssignmentQuestInfo: vi.fn(async () => null) }));
const bountyStatus = { enabled: true, capMinutes: 5, subCapMinutes: 5, paidMinutes: 0, remainingMinutes: 5, clearsToday: 0, paidHomes: [] as string[] };
vi.mock("@/lib/actions/realm-play", () => ({
  getRealmAccess: vi.fn(),
  recordRealmPlay: vi.fn(async () => {}),
  getTroubleBounty: vi.fn(async () => bountyStatus),
  recordTroubleClears: vi.fn(),
}));
const held = new Set<string>();
vi.mock("@/lib/actions/realm-places", () => ({
  recordPlacesFound: vi.fn(async (_childId: string, ids: string[]) => {
    for (const id of ids) held.add(id);
    return [...held];
  }),
}));
vi.mock("@/lib/realm3d/worldgen", async (orig) => {
  const real = await orig<typeof import("@/lib/realm3d/worldgen")>();
  const lm = (id: string, name: string, x: number) => ({ id, name, line: "", position: { x, z: -60 }, y: 40, radius: 15, biome: "crag", kind: "summit" });
  const world = {
    landmarks: [lm("summit-6", "Cloudfoot", 40), lm("farfurrow", "Farfurrow", -40), lm("cove-12", "Driftwood Cove", 0)],
    roads: [],
    biomeAt: () => "meadow",
    heightAt: () => 0,
  };
  return { ...real, realmWorld: () => world };
});

import { answerDeedQuestion, completeDeedRun } from "@/lib/actions/deeds";
import { recordPlacesFound } from "@/lib/actions/realm-places";
import { startWorldLockRun } from "@/lib/actions/world-locks";
import type { WorldStateView } from "@/lib/realm/world-state";
import { WORLD_OPEN } from "@/lib/utils/deed-refusals";
import type { RunSummary } from "@/lib/utils/deed-run-types";
import type { RideBus } from "@/lib/realm3d/riding";
import { RealmGame, type RealmData } from "./realm-game";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
});
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  held.clear();
  localStorage.clear();
});

// Earning time's settings at 0, so the card's older lines are asserted alone (`bounty.test.ts` covers the new ones).
const earning = { enabled: true, accessMode: "earned" as const, earnedMinutesPerQuest: 5, dailyCapMinutes: 30, troubleBonusCapMinutes: 5, dailyAllowanceMinutes: 0, minutesPerStar: 0, sideQuestDailyCapMinutes: 0, bankCapMinutes: 0 };
const realm: RealmData = {
  childId: "c1",
  isChildView: true,
  kingdom: { tone: "gentle", buildings: [] },
  castleType: "campsite",
  banners: 0,
  profile: DEFAULT_LEARNING_PROFILE,
  depth: "full",
  toneMode: "gentle",
  placesFound: ["summit-6"],
  earning,
};

function mount(over: Partial<React.ComponentProps<typeof RealmGame>> = {}) {
  render(<RealmGame heroName="Emma" realm={realm} entry={{ minutes: 60, visit: null, source: "earned" }} castleUnlocked={false} {...over} />);
  return handed.bus!;
}
const ride = () => handed.props!.ride as RideBus;
const foundMarks = () => document.querySelectorAll(".r3-map-place--found").length;

describe("the places a child has found: one record", () => {
  it("opens with the database's list on the count, the map and fast travel", () => {
    mount();
    expect(screen.getByText("1 of 3 places found")).toBeInTheDocument();
    expect(foundMarks()).toBe(1);
    expect(ride().visited.has("summit-6")).toBe(true);
  });

  it("a new find reaches all three at once, and is saved by the hero", async () => {
    const bus = mount();
    act(() => bus.onFound("farfurrow"));
    act(() => bus.onPlace(null));
    expect(screen.getByText("2 of 3 places found")).toBeInTheDocument();
    expect(foundMarks()).toBe(2);
    expect(ride().visited.has("farfurrow")).toBe(true);
    await waitFor(() => expect(recordPlacesFound).toHaveBeenCalledWith("c1", ["farfurrow"]));
  });

  it("a place the ride sees first is counted on the HUD too", async () => {
    mount();
    act(() => ride().onVisit("cove-12"));
    expect(screen.getByText("2 of 3 places found")).toBeInTheDocument();
    await waitFor(() => expect(recordPlacesFound).toHaveBeenCalledWith("c1", ["cove-12"]));
  });

  it("moves what this device kept in the old visited list into the database once, then forgets the key", async () => {
    localStorage.setItem("realm3d:visited:c1", JSON.stringify(["farfurrow", "summit-6", "nowhere"]));
    mount();
    expect(screen.getByText("2 of 3 places found")).toBeInTheDocument();
    await waitFor(() => expect(recordPlacesFound).toHaveBeenCalledWith("c1", ["farfurrow"]));
    expect(localStorage.getItem("realm3d:visited:c1")).toBeNull();
    await waitFor(() => expect(localStorage.getItem("realm3d:places-unsaved:c1")).toBeNull());
  });

  it("keeps a find the server refused on the device, and never blocks the count", async () => {
    vi.mocked(recordPlacesFound).mockRejectedValue(new Error("offline"));
    const bus = mount();
    act(() => bus.onFound("farfurrow"));
    act(() => bus.onPlace(null));
    expect(screen.getByText("2 of 3 places found")).toBeInTheDocument();
    await waitFor(() => expect(recordPlacesFound).toHaveBeenCalled());
    expect(JSON.parse(localStorage.getItem("realm3d:places-unsaved:c1") ?? "[]")).toEqual(["farfurrow"]);
  });

  it("a visiting parent sees the child's places, and their walk writes nothing, anywhere", async () => {
    const bus = mount({ viewer: "parent", realm: { ...realm, isChildView: false } });
    expect(foundMarks()).toBe(1);
    act(() => bus.onFound("farfurrow"));
    act(() => ride().onVisit("cove-12"));
    expect(foundMarks()).toBe(3);
    await new Promise((r) => setTimeout(r, 20));
    expect(recordPlacesFound).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
});

describe("the how-to-play card says how minutes are earned (earningLines)", () => {
  const openHelp = () => act(() => void fireEvent.click(screen.getByRole("button", { name: /how to play/i })));

  it("earned mode: a quest's minutes, and clearing's up to today's sub-cap", async () => {
    mount();
    await waitFor(() => expect(handed.bus).toBeDefined());
    await act(async () => {});
    openHelp();
    expect(screen.getByText(/Finish a quest and you earn 5 more minutes here\. Clearing troubles earns a minute each, up to 5 a day\./)).toBeInTheDocument();
  });

  it("open mode: no promise of minutes", async () => {
    mount({ realm: { ...realm, earning: { ...earning, accessMode: "open" } } });
    await act(async () => {});
    openHelp();
    expect(screen.getByText("Your quests bring materials to build with. Your Realm is open, up to 30 minutes a day.")).toBeInTheDocument();
    expect(screen.queryByText(/Clearing troubles/)).toBeNull();
  });

  it("a visiting parent's card says nothing of earning", () => {
    mount({ viewer: "parent", realm: { ...realm, isChildView: false } });
    openHelp();
    expect(screen.queryByText(/Finish a quest/)).toBeNull();
  });
});

describe("a vault door's map marks its place at once", () => {
  // Longwater's door is shut; its map leads to cove-12, "Driftwood Cove" in this stubbed world.
  const shut: WorldStateView = { locksOn: true, open: [], decor: [], tower: [] };
  const door = { kind: "lock" as const, id: "door:longwater", label: "the vault door", verb: "Open" };
  const run = {
    runId: "lock-1",
    deed: { id: "door:longwater", title: "The vault door", story: "A vault door, sealed with a puzzle.", area: "logic" as const },
    questions: [{ kind: "choice" as const, id: "q1", skillId: "logic-g45", prompt: "Which shape comes next?", view: { choices: ["circle", "square"] } }],
    responses: [null] as (string | null)[],
    kind: "world" as const,
    pending: null,
  };
  const summary = (world: RunSummary["world"]): RunSummary => ({
    correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 0, previousBest: 0, deedBest: 0,
    counted: false, crowned: false, kind: "world", building: null, minutesEarned: 0, sideQuestPayFull: false, world,
  });
  const opened = { objectId: "door:longwater", opened: true, rewards: [{ kind: "fragment" as const, placeId: "cove-12" }, { kind: "lore" as const, id: "longwater-map" as const }] };

  beforeEach(() => {
    (window as unknown as { speechSynthesis: { cancel: () => void } }).speechSynthesis = { cancel: () => {} };
    vi.mocked(startWorldLockRun).mockResolvedValue(run);
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "circle" });
  });

  async function playToDone() {
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "circle" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Done" })));
  }

  it("marks the place on the map and in fast travel without a reload, and holds 'You found a map' until the board closes", async () => {
    vi.mocked(completeDeedRun).mockResolvedValue(summary(opened));
    const bus = mount({ realm: { ...realm, worldState: shut } });
    expect(foundMarks()).toBe(1);
    await act(async () => void bus.onInteract(door));
    await playToDone();
    // The map knows it already, behind the open board; the toast waits.
    expect(ride().visited.has("cove-12")).toBe(true);
    expect(screen.queryByText("You found a map to Driftwood Cove!")).toBeNull();
    await waitFor(() => expect(recordPlacesFound).toHaveBeenCalledWith("c1", ["cove-12"]));
    fireEvent.click(screen.getByRole("button", { name: "Back to the Realm" }));
    expect(screen.getByText("You found a map to Driftwood Cove!")).toBeInTheDocument();
    expect(screen.getByText("Look for it on your map.")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 places found")).toBeInTheDocument();
    expect(foundMarks()).toBe(2);
  });

  it("a miss marks nothing and says nothing", async () => {
    vi.mocked(completeDeedRun).mockResolvedValue(summary({ objectId: "door:longwater", opened: false, reason: "missed", rewards: [] }));
    const bus = mount({ realm: { ...realm, worldState: shut } });
    await act(async () => void bus.onInteract(door));
    await playToDone();
    fireEvent.click(screen.getByRole("button", { name: "Back to the Realm" }));
    expect(ride().visited.has("cove-12")).toBe(false);
    expect(screen.queryByText(/You found a map/)).toBeNull();
  });

  it("a door the server says is already open is drawn open at once, with no toast (G3 review 2)", async () => {
    vi.mocked(startWorldLockRun).mockRejectedValue(new Error(WORLD_OPEN));
    const bus = mount({ realm: { ...realm, worldState: shut } });
    await act(async () => void bus.onInteract(door));
    expect(screen.getByRole("alert")).toHaveTextContent("That's already open.");
    const locks = handed.props!.worldLocks as { locks: { id: string; open: boolean }[] };
    expect(locks.locks.find((l) => l.id === "door:longwater")!.open).toBe(true);
    expect(screen.queryByText(/You found a map/)).toBeNull();
  });
});
