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
    return <div data-testid="scene" data-interactive={String(props.interactive)} data-rising={String(props.risingId ?? "")} />;
  },
}));
const startDeedRun = vi.fn();
const getRealmKingdom = vi.fn();
vi.mock("@/lib/actions/deeds", () => ({ startDeedRun: (...a: unknown[]) => startDeedRun(...a), answerDeedQuestion: vi.fn(), completeDeedRun: vi.fn() }));
vi.mock("@/lib/actions/realm", () => ({ getRealmKingdom: (...a: unknown[]) => getRealmKingdom(...a) }));
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
vi.mock("./sprite-source", async () => {
  const React = await import("react");
  return {
    SpriteSource: ({ onReady, onError }: { onReady: (t: unknown) => void; onError: (e: Error) => void }) => {
      // Report readiness (or failure) after mount, the way the real component does, so no parent state is set during render.
      React.useEffect(() => {
        if (failNextSpriteMount) {
          failNextSpriteMount = false;
          onError(new Error("boom"));
        } else {
          onReady({ hero: {}, companion: null, villagers: {} });
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
const bundle = { heroName: "Lily", avatarConfig: DEFAULT_AVATAR, castleType: "campsite", kingdom: { tone: "gentle" as const, buildings: [well] }, profile: DEFAULT_LEARNING_PROFILE, settings: { enabled: true, toneMode: "gentle" as const } };

beforeEach(() => {
  vi.clearAllMocks();
  failNextSpriteMount = false;
  flushPendingCalls = 0;
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
    expect(screen.getByText("Deeds are for the hero to play.")).toBeInTheDocument();
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
});
