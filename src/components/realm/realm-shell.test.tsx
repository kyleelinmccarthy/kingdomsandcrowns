import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
vi.mock("./realm-scene", () => ({ default: () => <div data-testid="scene" /> }));
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
          onReady({ hero: {}, companion: null });
        }
      }, [onReady, onError]);
      return null;
    },
  };
});

const bundle = {
  heroName: "Lily",
  avatarConfig: DEFAULT_AVATAR,
  castleType: "campsite",
  builtBuildingIds: [],
  profile: DEFAULT_LEARNING_PROFILE,
  settings: { enabled: true, toneMode: "gentle" as const },
};

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
});
