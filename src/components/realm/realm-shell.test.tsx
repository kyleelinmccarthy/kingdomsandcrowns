import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RealmShell } from "./realm-shell";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { VILLAGERS } from "@/lib/realm/villagers";

const getRealmAccess = vi.fn();
const recordRealmPlay = vi.fn();
vi.mock("@/lib/actions/realm-play", () => ({
  getRealmAccess: (...a: unknown[]) => getRealmAccess(...a),
  recordRealmPlay: (...a: unknown[]) => recordRealmPlay(...a),
}));
let sceneProps: Record<string, unknown> = {};
vi.mock("./realm-scene", () => ({
  default: (props: Record<string, unknown>) => {
    sceneProps = props;
    return <div data-testid="scene" data-interactive={String(props.interactive)} data-rising={String(props.risingId ?? "")} data-spells={String(props.spellsEnabled)} data-riding={String(props.riding)} data-recess={String(props.recessActive)} data-ceremony={String(props.ceremonyActive)} />;
  },
}));
const startDeedRun = vi.fn();
const getRealmKingdom = vi.fn();
vi.mock("@/lib/actions/deeds", () => ({ startDeedRun: (...a: unknown[]) => startDeedRun(...a), answerDeedQuestion: vi.fn(), completeDeedRun: vi.fn() }));
vi.mock("@/lib/actions/realm", () => ({ getRealmKingdom: (...a: unknown[]) => getRealmKingdom(...a) }));
const markCeremonySeen = vi.fn();
vi.mock("@/lib/actions/seasons", () => ({ markCeremonySeen: (...a: unknown[]) => markCeremonySeen(...a) }));
const markRealmHelpSeen = vi.fn();
vi.mock("@/lib/actions/realm-settings", () => ({ markRealmHelpSeen: (...a: unknown[]) => markRealmHelpSeen(...a) }));
vi.mock("@/components/deed-player", () => ({
  DeedPlayer: ({ run, onFinished }: { run: { deed: { title: string } }; onFinished: (s: unknown) => void }) => (
    <div>
      <p>Playing {run.deed.title}</p>
      <button type="button" onClick={() => onFinished({ correctCount: 8, total: 8, flawless: true, masteryChanges: [], building: { label: "Village Well", done: 5, total: 5, complete: true } })}>finish</button>
    </div>
  ),
}));
// The real hook, with `flushPending` wrapped so tests can assert it was
// called on retry and on unmount without duplicating use-play-clock.test.ts's
// own coverage of what flushPending actually does. The wrapper is memoised on
// the real hook's own stable `flushPending`, because RealmOpen's unmount
// cleanup keys on that identity: a fresh arrow every render would fire the
// cleanup on every render instead of once, on the real unmount.
let flushPendingCalls = 0;
vi.mock("./use-play-clock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./use-play-clock")>();
  const React = await import("react");
  return {
    ...actual,
    usePlayClock: (...args: Parameters<typeof actual.usePlayClock>) => {
      const hook = actual.usePlayClock(...args);
      const inner = hook.flushPending;
      const flushPending = React.useCallback(() => {
        flushPendingCalls += 1;
        return inner();
      }, [inner]);
      return { ...hook, flushPending };
    },
  };
});
// A module-level switch: when armed, the next SpriteSource mount reports an
// error (as if the sprite rasterizer failed) instead of success, then
// disarms itself. Only the retry test arms it, so every other test (and the
// remount that "Try again" triggers) sees the ordinary success path.
let failNextSpriteMount = false;
// A second module-level switch: when armed, the next SpriteSource mount captures
// `onReady` into `heldOnReady` instead of calling it, so a test can open the help
// card first and only then let textures "finish loading" by invoking it manually.
let holdNextSpriteMount = false;
let heldOnReady: ((t: unknown) => void) | null = null;
let spriteSourceProps: Record<string, unknown> = {};
vi.mock("./sprite-source", async () => {
  const React = await import("react");
  return {
    SpriteSource: (props: Record<string, unknown> & { onReady: (t: unknown) => void; onError: (e: Error) => void }) => {
      spriteSourceProps = props;
      const { onReady, onError } = props;
      // Report readiness (or failure) after mount, the way the real component does, so no parent state is set during render.
      React.useEffect(() => {
        if (failNextSpriteMount) {
          failNextSpriteMount = false;
          onError(new Error("boom"));
        } else if (holdNextSpriteMount) {
          holdNextSpriteMount = false;
          heldOnReady = onReady;
        } else {
          onReady({ hero: {}, companion: null, villagers: {}, troubles: {}, mount: null, heroMounted: null, gleam: null, banner: null, crown: null, castleBanner: null, world: {}, tiles: null });
        }
      }, [onReady, onError]);
      return null;
    },
  };
});

