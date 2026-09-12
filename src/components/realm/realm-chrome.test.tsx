import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { RealmShell } from "./realm-shell";
import { QuestTimerPopup } from "@/components/quest-timer-popup";
import { SwitchHero } from "@/components/switch-hero";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/realm",
}));
// The hand-off dialog's contents are not what this file is about, and mounting
// them would try to fetch the family's heroes over the network.
vi.mock("@/components/hero-login", () => ({ HeroLogin: () => <div /> }));
vi.mock("@/lib/actions/quest-assignments", () => ({
  completeAssignment: vi.fn(),
  getAssignmentQuestInfo: vi.fn().mockResolvedValue({ requireNotes: false }),
}));

const getRealmAccess = vi.fn();
vi.mock("@/lib/actions/realm-play", () => ({
  getRealmAccess: (...a: unknown[]) => getRealmAccess(...a),
  recordRealmPlay: vi.fn(),
}));
vi.mock("./realm-scene", () => ({ default: () => <div data-testid="scene" /> }));
vi.mock("@/lib/actions/deeds", () => ({ startDeedRun: vi.fn(), answerDeedQuestion: vi.fn(), completeDeedRun: vi.fn() }));
vi.mock("@/lib/actions/realm", () => ({ getRealmKingdom: vi.fn() }));
vi.mock("@/lib/actions/seasons", () => ({ markCeremonySeen: vi.fn() }));
vi.mock("@/lib/actions/realm-settings", () => ({ markRealmHelpSeen: vi.fn(), setRealmDepth: vi.fn() }));
vi.mock("./sprite-source", async () => {
  const React = await import("react");
  return {
    SpriteSource: ({ onReady }: { onReady: (t: unknown) => void }) => {
      React.useEffect(() => {
        onReady({ hero: {}, companion: null, villagers: {}, troubles: {}, mount: null, heroMounted: null, gleam: null, banner: null, crown: null, castleBanner: null, world: {}, tiles: null });
      }, [onReady]);
      return null;
    },
  };
});

const well = {
  id: "well", label: "Village Well", description: "Clean water for every doorstep.", icon: "box" as const, done: 4, total: 5, complete: false,
  deeds: [{ id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const }],
};
const bundle = {
  heroName: "Lily",
  avatarConfig: DEFAULT_AVATAR,
  castleType: "campsite",
  kingdom: { tone: "gentle" as const, buildings: [well] },
  profile: DEFAULT_LEARNING_PROFILE,
  settings: { enabled: true, toneMode: "gentle" as const },
  spellbook: { spells: [], slots: 4 },
  mounts: { unlocked: ["pony"] },
  ceremony: null,
  banners: 0,
  wornCrown: null,
  helpSeen: true,
  depthOverride: "auto" as const,
  depth: "full" as const,
};

const QUEST_TIMER_KEY = "kingdomsandcrowns:quest-timer";
// jsdom does not evaluate `:has()` and vitest never loads the app's stylesheet,
// so the cascade half of this design is asserted against the stylesheet's text
// and the behavioural half against the attribute the rule's fallback reads.
const GLOBALS_CSS = fs.readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8").replace(/\s+/g, " ");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.body.removeAttribute("data-realm-open");
});
afterEach(cleanup);

describe("the portal and the app chrome", () => {
  it("marks the body while the world is open and clears it on the way out", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const view = render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(document.body).toHaveAttribute("data-realm-open", "true");
    view.unmount();
    expect(document.body).not.toHaveAttribute("data-realm-open");
  });

  it("suppresses a parent's floating dock by rule, without unmounting it", async () => {
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "school_hours" });
    render(
      <>
        <SwitchHero isChildView={false} />
        <RealmShell bundle={bundle} childId="c1" isChildView={false} />
      </>
    );
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    // Nothing unmounts the app's chrome — the stylesheet hides it, keyed on the
    // attribute below (and, in a real browser, on `body:has(.realm-root)`).
    expect(document.querySelector(".floating-dock")).not.toBeNull();
    expect(document.body).toHaveAttribute("data-realm-open", "true");
  });

  it("raises the portal and hides the three floating chrome nodes, both ways", () => {
    // The whole rule, not a prefix: `--realm-touch` is declared here and nowhere else,
    // so a replacement that dropped it would leave every 56px control over the world
    // with no minimum size, and a prefix match would not notice.
    expect(GLOBALS_CSS).toContain(
      ".realm-root { position: fixed; inset: 0; z-index: 60; background: #0a1220; --realm-hud-scale: 1; --realm-bar-bottom: 1.25rem; --realm-touch: 56px; }"
    );
    for (const target of [".floating-dock", ".quest-timer-popup", ".schedule-notification-popup"]) {
      expect(GLOBALS_CSS).toContain(`body:has(.realm-root) ${target},`);
      expect(GLOBALS_CSS).toContain(`body[data-realm-open] ${target}`);
    }
    expect(GLOBALS_CSS).toContain("body[data-realm-open] .schedule-notification-popup { display: none; }");
  });

  it("names the two unprompted popups so the rule can reach them", () => {
    localStorage.setItem(
      QUEST_TIMER_KEY,
      JSON.stringify({ assignmentId: "a1", startedAt: Date.now(), accumulatedMs: 0, resumedAt: Date.now() })
    );
    render(<QuestTimerPopup />);
    expect(document.querySelector(".quest-timer-popup")).not.toBeNull();
    const schedule = fs.readFileSync(path.join(__dirname, "../schedule-notification-popup.tsx"), "utf8");
    expect(schedule).toContain('className="schedule-notification-popup ');
  });
});
