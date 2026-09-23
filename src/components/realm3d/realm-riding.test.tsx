import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { HudBus } from "@/lib/realm3d/hud-bus";
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

import { stepRide } from "@/lib/realm3d/riding";
import type { RideBus } from "@/lib/realm3d/riding";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
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


const pressM = () => act(() => void fireEvent.keyDown(window, { code: "KeyM", key: "m" }));
const ride = () => handed.props!.ride as RideBus;
const pony = { ...DEFAULT_AVATAR, mount: "pony" };

/** Plays the scene's half: runs the ride's state machine for a second. */
function settleRide() {
  act(() => {
    for (let i = 0; i < 30; i++) stepRide(ride(), 0.05, 0);
  });
}

describe("riding, the frame's half", () => {
  it("a child with no mount is told kindly how to get one, and the bar has an empty saddle", () => {
    mount({ avatar: DEFAULT_AVATAR, mounts: ["pony", "donkey"] });
    expect(screen.getByRole("button", { name: /No mount yet/ })).toHaveTextContent("No mount");
    pressM();
    expect(screen.getByRole("status")).toHaveTextContent(/You don't have a mount yet!.*Tavern.*Pony and the Donkey are free/);
    expect(ride().mount).toBeNull();
  });

  it("a mount chosen but not earned says how it is earned", () => {
    mount({ avatar: { ...DEFAULT_AVATAR, mount: "stag" }, mounts: ["pony"] });
    pressM();
    expect(screen.getByRole("status")).toHaveTextContent(/Stag isn't yours to ride yet\. Reach Level 8/);
  });

  it("M gets on an earned mount; the slot and the key strip say so; no spells from the saddle", () => {
    mount({ avatar: pony, mounts: ["pony"] });
    expect(ride().mount).toMatchObject({ id: "pony", label: "Pony" });
    expect(screen.getByText(/M/, { selector: ".r3-keys b" })).toBeInTheDocument();
    pressM();
    expect(ride().want).toBe(true);
    settleRide();
    expect(screen.getByRole("button", { name: /Get off your Pony/ })).toHaveTextContent("Get off");
    fireEvent.click(screen.getByRole("button", { name: /Ember Bolt/ }));
    expect(handed.casts!.n).toBe(0);
    expect(screen.getByRole("status")).toHaveTextContent("Get down to cast a spell. Press M.");
  });

  it("a visiting grown-up has no saddle and walks", () => {
    mount({ avatar: pony, mounts: ["pony"], viewer: "parent" });
    expect(screen.queryByRole("button", { name: /Ride your/ })).toBeNull();
    pressM();
    expect(screen.getByRole("status")).toHaveTextContent("Visitors walk. The mount is Emma's to ride.");
  });

  it("E at a hitching post opens the sheet only in the saddle", () => {
    const { bus } = mount({ avatar: pony, mounts: ["pony"] });
    const post = { kind: "post" as const, id: "village", label: "the hitching post", verb: "Ride from" };
    act(() => bus.onInteract(post));
    expect(screen.queryByRole("dialog", { name: "Fast travel" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Get on your Pony first. Press M.");
    pressM();
    settleRide();
    act(() => bus.onInteract(post));
    const sheet = screen.getByRole("dialog", { name: "Fast travel" });
    expect(sheet).toHaveTextContent("Where to?");
    expect(sheet).toHaveTextContent("You're here");
    expect(bus.paused).toBe(true);
  });

  it("the Controls panel names M for a child", () => {
    mount({ avatar: pony, mounts: ["pony"] });
    act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    fireEvent.click(screen.getByRole("button", { name: /Controls/ }));
    expect(screen.getByRole("dialog", { name: "How to play" })).toHaveTextContent(/Get on or off your mount/);
  });
});