const well = {
  id: "well", label: "Village Well", description: "Clean water for every doorstep.", icon: "box" as const, done: 4, total: 5, complete: false,
  deeds: [{ id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const }],
};
const bundle = { heroName: "Lily", avatarConfig: DEFAULT_AVATAR, castleType: "campsite", kingdom: { tone: "gentle" as const, buildings: [well] }, profile: DEFAULT_LEARNING_PROFILE, settings: { enabled: true, toneMode: "gentle" as const }, spellbook: { spells: [], slots: 4 }, mounts: { unlocked: ["pony"] }, ceremony: null, banners: 0, wornCrown: null, helpSeen: true, depthOverride: "auto" as const, depth: "full" as const };

// A brand-new hero: all eight buildings at 0 of 5, each with one side quest to begin.
const newKingdom = BUILDINGS.map((b) => ({
  id: b.id, label: b.label, description: b.description, icon: b.icon,
  done: 0, total: b.deedsToBuild, complete: false,
  deeds: [{ id: `${b.id}-1`, title: `Help at the ${b.label}`, story: "There is work to do.", area: "math" as const }],
}));
// The same eight, every one of them raised.
const raisedKingdom = newKingdom.map((b) => ({ ...b, done: b.total, complete: true }));

beforeEach(() => {
  vi.clearAllMocks();
  failNextSpriteMount = false;
  holdNextSpriteMount = false;
  heldOnReady = null;
  flushPendingCalls = 0;
  spriteSourceProps = {};
});
afterEach(cleanup);

