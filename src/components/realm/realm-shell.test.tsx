import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
vi.mock("./sprite-source", async () => {
  const React = await import("react");
  return {
    SpriteSource: ({ onReady }: { onReady: (t: unknown) => void }) => {
      // Report readiness after mount, the way the real component does, so no parent state is set during render.
      React.useEffect(() => {
        onReady({ hero: {}, companion: null });
      }, [onReady]);
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

beforeEach(() => vi.clearAllMocks());
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
});
