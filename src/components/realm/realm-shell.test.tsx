import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RealmShell } from "./realm-shell";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";

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
vi.mock("@/components/deed-player", () => ({
  DeedPlayer: ({ run, onFinished }: { run: { deed: { title: string } }; onFinished: (s: unknown) => void }) => (
    <div>
      <p>Playing {run.deed.title}</p>
      <button type="button" onClick={() => onFinished({ correctCount: 8, total: 8, flawless: true, masteryChanges: [], building: { label: "Village Well", done: 5, total: 5, complete: true } })}>finish</button>
    </div>
  ),
}));
// The real hook, with `flushPending` wrapped so tests can assert it was
// called on retry without duplicating use-play-clock.test.ts's own coverage
// of what flushPending actually does.
let flushPendingCalls = 0;
vi.mock("./use-play-clock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./use-play-clock")>();
  return {
    ...actual,
    usePlayClock: (...args: Parameters<typeof actual.usePlayClock>) => {
      const hook = actual.usePlayClock(...args);
      return {
        ...hook,
        flushPending: () => {
          flushPendingCalls += 1;
          return hook.flushPending();
        },
      };
    },
  };
});
// A module-level switch: when armed, the next SpriteSource mount reports an
// error (as if the sprite rasterizer failed) instead of success, then
// disarms itself. Only the retry test arms it, so every other test (and the
// remount that "Try again" triggers) sees the ordinary success path.
let failNextSpriteMount = false;
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
        } else {
          onReady({ hero: {}, companion: null, villagers: {}, troubles: {}, mount: null, heroMounted: null, gleam: null, banner: null, crown: null, castleBanner: null });
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
const bundle = { heroName: "Lily", avatarConfig: DEFAULT_AVATAR, castleType: "campsite", kingdom: { tone: "gentle" as const, buildings: [well] }, profile: DEFAULT_LEARNING_PROFILE, settings: { enabled: true, toneMode: "gentle" as const }, spellbook: { spells: [], slots: 4 }, mounts: { unlocked: ["pony"] }, ceremony: null, banners: 0, wornCrown: null, helpSeen: true };

beforeEach(() => {
  vi.clearAllMocks();
  failNextSpriteMount = false;
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
    expect(screen.getByText("Closed for Lily: It's school time.")).toBeInTheDocument();
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
    expect(await screen.findByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
    expect(screen.getByText("4 of 5")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-interactive", "false");
    expect(screen.getByText("12 min left · paused")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Begin Count the Well Stones" }));
    expect(await screen.findByText("Playing Count the Well Stones")).toBeInTheDocument();
    expect(startDeedRun).toHaveBeenCalledWith("c1", "well-stones", "realm");
    await user.click(screen.getByRole("button", { name: "finish" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-interactive", "true");
    expect(screen.getByTestId("scene")).toHaveAttribute("data-rising", "well");
    expect(screen.getByRole("status")).toHaveTextContent("The Village Well stands.");
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
    expect(screen.getByRole("progressbar", { name: "Mana" })).toBeInTheDocument();
    expect(screen.getByText("Cleared: 0")).toBeInTheDocument();
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
    expect(screen.getByRole("progressbar", { name: "Mana" })).toHaveAttribute("aria-valuenow", "61");
    expect(screen.getByText("Cleared: 1")).toBeInTheDocument();
    expect(screen.getByText("The fog thins.")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused" });
    });
    expect(screen.getByText("Not enough mana yet.")).toBeInTheDocument();
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
    expect(screen.getByRole("progressbar", { name: "Mana" })).toHaveAttribute("aria-valuenow", "70");
    expect(sceneProps.settings).toBe(settings);
    expect(sceneProps.layout).toBe(layout);
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
    expect(screen.getByText("Gleams: 0")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "recessStart" });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Recess!");
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "gleam", count: 1 });
    });
    expect(screen.getByText("A gleam! 1 so far.")).toBeInTheDocument();
    expect(screen.getByText("Gleams: 1")).toBeInTheDocument();
    cleanup();
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-recess", "false");
    expect(screen.queryByText(/Gleams:/)).not.toBeInTheDocument();
    cleanup();
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "recess" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={false} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByTestId("scene")).toHaveAttribute("data-recess", "false");
  });

  it("shows the running lap time while recess is active", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "recess" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "lapTick", lapMs: 12_000 });
    });
    expect(screen.getByText(/12\.0 s/)).toBeInTheDocument();
  });

  it("rides an unlocked equipped mount, blocks casting while riding, and hides the button otherwise", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    const riderBundle = { ...bundle, avatarConfig: { ...DEFAULT_AVATAR, mount: "pony" }, spellbook: { spells: pages, slots: 4 } };
    render(<RealmShell bundle={riderBundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ride" }));
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
    expect(screen.queryByRole("button", { name: "Ride" })).not.toBeInTheDocument();
  });

  it("dismounts with M even while focus is still on the HUD's Ride button", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    const riderBundle = { ...bundle, avatarConfig: { ...DEFAULT_AVATAR, mount: "pony" }, spellbook: { spells: pages, slots: 4 } };
    render(<RealmShell bundle={riderBundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ride" }));
    expect(screen.getByTestId("scene")).toHaveAttribute("data-riding", "true");
    fireEvent.keyDown(screen.getByRole("button", { name: "Dismount" }), { code: "KeyM", key: "m" });
    await waitFor(() => expect(screen.getByTestId("scene")).toHaveAttribute("data-riding", "false"));
  });

  it("dismounts with M even while focus is still on the spell bar (any button, not just the HUD)", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    const riderBundle = { ...bundle, avatarConfig: { ...DEFAULT_AVATAR, mount: "pony" }, spellbook: { spells: pages, slots: 4 } };
    render(<RealmShell bundle={riderBundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ride" }));
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
    await user.click(screen.getByRole("button", { name: "Ride" }));
    expect(screen.getByTestId("scene")).toHaveAttribute("data-riding", "true");
    fireEvent.keyDown(document.body, { code: "KeyM", key: "m", metaKey: true });
    expect(screen.getByTestId("scene")).toHaveAttribute("data-riding", "true");
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
    expect(screen.getByText("Hail, Lily, Copper Circlet!")).toBeInTheDocument();
    expect(screen.getByText("Season 1 complete")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Ride" })).toBeDisabled();
    step("gather");
    step("hail");
    step("done");
    await waitFor(() => expect(markCeremonySeen).toHaveBeenCalledWith("c1", "s1"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ride" })).toBeEnabled());
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
