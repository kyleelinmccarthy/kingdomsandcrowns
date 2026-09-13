import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RealmShell } from "./realm-shell";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
import { BUILDINGS } from "@/lib/utils/kingdom";
import { VILLAGERS } from "@/lib/realm/villagers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/realm",
}));
vi.mock("@/lib/actions/quest-assignments", () => ({
  completeAssignment: vi.fn(),
  getAssignmentQuestInfo: vi.fn().mockResolvedValue({ title: "Long division", requireNotes: false, subjectName: "Math" }),
}));

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
const setRealmDepth = vi.fn();
const setTutorialStep = vi.fn();
vi.mock("@/lib/actions/realm-settings", () => ({
  markRealmHelpSeen: (...a: unknown[]) => markRealmHelpSeen(...a),
  setRealmDepth: (...a: unknown[]) => setRealmDepth(...a),
  setTutorialStep: (...a: unknown[]) => setTutorialStep(...a),
}));
const speakMock = vi.fn();
vi.mock("@/lib/utils/speech", () => ({
  speak: (text: string) => speakMock(text),
  canSpeak: () => true,
}));
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
const bundle = { heroName: "Lily", avatarConfig: DEFAULT_AVATAR, castleType: "campsite", kingdom: { tone: "gentle" as const, buildings: [well] }, profile: DEFAULT_LEARNING_PROFILE, settings: { enabled: true, toneMode: "gentle" as const }, spellbook: { spells: [], slots: 4 }, mounts: { unlocked: ["pony"] }, ceremony: null, banners: 0, wornCrown: null, helpSeen: true, depthOverride: "auto" as const, depth: "full" as const, tutorialStep: 0 };

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
  setRealmDepth.mockResolvedValue(undefined);
  setTutorialStep.mockResolvedValue(undefined);
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

  it("hands the scene one door onto a villager, and keeps it referentially stable", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    // ONE door now: `E`, the bubble's Talk button and the nameplate all go through
    // `onTalk`. The second door was tap-to-talk, and Task 10 deleted it.
    expect(typeof sceneProps.onTalk).toBe("function");
    const talk = sceneProps.onTalk;
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 90 });
    });
    // `World` is memoised: a prop that changes identity on every mana tick would
    // re-render the whole scene sixty times a second.
    expect(sceneProps.onTalk).toBe(talk);
    await act(async () => {
      (sceneProps.onTalk as (id: string) => void)("bram");
    });
    expect(await screen.findByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
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

  it("talks on E and not on Enter or Space", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onReachChange as (id: string | null) => void)("bram");
    });
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(screen.queryByRole("dialog", { name: "Old Bram" })).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: " " }); // the spacebar: bound to nothing in the Realm now
    expect(screen.queryByRole("dialog", { name: "Old Bram" })).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "e", code: "KeyE" });
    expect(await screen.findByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
  });

  it("ignores an E from key-repeat and an E held with a modifier", async () => {
    // The guards that used to live on the input hook's cast key live here now, on the key
    // that has them: a child leaning on E must not reopen the panel, and Ctrl/Cmd/Alt+E is
    // a browser shortcut, not a talk.
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onReachChange as (id: string | null) => void)("bram");
    });
    fireEvent.keyDown(document.body, { key: "e", code: "KeyE", repeat: true });
    expect(screen.queryByRole("dialog", { name: "Old Bram" })).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "e", code: "KeyE", metaKey: true });
    expect(screen.queryByRole("dialog", { name: "Old Bram" })).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "e", code: "KeyE" });
    expect(await screen.findByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
  });

  it("does not open the site card when E is pressed on the Leave the Realm link", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onReachChange as (id: string | null) => void)("bram");
    });
    const link = screen.getByRole("link", { name: "Leave the Realm" });
    link.focus();
    fireEvent.keyDown(link, { key: "e", code: "KeyE" });
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
      "Press 1 to cast. Click to aim it."
    );
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused", reason: "mana" });
    });
    // A REFUSAL is the one thing that retires the hint, rather than losing the lane to it:
    // a red flash with someone else's sentence under it teaches a child nothing. The
    // priority rule itself is unchanged and is still proved above by "The fog thins."
    expect(screen.queryByText("Press 1 to cast. Click to aim it.")).not.toBeInTheDocument();
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Not enough mana yet.");
  });

  it("retires the cast hint when the very first cast of a visit refuses, so the red flash has its own words", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    // The first press of a page is what raises the once-per-visit hint — and, after task 8,
    // the same press is the cast. This is the first refusal a child can ever see.
    await act(async () => {
      fireEvent.keyDown(window, { key: "1" });
    });
    expect(screen.getByText("Press 1 to cast. Click to aim it.")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused", reason: "range" });
    });
    expect(document.querySelector(".realm-mana-pips")).toHaveClass("realm-mana-pips--refused");
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Nothing close enough yet. Move closer.");
    expect(screen.queryByText("Press 1 to cast. Click to aim it.")).not.toBeInTheDocument();
    // …and the lesson is not lost with it. The hint was nulled about a frame after it was
    // raised, so the child never read it; the next page press still owes them the sentence.
    await act(async () => {
      fireEvent.keyDown(window, { key: "1" });
    });
    expect(screen.getByText("Press 1 to cast. Click to aim it.")).toBeInTheDocument();
  });

  it("leaves a toast that is not the cast hint holding the lane when a cast refuses", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "recessStart" });
    });
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Recess!");
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused", reason: "range" });
    });
    // Only the hint is retired; §3.6's priority still stands for every other toast.
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Recess!");
  });

  it("does not re-offer the cast hint when a later refusal retires nothing, so once per visit stays once", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    // The hint is raised AND genuinely read — it holds the lane on its own.
    await act(async () => {
      fireEvent.keyDown(window, { key: "1" });
    });
    expect(screen.getByText("Press 1 to cast. Click to aim it.")).toBeInTheDocument();
    // Something else takes the toast lane, so the hint is long gone by its own accord.
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "recessStart" });
    });
    expect(screen.queryByText("Press 1 to cast. Click to aim it.")).not.toBeInTheDocument();
    // An unrelated refusal now. It retires nothing, so it must un-burn nothing either.
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused", reason: "range" });
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: "1" });
    });
    expect(screen.queryByText("Press 1 to cast. Click to aim it.")).not.toBeInTheDocument();
    expect(screen.getByTestId("realm-speech")).toHaveTextContent("Recess!");
  });

  it("casts at the nearest trouble on a number key, and casts again on a second press", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const castRef = sceneProps.castRef as { current: unknown };
    expect(castRef.current).toBeNull();
    await act(async () => {
      fireEvent.keyDown(window, { key: "1" });
    });
    // The page is selected AND the cast is queued — "1" is one verb, not two.
    expect((sceneProps.selectedSpell as { manaCost: number }).manaCost).toBe(10);
    expect(castRef.current).toEqual({ nearest: true });
    // The frame loop reads and clears the request; the same key pressed again queues another
    // cast rather than putting the spell away.
    castRef.current = null;
    await act(async () => {
      fireEvent.keyDown(window, { key: "1" });
    });
    expect(castRef.current).toEqual({ nearest: true });
    expect(sceneProps.selectedSpell).not.toBeNull();
    // Escape is the only way to put it away, and it queues no cast.
    castRef.current = null;
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(sceneProps.selectedSpell).toBeNull();
    expect(castRef.current).toBeNull();
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

  it("keeps EVERY non-primitive scene prop referentially stable across a mana tick", async () => {
    // `World` is memoised, so one prop that changes identity on every render undoes the memo
    // for all twenty-seven and the whole scene re-renders on a resource that ticks continuously.
    // Naming four of them leaves the other twenty-three uncovered — a broken onCeremonyEvent,
    // onRecessEvent or onTutorialSignal would pass — so this snapshots the lot and re-checks
    // each by identity.
    // A prop added by a later slice is covered the day it is added, without editing this test.
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const before = { ...sceneProps };
    const watched = Object.entries(before).filter(([, v]) => v !== null && (typeof v === "object" || typeof v === "function"));
    // A floor, not the exact count: if the scene ever stops receiving objects and handlers
    // the loop below would pass vacuously, and that must fail instead.
    expect(watched.length).toBeGreaterThanOrEqual(14);
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 90 });
    });
    expect(screen.getByRole("img", { name: "Mana 90 of 100." })).toBeInTheDocument(); // the tick really landed
    for (const [name, value] of watched) {
      expect(sceneProps[name], `scene prop \`${name}\` changed identity on a mana tick, breaking the World memo`).toBe(value);
    }
  });

  it("hands the scene the visit's surfaces, and keeps them referentially stable across mana re-renders", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, depth: "full" as const }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    expect(sceneProps.surfaces).toBeDefined();
    const surfaces = sceneProps.surfaces as { numerals: boolean; trackedObjectives: number };
    expect(surfaces.numerals).toBe(true);
    expect(surfaces.trackedObjectives).toBe(3);
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 90 });
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 80 });
    });
    expect(sceneProps.surfaces).toBe(surfaces);
  });

  it("draws the map in the HUD's corner and hands the scene the hero dot itself to move", async () => {
    // The wiring the minimap needs and nothing more: the dots come from React state, and the
    // one thing that moves per frame — the hero — reaches the scene as a ref to the very
    // element it will write, so no hero position ever passes through a render.
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const map = screen.getByRole("img", { name: "Map of the Realm" });
    expect(map.closest(".realm-hud-corner")).not.toBeNull();
    const dot = map.querySelector(".realm-minimap-hero");
    expect(dot).not.toBeNull();
    const ref = sceneProps.minimapRef as { current: SVGGElement | null };
    expect(ref.current).toBe(dot);
  });

  it("leaves the hero dot's transform to the scene, even when the HUD re-renders around it", async () => {
    // Stand in for a frame of the scene's loop by writing the element the way it does, then
    // make the shell re-render on a mana tick. If React owned that transform it would put the
    // resting value back and the dot would jump to the spawn point five times a second.
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const dot = screen.getByRole("img", { name: "Map of the Realm" }).querySelector(".realm-minimap-hero")!;
    dot.setAttribute("transform", "translate(42 17) rotate(90)");
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 90 });
    });
    expect(screen.getByRole("img", { name: "Mana 90 of 100." })).toBeInTheDocument(); // the tick really landed
    expect(screen.getByRole("img", { name: "Map of the Realm" }).querySelector(".realm-minimap-hero")).toBe(dot);
    expect(dot.getAttribute("transform")).toBe("translate(42 17) rotate(90)");
  });

  it("hands the scene pip surfaces for a hero at simple depth", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, depth: "simple" as const }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    expect((sceneProps.surfaces as { numerals: boolean; trackedObjectives: number }).numerals).toBe(false);
    expect((sceneProps.surfaces as { numerals: boolean; trackedObjectives: number }).trackedObjectives).toBe(1);
  });

  it("flashes the mana strip red for 600 ms when a cast is refused, and still says why", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    expect(document.querySelector(".realm-mana-pips")).not.toHaveClass("realm-mana-pips--refused");
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused", reason: "mana" });
    });
    expect(document.querySelector(".realm-mana-pips")).toHaveClass("realm-mana-pips--refused");
    expect(screen.getByText("Not enough mana yet.")).toBeInTheDocument();
    // The window is 600 ms of wall clock; nothing here is on a fake timer, so wait it out.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650));
    });
    expect(document.querySelector(".realm-mana-pips")).not.toHaveClass("realm-mana-pips--refused");
  });

  it("tells a hero who cast with nothing in range about the distance, not about their mana", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused", reason: "range" });
    });
    // Same red flash as any refusal — one cue, two causes.
    expect(document.querySelector(".realm-mana-pips")).toHaveClass("realm-mana-pips--refused");
    expect(screen.getByText("Nothing close enough yet. Move closer.")).toBeInTheDocument();
    expect(screen.queryByText("Not enough mana yet.")).not.toBeInTheDocument();
  });

  it("shakes the slot the hero actually picked, for the same 600 ms as the pips", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    await user.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused", reason: "mana" });
    });
    // Chosen, so the chip's own name says so now that it no longer lies with `aria-pressed`.
    expect(screen.getByRole("button", { name: "Ember Bolt, 10 mana, chosen" }).className).toContain("realm-spell--refused");
    expect(document.querySelector(".realm-mana-pips")).toHaveClass("realm-mana-pips--refused");
    // One window, one state: both cues clear together when `refusedAt` resets.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650));
    });
    expect(screen.getByRole("button", { name: "Ember Bolt, 10 mana, chosen" }).className).not.toContain("realm-spell--refused");
    expect(document.querySelector(".realm-mana-pips")).not.toHaveClass("realm-mana-pips--refused");
  });

  // Task 12: the two verbs a thumb did not have. A keyboard hero casts with `1` or a left
  // click and puts the spell away with Escape. A touch hero had neither — and since task 8
  // made a chip tap cast rather than toggle (rightly: a tap and its number key must mean one
  // thing), a child who armed a spell stayed armed for the whole visit, with every ground tap
  // casting and no way back.
  it("gives a touch hero a Cast button and a way to put the spell away again", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    const touch = { ...bundle, profile: { ...DEFAULT_LEARNING_PROFILE, inputMode: "touch" as const }, spellbook: { spells: pages, slots: 4 } };
    render(<RealmShell bundle={touch} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const cast = screen.getByRole("button", { name: "Cast" });
    expect(cast).toBeDisabled(); // visible from the start, so it teaches; inert until there is a spell
    expect(screen.queryByRole("button", { name: /^Put away .+$/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    expect(cast).toBeEnabled();
    const castRef = sceneProps.castRef as { current: unknown };
    castRef.current = null; // the tap's own select-and-cast, which the real scene eats each frame
    await user.click(cast);
    expect(castRef.current).toEqual({ nearest: true });

    // And back out again, without an Escape key.
    await user.click(screen.getByRole("button", { name: "Put away Ember Bolt" }));
    expect(sceneProps.selectedSpell).toBeNull();
    expect(screen.queryByRole("button", { name: "Put away Ember Bolt" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cast" })).toBeDisabled();
  });

  it("gives a keyboard hero neither button, since 1, a left click and Escape are already there", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const user = userEvent.setup();
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: pages, slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    await user.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    expect(screen.queryByRole("button", { name: "Cast" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Put away .+$/ })).not.toBeInTheDocument();
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

  it("keeps lap times and the best lap off the HUD, and counts finished laps in the pill", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "recess" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByText("Recess · 0 gleams · 0 laps")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onRecessEvent as (e: unknown) => void)({ kind: "lap", laps: 1, lapMs: 30_000, best: true });
    });
    // D6.4: a best lap that resets on navigation is a lie, and the running clock is slice 12's.
    // The pill is matched as a whole string, so it carries neither a time nor a best — and it
    // is driven by the one event the scene still emits. (The earlier `lapTick` injection named
    // an event kind nothing sends any more, so it only proved that an unknown event renders
    // nothing.) The lap's own cheer does say "Lap done: 30.0 s!" in the speech lane by design,
    // which is why this asserts on the pill rather than on the document.
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
    fireEvent.keyDown(screen.getByRole("button", { name: "Dismount from your mount" }), { code: "KeyM", key: "m" });
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
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused", reason: "mana" });
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
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused", reason: "mana" });
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
    expect(screen.getAllByRole("button", { name: /^Empty page \d\./ })).toHaveLength(4);
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
    expect(screen.getByText("Press 1 to cast. Click to aim it.")).toBeInTheDocument();
    expect(document.querySelector(".realm-root")?.className).toContain("realm-root--aiming");
    cleanup();
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: [spell], slots: 4 }, profile: { ...DEFAULT_LEARNING_PROFILE, inputMode: "touch" as const } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    fireEvent.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    expect(screen.getByText("Tap a spell to cast it.")).toBeInTheDocument();
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

  it("hands focus back to the ? button on close, never to the Talk bubble", async () => {
    // The defect this exists for: `onHelpClose` reused `returnFocus()`, which was written for
    // the DEED PANEL and whose rule is "back to the Talk bubble if the hero is still in reach".
    // So a child who opened "How to play" while standing next to Hesper closed it and landed on
    // "Talk to Hesper" — a control they never came from, one keypress from opening a panel, and
    // for a screen-reader child indistinguishable from the card having opened something.
    // The bubble is the SCENE's, and this suite mocks the scene whole, so it is stood up here by
    // hand: it is the exact selector the old code queried for, and without it this test would
    // pass against that code by accident.
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const bubble = document.createElement("button");
    bubble.className = "realm-bubble-talk";
    bubble.textContent = "Talk to Old Bram";
    document.querySelector(".realm-root")!.appendChild(bubble);

    const help = screen.getByRole("button", { name: "How to play" });
    fireEvent.click(help);
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.activeElement).toBe(help));
    expect(document.activeElement).not.toBe(bubble);
  });

  it("hands focus to the world when the card opened itself, since no control was pressed", async () => {
    // The first-visit path has no trigger to go back to: the card opens on its own once the
    // sprites arrive. The world is where the hero is about to play, so that is where they land.
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    markRealmHelpSeen.mockResolvedValue(undefined);
    render(<RealmShell bundle={{ ...bundle, helpSeen: false }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const root = document.querySelector(".realm-root");
    await waitFor(() => expect(document.activeElement).toBe(root));
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

  it("lets a hero swap views from the card, and keeps the visit's view when the write fails", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    setRealmDepth.mockRejectedValueOnce(new Error("offline"));
    render(<RealmShell bundle={{ ...bundle, depth: "simple" as const }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show me everything" }));
    });
    expect(setRealmDepth).toHaveBeenCalledWith("c1", "full");
    expect(screen.getByText("That didn't save. Try again.")).toBeInTheDocument();
    // The write never landed, so the visit is still on the simple view.
    expect(screen.getByRole("button", { name: "Show me everything" })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show me everything" }));
    });
    expect(setRealmDepth).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Keep it simple" })).toBeInTheDocument();
    expect(screen.queryByText("That didn't save. Try again.")).not.toBeInTheDocument();
  });

  it("never offers the view control to a parent, or to a hero who needs fewer choices", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, depth: "simple" as const }} childId="c1" isChildView={false} />);
    await screen.findByTestId("scene");
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show me everything" })).not.toBeInTheDocument();
    cleanup();
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, depth: "simple" as const, profile: { ...DEFAULT_LEARNING_PROFILE, fewerChoices: true } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show me everything" })).not.toBeInTheDocument();
    expect(setRealmDepth).not.toHaveBeenCalled();
  });
});