describe("RealmShell", () => {
  it("gates a hero who has no minutes", async () => {
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "no_minutes" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByText("The Realm opens when you finish a quest.")).toBeInTheDocument();
    expect(screen.queryByTestId("scene")).not.toBeInTheDocument();
  });

  it("opens the world with the minute counter for a hero", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByText("12 min left")).toBeInTheDocument();
  });

  it("previews for a parent without recording anything", async () => {
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "school_hours" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={false} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByText("Previewing Lily's Realm")).toBeInTheDocument();
    // The intro and the gate note are one message in the problem lane now (§3.17).
    expect(screen.getByTestId("realm-problem")).toHaveTextContent(
      "You're looking at Lily's grounds. Spells, side quests and recess are theirs to play. Closed for Lily: It's school time."
    );
    expect(recordRealmPlay).not.toHaveBeenCalled();
  });

  it("explains when the Realm is disabled", async () => {
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "disabled" });
    render(<RealmShell bundle={{ ...bundle, settings: { enabled: false, toneMode: "gentle" } }} childId="c1" isChildView={true} />);
    expect(await screen.findByText("The Realm is closed for this hero.")).toBeInTheDocument();
  });

  it("retries loading the sprite after an error", async () => {
    failNextSpriteMount = true;
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(screen.queryByTestId("scene")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(flushPendingCalls).toBe(1);
  });

  it("charges the minute in progress when the Realm unmounts", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const { unmount } = render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    // Not on every render — only on the real unmount.
    expect(flushPendingCalls).toBe(0);
    unmount();
    expect(flushPendingCalls).toBe(1);
  });

  it("carries the reading font attribute onto the realm root", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(
      <RealmShell
        bundle={{ ...bundle, profile: { ...DEFAULT_LEARNING_PROFILE, readingFont: true } }}
        childId="c1"
        isChildView={true}
      />
    );
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(document.querySelector(".realm-root")).toHaveAttribute("data-reading-font", "on");
  });

  it("carries the larger-text attribute onto the realm root", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(
      <RealmShell
        bundle={{ ...bundle, profile: { ...DEFAULT_LEARNING_PROFILE, largerText: true } }}
        childId="c1"
        isChildView={true}
      />
    );
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(document.querySelector(".realm-root")).toHaveAttribute("data-larger-text", "on");
  });

  it("opens the site card from a villager in reach, pauses the clock, and raises the building on completion", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    startDeedRun.mockResolvedValue({ runId: "r1", deed: { id: "well-stones", title: "Count the Well Stones", story: "Dry again." }, questions: [], responses: [] });
    const user = userEvent.setup();
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onReachChange as (id: string | null) => void)("bram");
    });
    await act(async () => {
      (sceneProps.onTalk as (id: string) => void)("bram");
    });
    expect(within(await screen.findByRole("dialog", { name: "Old Bram" })).getByText("4 of 5")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-interactive", "false");
    expect(screen.getByText("12 min left · paused")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Begin Count the Well Stones" }));
    expect(await screen.findByText("Playing Count the Well Stones")).toBeInTheDocument();
    expect(startDeedRun).toHaveBeenCalledWith("c1", "well-stones", "realm");
    await user.click(screen.getByRole("button", { name: "finish" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-interactive", "true");
    expect(screen.getByTestId("scene")).toHaveAttribute("data-rising", "well");
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("The Village Well stands.");
    expect(screen.getByText("12 min left")).toBeInTheDocument();
    const layout = sceneProps.layout as { props: { id: string; kind: string; tag?: string }[] };
    expect(layout.props.find((p) => p.id === "well")).toMatchObject({ kind: "building", tag: "Built" });
  });

  it("lets a parent read a site card without a Begin button", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 5, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={false} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onReachChange as (id: string | null) => void)("bram");
      (sceneProps.onTalk as (id: string) => void)("bram");
    });
    expect(await screen.findByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Begin / })).not.toBeInTheDocument();
    expect(screen.getByText("Side quests are for the hero to play.")).toBeInTheDocument();
    expect(startDeedRun).not.toHaveBeenCalled();
  });

  it("opens the world without villagers when the kingdom failed to load, and retries from the HUD", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 5, source: "earned" });
    getRealmKingdom.mockResolvedValue({ tone: "gentle", buildings: [well] });
    const user = userEvent.setup();
    render(<RealmShell bundle={{ ...bundle, kingdom: { tone: "gentle", buildings: [] }, kingdomError: "The villagers are resting. Try again." }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByText("The villagers are resting. Try again.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Wake the villagers" }));
    await waitFor(() => expect(screen.queryByText("The villagers are resting. Try again.")).not.toBeInTheDocument());
    const layout = sceneProps.layout as { props: { id: string; tag?: string }[] };
    expect(layout.props.find((p) => p.id === "well")!.tag).toBe("4 of 5");
  });

  it("has no villagers and ignores Talk while the kingdom failed to load", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, kingdom: { tone: "gentle", buildings: [] }, kingdomError: "The villagers are resting. Try again." }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    const layout = sceneProps.layout as { villagers: unknown[] };
    expect(layout.villagers.length).toBe(0);
    await act(async () => {
      (sceneProps.onTalk as (id: string) => void)("bram");
    });
    expect(screen.getByTestId("scene")).toHaveAttribute("data-interactive", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/· paused/)).not.toBeInTheDocument();
  });

  it("returns focus to the realm root when the panel closes", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onReachChange as (id: string | null) => void)("bram");
    });
    await act(async () => {
      (sceneProps.onTalk as (id: string) => void)("bram");
    });
    const dialog = await screen.findByRole("dialog", { name: "Old Bram" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    // The scene mock renders no bubble, so the root is the focus fallback.
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector(".realm-root")));
  });

  it("opens the site card with Enter when a villager is in reach", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onReachChange as (id: string | null) => void)("bram");
    });
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(await screen.findByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
  });

  it("does not open the site card when Enter is pressed on the Leave the Realm link", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onReachChange as (id: string | null) => void)("bram");
    });
    const link = screen.getByRole("link", { name: "Leave the Realm" });
    link.focus();
    fireEvent.keyDown(link, { key: "Enter" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  const pages = [{ id: "p0", slot: 1, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" }];

  it("shows the spell bar for a hero, hides it while a panel is open, and never for a parent", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Spellbook" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mana 100 of 100." })).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onReachChange as (id: string | null) => void)("bram");
      (sceneProps.onTalk as (id: string) => void)("bram");
    });
    expect(await screen.findByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Spellbook" })).not.toBeInTheDocument();
    cleanup();
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={false} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Spellbook" })).not.toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-spells", "false");
  });

  it("selects a page, passes the resolved spell to the scene, and reflects scene events in the HUD", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    expect(sceneProps.selectedSpell).toBeNull();
    await user.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    expect((sceneProps.selectedSpell as { manaCost: number }).manaCost).toBe(10);
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 61 });
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "cleared", troubleKind: "fog", count: 1 });
    });
    expect(screen.getByRole("img", { name: "Mana 61 of 100." })).toBeInTheDocument();
    // The cast hint took the speech lane when the page was selected and holds it for its
    // four seconds; "The fog thins." is held in `notice`, not destroyed (§3.6). The cleared
    // copy is proved on its own by task 10's `says what a cleared trouble did` case, which
    // never selects a page.
    expect(screen.getByTestId("realm-speech")).toHaveTextContent(
      "Tap or click where the spell should go, or press Space to aim at the nearest trouble."
    );
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused" });
    });
    // Same lane, same holder — and this is the priority rule stated outright. The refusal's
    // own copy is proved on its own by the new `shows a problem and a speech message at the
    // same time, one in each lane` case in edit (f) below, which raises no toast.
    expect(screen.queryByText("Not enough mana yet.")).not.toBeInTheDocument();
    expect(screen.getByTestId("realm-speech")).toHaveTextContent(
      "Tap or click where the spell should go, or press Space to aim at the nearest trouble."
    );
  });

  it("keeps the scene's settings and layout referentially stable across mana regen re-renders", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const layout = sceneProps.layout;
    const settings = sceneProps.settings;
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 90 });
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 80 });
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 70 });
    });
    expect(screen.getByRole("img", { name: "Mana 70 of 100." })).toBeInTheDocument();
    expect(sceneProps.settings).toBe(settings);
    expect(sceneProps.layout).toBe(layout);
  });

  it("flashes the mana strip red for 600 ms when a cast is refused, and still says why", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    expect(document.querySelector(".realm-mana-pips")).not.toHaveClass("realm-mana-pips--refused");
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused" });
    });
    expect(document.querySelector(".realm-mana-pips")).toHaveClass("realm-mana-pips--refused");
    expect(screen.getByText("Not enough mana yet.")).toBeInTheDocument();
    // The window is 600 ms of wall clock; nothing here is on a fake timer, so wait it out.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650));
    });
    expect(document.querySelector(".realm-mana-pips")).not.toHaveClass("realm-mana-pips--refused");
  });

  it("shakes the slot the hero actually picked, for the same 600 ms as the pips", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    await user.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused" });
    });
    expect(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }).className).toContain("realm-spell--refused");
    expect(document.querySelector(".realm-mana-pips")).toHaveClass("realm-mana-pips--refused");
    // One window, one state: both cues clear together when `refusedAt` resets.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650));
    });
    expect(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }).className).not.toContain("realm-spell--refused");
    expect(document.querySelector(".realm-mana-pips")).not.toHaveClass("realm-mana-pips--refused");
  });

  it("says what a cleared trouble did without keeping a score of it", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "cleared", troubleKind: "fog", count: 1 });
    });
    expect(screen.getByText("The fog thins.")).toBeInTheDocument();
    expect(screen.queryByText(/Cleared/)).not.toBeInTheDocument();
  });

  it("suppresses the mana strip for a parent and offers the mount button disabled", async () => {
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "school_hours" });
    render(<RealmShell bundle={{ ...bundle, avatarConfig: { ...DEFAULT_AVATAR, mount: "pony" } }} childId="c1" isChildView={false} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(document.querySelector(".realm-mana-pips")).toBeNull();
    expect(screen.getByRole("button", { name: "Ride your mount" })).toBeDisabled();
  });

  it("skips decorations under low-stimulus, in both the layout and the requested world texture set", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, profile: { ...DEFAULT_LEARNING_PROFILE, lowStimulus: true } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const layout = sceneProps.layout as { props: { kind: string }[] };
    expect(layout.props.some((p) => p.kind === "decor")).toBe(false);
    expect((spriteSourceProps.world as { decor: boolean }).decor).toBe(false);
  });

  it("places twelve decorations by default", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const layout = sceneProps.layout as { props: { kind: string }[] };
    expect(layout.props.filter((p) => p.kind === "decor")).toHaveLength(12);
  });

  it("uses monsters copy when the kingdom tone is monsters", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, kingdom: { ...bundle.kingdom, tone: "monsters" }, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    expect(sceneProps.troubleSkin).toBe("monsters");
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "cleared", troubleKind: "fog", count: 1 });
    });
    expect(screen.getByText("The mist-wisp scatters!")).toBeInTheDocument();
  });

  it("turns recess on only for a hero whose access source is recess, with a toast", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "recess" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-recess", "true");
    expect(screen.getByText("Recess · 0 gleams · 0 laps")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "recessStart" });
    });
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Recess!");
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "gleam", count: 1 });
    });
    // "Recess!" still owns the lane — the gleam notice is held beneath it. The tally is
    // the assertion that matters here, and the gleam's own copy is proved by the case below.
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Recess!");
    expect(screen.getByText("Recess · 1 gleam · 0 laps")).toBeInTheDocument();
    cleanup();
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-recess", "false");
    expect(screen.queryByText(/^Recess ·/)).not.toBeInTheDocument();
    cleanup();
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "recess" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={false} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-recess", "false");
  });

  it("says what a gleam did when no toast is holding the speech lane", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "recess" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    // No `recessStart` here, so nothing has raised a toast and the notice takes the lane.
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "gleam", count: 1 });
    });
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("A gleam! 1 so far.");
  });

  it("keeps the running lap and the best lap off the HUD, and counts finished laps in the pill", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "recess" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "lapTick", lapMs: 12_000 });
    });
    // D6.4: a best lap that resets on navigation is a lie, and the running clock is slice 12's.
    expect(screen.queryByText(/12\.0 s/)).not.toBeInTheDocument();
    expect(screen.getByText("Recess · 0 gleams · 0 laps")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "lap", laps: 1, lapMs: 30_000, best: true });
    });
    expect(screen.getByText("Recess · 0 gleams · 1 lap")).toBeInTheDocument();
    expect(screen.queryByText(/Best/)).not.toBeInTheDocument();
  });

  it("rides an unlocked equipped mount, blocks casting while riding, and hides the button otherwise", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    const riderBundle = { ...bundle, avatarConfig: { ...DEFAULT_AVATAR, mount: "pony" }, spellbook: { spells: pages, slots: 4 } };
    render(<RealmShell bundle={riderBundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ride your mount" }));
    expect(screen.getByTestId("scene")).toHaveAttribute("data-riding", "true");
    expect((sceneProps.mountSpeed as number)).toBe(4.5);
    await user.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    expect(screen.getByText("Dismount to cast.")).toBeInTheDocument();
    expect(sceneProps.selectedSpell).toBeNull();
    fireEvent.keyDown(document.body, { code: "KeyM", key: "m" });
    await waitFor(() => expect(screen.getByTestId("scene")).toHaveAttribute("data-riding", "false"));
    cleanup();
    render(<RealmShell bundle={{ ...riderBundle, mounts: { unlocked: [] } }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ride your mount" })).not.toBeInTheDocument();
  });

  it("dismounts with M even while focus is still on the HUD's Ride button", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    const riderBundle = { ...bundle, avatarConfig: { ...DEFAULT_AVATAR, mount: "pony" }, spellbook: { spells: pages, slots: 4 } };
    render(<RealmShell bundle={riderBundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ride your mount" }));
    expect(screen.getByTestId("scene")).toHaveAttribute("data-riding", "true");
    fireEvent.keyDown(screen.getByRole("button", { name: "Get off your mount" }), { code: "KeyM", key: "m" });
    await waitFor(() => expect(screen.getByTestId("scene")).toHaveAttribute("data-riding", "false"));
  });

  it("dismounts with M even while focus is still on the spell bar (any button, not just the HUD)", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    const riderBundle = { ...bundle, avatarConfig: { ...DEFAULT_AVATAR, mount: "pony" }, spellbook: { spells: pages, slots: 4 } };
    render(<RealmShell bundle={riderBundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ride your mount" }));
    expect(screen.getByTestId("scene")).toHaveAttribute("data-riding", "true");
    const spellBarButton = screen.getByRole("button", { name: "Ember Bolt, 10 mana" });
    await user.click(spellBarButton);
    expect(screen.getByText("Dismount to cast.")).toBeInTheDocument();
    expect(spellBarButton).toHaveFocus();
    fireEvent.keyDown(spellBarButton, { code: "KeyM", key: "m" });
    await waitFor(() => expect(screen.getByTestId("scene")).toHaveAttribute("data-riding", "false"));
  });

  it("ignores M with a modifier chord (leaves riding unchanged)", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    const riderBundle = { ...bundle, avatarConfig: { ...DEFAULT_AVATAR, mount: "pony" }, spellbook: { spells: pages, slots: 4 } };
    render(<RealmShell bundle={riderBundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ride your mount" }));
    expect(screen.getByTestId("scene")).toHaveAttribute("data-riding", "true");
    fireEvent.keyDown(document.body, { code: "KeyM", key: "m", metaKey: true });
    expect(screen.getByTestId("scene")).toHaveAttribute("data-riding", "true");
  });

  it("sets the Realm's layout custom properties from the hero's settings", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const root = document.querySelector<HTMLElement>(".realm-root")!;
    expect(root.style.getPropertyValue("--realm-hud-scale")).toBe("1");
    expect(root.style.getPropertyValue("--realm-bar-bottom")).toBe("1.25rem");
    cleanup();
    render(
      <RealmShell
        bundle={{ ...bundle, profile: { ...DEFAULT_LEARNING_PROFILE, largerText: true, inputMode: "touch" as const } }}
        childId="c1"
        isChildView={true}
      />
    );
    await screen.findByTestId("scene");
    const raised = document.querySelector<HTMLElement>(".realm-root")!;
    expect(raised.style.getPropertyValue("--realm-hud-scale")).toBe("1.25");
    expect(raised.style.getPropertyValue("--realm-bar-bottom")).toBe("9.5rem");
  });

  it("shows a problem and a speech message at the same time, one in each lane", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(
      <RealmShell
        bundle={{ ...bundle, kingdom: { tone: "gentle", buildings: [] }, kingdomError: "The villagers are resting. Try again.", spellbook: { spells: pages, slots: 4 } }}
        childId="c1"
        isChildView={true}
      />
    );
    await screen.findByTestId("scene");
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused" });
    });
    expect(screen.getByTestId("realm-problem")).toHaveTextContent("The villagers are resting. Try again.");
    expect(screen.getByRole("button", { name: "Wake the villagers" })).toBeInTheDocument();
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Not enough mana yet.");
  });

  it("puts the HUD zones and the lanes ahead of the world in the tab order", async () => {
    // §6: "The eight plates sit in DOM order after the HUD zones." Task 15 mounts those
    // plates in drei <Html> portals, which drei appends inside the Canvas wrapper — so the
    // only way the plates can follow the HUD is for the HUD to precede the scene here.
    // Paint order is unaffected: .realm-hud is z-index 20 and .realm-messages 21, while the
    // Canvas div is z-index auto and every <Html> in the scene is pinned below 20 by its
    // own zIndexRange (realm-scene.tsx uses [10, 0] and [15, 0] today).
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    const scene = await screen.findByTestId("scene");
    const hud = document.querySelector(".realm-hud")!;
    const messages = screen.getByTestId("realm-messages");
    expect(hud.compareDocumentPosition(scene) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(messages.compareDocumentPosition(scene) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("marks the new hero's first site on the layout and names it on the objective card", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, kingdom: { tone: "gentle", buildings: newKingdom } }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    const layout = sceneProps.layout as { props: { id: string; focus?: string }[]; villagers: { id: string; status: string }[] };
    // objectiveIds[0] is "well" for every brand-new hero: the opening is identical every time.
    expect(layout.props.find((p) => p.id === "well")!.focus).toBe("objective");
    expect(layout.villagers.find((v) => v.id === "bram")!.status).toBe("objective");
    const card = screen.getByRole("region", { name: "What to do next" });
    expect(within(card).getByText("Village Well")).toBeInTheDocument();
    expect(within(card).getByText("Old Bram is waiting.")).toBeInTheDocument();
  });

  it("folds the next objective into the rise toast, so two toasts never queue", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    startDeedRun.mockResolvedValue({ runId: "r1", deed: { id: "well-stones", title: "Count the Well Stones", story: "Dry again." }, questions: [], responses: [] });
    const user = userEvent.setup();
    const buildings = [well, ...newKingdom.filter((b) => b.id !== "well")];
    render(<RealmShell bundle={{ ...bundle, kingdom: { tone: "gentle", buildings } }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onTalk as (id: string) => void)("bram");
    });
    await user.click(await screen.findByRole("button", { name: "Begin Count the Well Stones" }));
    await user.click(await screen.findByRole("button", { name: "finish" }));
    expect(await screen.findByText("The Village Well stands. Next: the Grain Mill, with Miller Tessa.")).toBeInTheDocument();
  });

  it("opens a site card for every villager, whatever the objective says", async () => {
    // §3.19: the objective card is a suggestion, never a gate.
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    for (const buildings of [newKingdom, raisedKingdom]) {
      for (const depth of ["simple", "full"] as const) {
        for (const fewerChoices of [false, true]) {
          render(
            <RealmShell
              bundle={{ ...bundle, depth, kingdom: { tone: "gentle", buildings }, profile: { ...DEFAULT_LEARNING_PROFILE, fewerChoices } }}
              childId="c1"
              isChildView={true}
            />
          );
          expect(await screen.findByTestId("scene")).toBeInTheDocument();
          for (const v of VILLAGERS) {
            await act(async () => {
              (sceneProps.onTalk as (id: string) => void)(v.id);
            });
            const dialog = await screen.findByRole("dialog", { name: v.name });
            fireEvent.keyDown(dialog, { key: "Escape" });
          }
          cleanup();
        }
      }
    }
    // An unknown kingdom is the one closed door, and it is the pre-existing "no data for
    // this site yet" guard that closes it — not the objective, which renders no card at all.
    getRealmKingdom.mockResolvedValue({ tone: "gentle", buildings: newKingdom });
    render(<RealmShell bundle={{ ...bundle, kingdom: { tone: "gentle", buildings: [] }, kingdomError: "The villagers are resting. Try again." }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "What to do next" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wake the villagers" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "What to do next" })).toBeInTheDocument());
    for (const v of VILLAGERS) {
      await act(async () => {
        (sceneProps.onTalk as (id: string) => void)(v.id);
      });
      const dialog = await screen.findByRole("dialog", { name: v.name });
      fireEvent.keyDown(dialog, { key: "Escape" });
    }
  });
});

describe("RealmShell crown ceremony", () => {
  const ceremonyBundle = { ...bundle, ceremony: { seasonId: "s1", crownId: "crown-copper", ordinal: 1, grade: "3", seasonLabel: "2025–26" }, banners: 1 };
  const step = (s: string) => act(() => { (sceneProps.onCeremonyEvent as (e: unknown) => void)({ kind: "step", step: s }); });

  it("holds the ceremony for the hero, then records it and restores play", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    markCeremonySeen.mockResolvedValue(undefined);
    render(<RealmShell bundle={ceremonyBundle} childId="c1" isChildView={true} />);
    const scene = await screen.findByTestId("scene");
    expect(scene.dataset.ceremony).toBe("true");
    expect(scene.dataset.interactive).toBe("false");
    expect(screen.getByText("12 min left · paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(screen.queryByText("Copper Circlet")).not.toBeInTheDocument();
    step("gather");
    expect(screen.getByText("The people of the Realm gather.")).toBeInTheDocument();
    step("hail");
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Hail, Lily, Copper Circlet!");
    // The season toast is held, not destroyed: the ceremony owns the speech lane while it plays.
    expect(screen.queryByText("Season 1 complete")).not.toBeInTheDocument();
    step("done");
    // Skip is gone the instant "done" is emitted (ceremonyStage moves straight to
    // "finishing"), not only once the record request settles.
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
    await waitFor(() => expect(markCeremonySeen).toHaveBeenCalledWith("c1", "s1"));
    await waitFor(() => expect(screen.getByTestId("scene").dataset.interactive).toBe("true"));
    expect(screen.getByTestId("scene").dataset.ceremony).toBe("false");
    expect(screen.getByText("Copper Circlet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
    expect(screen.queryByText("Hail, Lily, Copper Circlet!")).not.toBeInTheDocument();
    // …and the toast that lost the lane appears the moment the ceremony clears it.
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Season 1 complete");
  });

  it("never lets a spell notice erase the crowning line", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    markCeremonySeen.mockResolvedValue(undefined);
    render(<RealmShell bundle={ceremonyBundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    step("hail");
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused" });
    });
    // ceremonyNotice and notice are two separate props on RealmMessages: the picker
    // chooses, the loser is simply not shown rather than overwritten (§3.6, §5).
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Hail, Lily, Copper Circlet!");
    expect(screen.queryByText("Not enough mana yet.")).not.toBeInTheDocument();
  });

  it("keeps the crown after the record request revalidates the bundle, and never restarts the ceremony", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    markCeremonySeen.mockResolvedValue(undefined);
    const { rerender } = render(<RealmShell bundle={ceremonyBundle} childId="c1" isChildView={true} />);
    const scene = await screen.findByTestId("scene");
    expect(scene.dataset.ceremony).toBe("true");
    const crownRequest = spriteSourceProps.crown;
    expect(crownRequest).toEqual({ id: "crown-copper", color: "#b87333" });
    step("gather");
    step("hail");
    step("done");
    await waitFor(() => expect(markCeremonySeen).toHaveBeenCalledWith("c1", "s1"));
    await waitFor(() => expect(screen.getByText("Copper Circlet")).toBeInTheDocument());
    expect(screen.getByTestId("scene").dataset.ceremony).toBe("false");
    // A server action revalidating the Realm route (as markCeremonySeen used to) would
    // deliver a fresh bundle whose ceremony is null. That must not restart the ceremony
    // or drop the crown sprite request.
    rerender(<RealmShell bundle={{ ...ceremonyBundle, ceremony: null }} childId="c1" isChildView={true} />);
    expect(screen.getByTestId("scene").dataset.ceremony).toBe("false");
    expect(screen.getByText("Copper Circlet")).toBeInTheDocument();
    expect(spriteSourceProps.crown).toEqual(crownRequest);
  });

  it("disables Ride while the ceremony runs and enables it once done", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    markCeremonySeen.mockResolvedValue(undefined);
    const riderCeremonyBundle = { ...ceremonyBundle, avatarConfig: { ...DEFAULT_AVATAR, mount: "pony" } };
    render(<RealmShell bundle={riderCeremonyBundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    expect(screen.getByRole("button", { name: "Ride your mount" })).toBeDisabled();
    step("gather");
    step("hail");
    step("done");
    await waitFor(() => expect(markCeremonySeen).toHaveBeenCalledWith("c1", "s1"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ride your mount" })).toBeEnabled());
  });

  it("raises the skip flag from the Skip button and from Escape", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={ceremonyBundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const skipRef = sceneProps.ceremonySkipRef as { current: boolean };
    expect(skipRef.current).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(skipRef.current).toBe(true);
    skipRef.current = false;
    fireEvent.keyDown(window, { key: "Escape" });
    expect(skipRef.current).toBe(true);
  });

  it("restores play and offers a retry when the ceremony cannot be recorded", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    markCeremonySeen.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(<RealmShell bundle={ceremonyBundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    step("done");
    expect(await screen.findByText(/The crown could not be recorded\./)).toBeInTheDocument();
    expect(screen.getByTestId("scene").dataset.interactive).toBe("true");
    expect(screen.queryByText("Copper Circlet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(markCeremonySeen).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Copper Circlet")).toBeInTheDocument();
    expect(screen.queryByText(/could not be recorded/)).not.toBeInTheDocument();
  });

  it("never holds a ceremony for a parent, and shows a worn crown as a badge", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "earned" });
    render(<RealmShell bundle={{ ...ceremonyBundle, wornCrown: { ordinal: 1, id: "crown-copper", label: "Copper Circlet", description: "", icon: "crown", color: "#b87333" } }} childId="c1" isChildView={false} />);
    const scene = await screen.findByTestId("scene");
    expect(scene.dataset.ceremony).toBe("false");
    expect(scene.dataset.interactive).toBe("true");
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
    expect(screen.getByText("Copper Circlet")).toBeInTheDocument();
  });
});

describe("RealmShell spell bar", () => {
  it("always shows the hero's book, with empty pages for open slots, and never shows a parent one", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    expect(screen.getByRole("toolbar", { name: "Spellbook" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Empty page \d$/ })).toHaveLength(4);
    cleanup();
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={false} />);
    await screen.findByTestId("scene");
    expect(screen.queryByRole("toolbar", { name: "Spellbook" })).not.toBeInTheDocument();
  });

  it("explains casting the first time a page is picked, in the words the input mode needs", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const spell = { id: "s1", slot: 1, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" };
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: [spell], slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    fireEvent.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    expect(screen.getByText("Tap or click where the spell should go, or press Space to aim at the nearest trouble.")).toBeInTheDocument();
    expect(document.querySelector(".realm-root")?.className).toContain("realm-root--aiming");
    cleanup();
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: [spell], slots: 4 }, profile: { ...DEFAULT_LEARNING_PROFILE, inputMode: "touch" as const } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    fireEvent.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    expect(screen.getByText("Tap where the spell should go.")).toBeInTheDocument();
  });
});

describe("RealmShell help card", () => {
  const ceremony = { seasonId: "s1", crownId: "crown-copper", ordinal: 1, grade: "3", seasonLabel: "2025–26" };

  it("opens the card on a first visit, records it on close, and only then starts a pending ceremony", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    markRealmHelpSeen.mockResolvedValue(undefined);
    render(<RealmShell bundle={{ ...bundle, helpSeen: false, ceremony, banners: 1 }} childId="c1" isChildView={true} />);
    const scene = await screen.findByTestId("scene");
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    expect(scene.dataset.ceremony).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeInTheDocument();
    await waitFor(() => expect(markRealmHelpSeen).toHaveBeenCalledWith("c1"));
    expect(screen.getByTestId("scene").dataset.ceremony).toBe("true");
  });

  it("closes the card even when the record fails", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    markRealmHelpSeen.mockRejectedValueOnce(new Error("offline"));
    render(<RealmShell bundle={{ ...bundle, helpSeen: false }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeInTheDocument();
    await waitFor(() => expect(markRealmHelpSeen).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("scene").dataset.interactive).toBe("true");
  });

  it("never opens by itself for a parent, but the ? button opens it and Escape closes it", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, helpSeen: false }} childId="c1" isChildView={false} />);
    await screen.findByTestId("scene");
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    const dialog = screen.getByRole("dialog", { name: "How to play" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeInTheDocument();
    expect(markRealmHelpSeen).not.toHaveBeenCalled();
  });

  it("lets Escape close the card before it skips a running ceremony", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, ceremony, banners: 1 }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    const skipRef = sceneProps.ceremonySkipRef as { current: boolean };
    fireEvent.keyDown(screen.getByRole("dialog", { name: "How to play" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeInTheDocument();
    expect(skipRef.current).toBe(false);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(skipRef.current).toBe(true);
  });

  it("holds a pending ceremony under a manually opened card, even if textures finish loading while it's open", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    holdNextSpriteMount = true;
    render(<RealmShell bundle={{ ...bundle, ceremony, banners: 1 }} childId="c1" isChildView={true} />);
    const helpButton = await screen.findByRole("button", { name: "How to play" });
    expect(screen.queryByTestId("scene")).not.toBeInTheDocument();
    fireEvent.click(helpButton);
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    await act(async () => {
      heldOnReady?.({ hero: {}, companion: null, villagers: {}, troubles: {}, mount: null, heroMounted: null, gleam: null, banner: null, crown: null, castleBanner: null, world: {}, tiles: null });
    });
    expect(screen.getByTestId("scene").dataset.ceremony).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("scene").dataset.ceremony).toBe("true");
  });

  it("suppresses the browser menu over the world and focuses the world on open", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const root = document.querySelector<HTMLElement>(".realm-root")!;
    await waitFor(() => expect(document.activeElement).toBe(root));
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    root.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });
});
