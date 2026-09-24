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

import { recordPlacesFound } from "@/lib/actions/realm-places";
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

const earning = { enabled: true, accessMode: "earned" as const, earnedMinutesPerQuest: 5, dailyCapMinutes: 30, troubleBonusCapMinutes: 5 };
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
    expect(screen.getByText("Your Realm is open, up to 30 minutes a day.")).toBeInTheDocument();
    expect(screen.queryByText(/Clearing troubles/)).toBeNull();
  });

  it("a visiting parent's card says nothing of earning", () => {
    mount({ viewer: "parent", realm: { ...realm, isChildView: false } });
    openHelp();
    expect(screen.queryByText(/Finish a quest/)).toBeNull();
  });
});