describe("RealmShell reach and speech", () => {
  const inReach = async (id: string | null) => {
    await act(async () => {
      (sceneProps.onReachChange as (id: string | null) => void)(id);
    });
  };

  it("announces the villager in reach whether or not read-aloud is on, and clears it on the way out", async () => {
    expect(bundle.profile.readAloud).toBe(false);
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await inReach("bram");
    expect(screen.getByText("Old Bram is here. Press E to talk.")).toBeInTheDocument();
    await inReach(null);
    expect(screen.queryByText("Old Bram is here. Press E to talk.")).not.toBeInTheDocument();
    cleanup();
    render(<RealmShell bundle={{ ...bundle, profile: { ...DEFAULT_LEARNING_PROFILE, readAloud: true } }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await inReach("bram");
    expect(screen.getByText("Old Bram is here. Press E to talk.")).toBeInTheDocument();
  });

  it("tells a keyboard child to press E, and a touch child to tap", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await inReach("bram");
    await waitFor(() => expect(screen.getByTestId("realm-speech")).toHaveTextContent(/press E to talk/i));
    cleanup();
    render(<RealmShell bundle={{ ...bundle, profile: { ...DEFAULT_LEARNING_PROFILE, inputMode: "touch" as const } }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await inReach("bram");
    await waitFor(() => expect(screen.getByTestId("realm-speech")).toHaveTextContent(/tap talk/i));
  });

  it("names the touch control when the on-screen stick is showing", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, profile: { ...DEFAULT_LEARNING_PROFILE, inputMode: "touch" as const } }} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await inReach("bram");
    expect(screen.getByText("Old Bram is here. Tap Talk.")).toBeInTheDocument();
    expect(screen.queryByText("Old Bram is here. Press E to talk.")).not.toBeInTheDocument();
  });

  it("lets a spell notice borrow the lane, then puts the reach line back when it expires", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await inReach("bram");
    expect(screen.getByText("Old Bram is here. Press E to talk.")).toBeInTheDocument();
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused", reason: "mana" });
    });
    expect(screen.getByText("Not enough mana yet.")).toBeInTheDocument();
    expect(screen.queryByText("Old Bram is here. Press E to talk.")).not.toBeInTheDocument();
    // The spell notice clears itself after two seconds. The reach line never had a timer:
    // it is still there underneath, and comes back on its own.
    await waitFor(() => expect(screen.getByText("Old Bram is here. Press E to talk.")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.queryByText("Not enough mana yet.")).not.toBeInTheDocument();
  });

  const readAloudBundle = { ...bundle, profile: { ...DEFAULT_LEARNING_PROFILE, readAloud: true } };
  const OBJECTIVE_LINE = "Your next side quest is at the Village Well. Old Bram is waiting.";

  it("speaks the next objective once when the world first becomes interactive", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={readAloudBundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await waitFor(() => expect(speakMock).toHaveBeenCalledWith(OBJECTIVE_LINE));
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 90 });
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 80 });
    });
    expect(speakMock.mock.calls.filter((c) => c[0] === OBJECTIVE_LINE)).toHaveLength(1);
  });

  it("speaks each speech-lane message once, and never twice for the same words", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={readAloudBundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await waitFor(() => expect(speakMock).toHaveBeenCalledWith(OBJECTIVE_LINE));
    await inReach("bram");
    await waitFor(() => expect(speakMock).toHaveBeenCalledWith("Old Bram is here. Press E to talk."));
    const spokenSoFar = speakMock.mock.calls.length;
    // Re-renders that change no message say nothing.
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "mana", current: 90 });
    });
    expect(speakMock).toHaveBeenCalledTimes(spokenSoFar);
    await act(async () => {
      (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused", reason: "mana" });
    });
    await waitFor(() => expect(speakMock).toHaveBeenCalledWith("Not enough mana yet."));
    expect(speakMock.mock.calls.filter((c) => c[0] === "Old Bram is here. Press E to talk.")).toHaveLength(1);
  });

  it("speaks the ceremony narration through the lane, and the objective only once the ceremony is over", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    markCeremonySeen.mockResolvedValue(undefined);
    render(<RealmShell bundle={{ ...readAloudBundle, ceremony: { seasonId: "s1", crownId: "crown-copper", ordinal: 1, grade: "3", seasonLabel: "2025–26" }, banners: 1 }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    // The world is not interactive while the ceremony plays, so the objective waits.
    expect(speakMock).not.toHaveBeenCalledWith(OBJECTIVE_LINE);
    await act(async () => {
      (sceneProps.onCeremonyEvent as (e: unknown) => void)({ kind: "step", step: "gather" });
    });
    await waitFor(() => expect(speakMock).toHaveBeenCalledWith("The people of the Realm gather."));
    expect(speakMock.mock.calls.filter((c) => c[0] === "The people of the Realm gather.")).toHaveLength(1);
    await act(async () => {
      (sceneProps.onCeremonyEvent as (e: unknown) => void)({ kind: "step", step: "done" });
    });
    await waitFor(() => expect(markCeremonySeen).toHaveBeenCalledWith("c1", "s1"));
    await waitFor(() => expect(speakMock).toHaveBeenCalledWith(OBJECTIVE_LINE));
  });

  it("speaks nothing when read-aloud is off, and nothing at all in preview", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await inReach("bram");
    expect(screen.getByText("Old Bram is here. Press E to talk.")).toBeInTheDocument();
    expect(speakMock).not.toHaveBeenCalled();
    cleanup();
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "earned" });
    render(<RealmShell bundle={readAloudBundle} childId="c1" isChildView={false} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await inReach("bram");
    // A parent sees the line and hears nothing: readAloud is the child's setting.
    expect(screen.getByText("Old Bram is here. Press E to talk.")).toBeInTheDocument();
    expect(speakMock).not.toHaveBeenCalled();
  });
  // ── The tutorial (§ task 13) ───────────────────────────────────────────────────────────
  const openRealm = async (over: Record<string, unknown> = {}, isChildView = true) => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 20, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, ...over }} childId="c1" isChildView={isChildView} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
  };
  const sendSignal = async (sig: unknown) => {
    await act(async () => {
      (sceneProps.onTutorialSignal as (s: unknown) => void)(sig);
    });
  };
  // The box is ALWAYS mounted for a child now (realm-tutorial.tsx): a live region that is
  // re-created already holding its text announces nothing, so "nothing is being taught" is an
  // EMPTY region rather than a missing one. Two halves, and both matter — the region is there
  // for the screen reader, and it says nothing and offers no Skip, so a child sees and hears
  // exactly what the old early return gave them.
  const expectNoPrompt = () => {
    expect(screen.getByTestId("realm-tutorial").textContent).toBe("");
    expect(screen.queryByRole("button", { name: "Skip the tutorial" })).not.toBeInTheDocument();
  };

  it("starts a brand-new hero on the first verb", async () => {
    await openRealm();
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Use W, A, S and D to walk.");
    expect(setTutorialStep).not.toHaveBeenCalled();
  });

  it("does NOT finish the walking step for a hero who only ever pressed W", async () => {
    // The whole design of step one, and the half that is easy to skip: a child who only
    // presses W has not learned to move, and telling them they have is how they get stuck
    // later. Distance alone is not enough, however far they walked.
    await openRealm();
    await sendSignal({ kind: "walked", keys: ["KeyW"], distance: 40 });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Use W, A, S and D to walk.");
    expect(setTutorialStep).not.toHaveBeenCalled();
    // And the same distance with a second key finishes it — so the refusal above was about
    // the keys, not about the signal never arriving.
    await sendSignal({ kind: "walked", keys: ["KeyW", "KeyD"], distance: 40 });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Go where the light is.");
    await waitFor(() => expect(setTutorialStep).toHaveBeenCalledWith("c1", 1));
  });

  it("does not finish the walking step on two keys and no distance either", async () => {
    await openRealm();
    await sendSignal({ kind: "walked", keys: ["KeyW", "KeyD"], distance: 0.5 });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Use W, A, S and D to walk.");
    expect(setTutorialStep).not.toHaveBeenCalled();
  });

  it("advances the tutorial only when the child does the thing, and remembers it", async () => {
    await openRealm({ tutorialStep: 2 });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Stand close and press E.");
    await act(async () => { (sceneProps.onTalk as (id: string) => void)("bram"); });
    await waitFor(() => expect(setTutorialStep).toHaveBeenCalledWith("c1", 3));
  });

  it("hears the E key itself, which is the key step three names", async () => {
    // The prompt says "press E", so the E path — not just the Talk bubble — has to be the
    // one the tutorial can see. It goes through `onTalk` for exactly this reason.
    await openRealm({ tutorialStep: 2 });
    await inReach("bram");
    fireEvent.keyDown(document.body, { key: "e", code: "KeyE" });
    expect(await screen.findByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
    await waitFor(() => expect(setTutorialStep).toHaveBeenCalledWith("c1", 3));
  });

  it("walks the four steps in order, ignoring a signal meant for a step that is not current", async () => {
    await openRealm();
    // Arriving at the light before the walking is learned teaches nothing and moves nothing.
    await sendSignal({ kind: "reachedObjective" });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Use W, A, S and D to walk.");
    await sendSignal({ kind: "walked", keys: ["KeyW", "KeyA"], distance: 6 });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Go where the light is.");
    await sendSignal({ kind: "castLanded" }); // out of turn: step two is not a cast
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Go where the light is.");
    await sendSignal({ kind: "reachedObjective" });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Stand close and press E.");
    await act(async () => { (sceneProps.onTalk as (id: string) => void)("bram"); });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Press 1.");
    await act(async () => { (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "castState", casting: true }); });
    expectNoPrompt();
    await waitFor(() => expect(setTutorialStep).toHaveBeenLastCalledWith("c1", 4));
    expect(setTutorialStep.mock.calls.map((c) => c[1])).toEqual([1, 2, 3, 4]);
  });

  it("does not count a refused cast as the casting step", async () => {
    await openRealm({ tutorialStep: 3 });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Press 1.");
    await act(async () => { (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "refused", reason: "range" }); });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Press 1.");
    await act(async () => { (sceneProps.onSpellEvent as (e: unknown) => void)({ kind: "castState", casting: false }); });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Press 1.");
    expect(setTutorialStep).not.toHaveBeenCalled();
  });

  it("resumes where the hero left off, and shows nothing once every step is done", async () => {
    await openRealm({ tutorialStep: 1 });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Go where the light is.");
    cleanup();
    await openRealm({ tutorialStep: 4 });
    expectNoPrompt();
  });

  it("skips past the last step and writes that down, so it does not come back", async () => {
    await openRealm();
    await userEvent.click(screen.getByRole("button", { name: /skip/i }));
    expectNoPrompt();
    await waitFor(() => expect(setTutorialStep).toHaveBeenCalledWith("c1", 4));
  });

  it("never throws a failed save over a running world", async () => {
    // Fire-and-forget: a lost write costs the child a repeated step next visit, which is far
    // better than an error over the game — and the child is told nothing about it either way.
    setTutorialStep.mockRejectedValue(new Error("offline"));
    await openRealm();
    await sendSignal({ kind: "walked", keys: ["KeyW", "KeyD"], distance: 9 });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Go where the light is.");
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("scene")).toBeInTheDocument();
  });

  it("shows no prompt at all to a hero whose kingdom is already finished", async () => {
    // `tutorialStep` defaults to 0, so EVERY hero who finished their kingdom before this
    // shipped starts at step 0 — and with every building raised there is no lit site to go to
    // (nothing carries `focus: "objective"`) and no troubles to cast at (they only spawn at
    // unfinished sites). Three of the four steps are impossible, `deedsDone` never goes down,
    // and the prompt would never have resolved itself: they would read an instruction they
    // cannot obey, every visit, forever.
    await openRealm({ kingdom: { tone: "gentle" as const, buildings: raisedKingdom } });
    expectNoPrompt();
    expect(setTutorialStep).not.toHaveBeenCalled();
  });

  it("holds the prompt back while the kingdom cannot be read, and gives it back on the retry", async () => {
    // The same trap, transient: a kingdom that failed to load has no sites, no villagers and
    // no troubles either. The step the hero has really reached is untouched underneath, so
    // the retry brings back the prompt they were on rather than starting them over.
    getRealmKingdom.mockResolvedValue({ tone: "gentle", buildings: [well] });
    const user = userEvent.setup();
    await openRealm({ tutorialStep: 1, kingdom: { tone: "gentle" as const, buildings: [] }, kingdomError: "The villagers are resting. Try again." });
    expectNoPrompt();
    await user.click(screen.getByRole("button", { name: "Wake the villagers" }));
    await waitFor(() => expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Go where the light is."));
  });

  it("shows a parent no tutorial and writes nothing on their behalf", async () => {
    await openRealm({}, false);
    expect(screen.queryByTestId("realm-tutorial")).not.toBeInTheDocument();
    await sendSignal({ kind: "walked", keys: ["KeyW", "KeyD"], distance: 9 });
    await act(async () => { (sceneProps.onTalk as (id: string) => void)("bram"); });
    expect(setTutorialStep).not.toHaveBeenCalled();
  });

  it("lets a hero start the walkthrough again from the help card", async () => {
    // A finished hero has completed every step (nothing showing), presses the card's replay
    // control, and lands back on the first prompt — the same reset `setTutorialStep(childId, 0)`
    // gives on the next visit, applied without waiting on the round trip.
    await openRealm({ tutorialStep: 4 });
    expectNoPrompt();
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show me the tutorial again" }));
    });
    expect(setTutorialStep).toHaveBeenCalledWith("c1", 0);
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeInTheDocument();
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Use W, A, S and D to walk.");
  });

  it("lets a hero FINISH the replayed walkthrough, not just start it", async () => {
    // The dead end this closes (C1). The scene's walk accumulators are refs, and the replay
    // control resets the shell without remounting the scene, so a hero who has already walked
    // with all four of W/A/S/D arrives back at step one with the key set full — and on the old
    // key-count-only rule no `walked` signal could ever be emitted again. `shouldEmitWalked`
    // owns the re-emit (proved against the distance rule in tutorial.test.ts); this is the
    // other half of the round trip: when the scene does speak again, with the four keys it has
    // been carrying all visit, the REPLAYED tutorial really does move on.
    await openRealm({ tutorialStep: 4 });
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show me the tutorial again" }));
    });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Use W, A, S and D to walk.");
    await sendSignal({ kind: "walked", keys: ["KeyW", "KeyA", "KeyS", "KeyD"], distance: 104 });
    expect(screen.getByTestId("realm-tutorial")).toHaveTextContent("Go where the light is.");
    expect(setTutorialStep).toHaveBeenLastCalledWith("c1", 1);
  });

  it("offers no replay control to a parent's preview", async () => {
    await openRealm({}, false);
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show me the tutorial again" })).not.toBeInTheDocument();
  });
});
