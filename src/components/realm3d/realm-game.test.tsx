import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
vi.mock("@/lib/actions/realm-settings", () => ({ setRealmDepth: vi.fn(async () => {}), updateRealmSettings: vi.fn(async () => {}) }));
vi.mock("@/lib/actions/realm-play", () => ({ getRealmAccess: vi.fn(), recordRealmPlay: vi.fn(async () => {}) }));
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

import { RealmGame, type RealmData } from "./realm-game";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
});
afterEach(cleanup);

const realm: RealmData = {
  childId: "demo-child-1",
  isChildView: true,
  kingdom: {
    tone: "gentle",
    buildings: ["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"].map((id) => ({
      id,
      label: id,
      description: "",
      icon: "box" as const,
      deeds: [],
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
    expect(screen.getByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
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
