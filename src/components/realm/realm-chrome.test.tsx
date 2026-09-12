import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { RealmShell } from "./realm-shell";
import { QuestTimerPopup } from "@/components/quest-timer-popup";
import { ScheduleNotificationPopup } from "@/components/schedule-notification-popup";
import { ParentAlertPopup } from "@/components/parent-alerts";
import { SwitchHero } from "@/components/switch-hero";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";
import type { ParentAlert } from "@/lib/actions/parent-alerts";

// A minimal double, not the real polling context: rendering `ParentAlertPopup` for real
// would need its toast to arrive *after* mount (the component snapshots whatever is
// already waiting at mount as "not a toast" — see parent-alerts.tsx), which a live
// provider makes needlessly hard to drive from a test. `mockParentAlerts` is reset to
// `[]` in `beforeEach`, and each test overwrites it before its own `render`/`rerender`.
let mockParentAlerts: ParentAlert[] = [];
vi.mock("@/components/parent-alerts-context", () => ({
  useParentAlerts: () => ({ alerts: mockParentAlerts, busy: false, dismiss: vi.fn(), dismissAll: vi.fn() }),
}));

// `ScheduleNotificationPopup` fetches its own data and only checks for a crossing once
// per `POLL_MS` interval, so rendering it with a toast showing needs both the school-day
// lookups mocked out and `findBoundaryCrossings` made to report one, then a fake-timer
// tick to run the interval that reads it.
vi.mock("@/lib/actions/student-schedule", () => ({
  getSchoolDays: vi.fn().mockResolvedValue([]),
  getScheduleBlocks: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/actions/subjects", () => ({ getSubjects: vi.fn().mockResolvedValue([]) }));
const findBoundaryCrossings = vi.fn().mockReturnValue([]);
vi.mock("@/lib/utils/schedule-notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils/schedule-notifications")>();
  return { ...actual, findBoundaryCrossings: (...a: Parameters<typeof actual.findBoundaryCrossings>) => findBoundaryCrossings(...a) };
});

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/realm",
}));
// The hand-off dialog's contents are not what this file is about, and mounting
// them would try to fetch the family's heroes over the network.
vi.mock("@/components/hero-login", () => ({ HeroLogin: () => <div /> }));
const getAssignmentQuestInfo = vi.fn();
vi.mock("@/lib/actions/quest-assignments", () => ({
  completeAssignment: vi.fn(),
  getAssignmentQuestInfo: (...a: unknown[]) => getAssignmentQuestInfo(...a),
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
  tutorialStep: 0,
};

const QUEST_TIMER_KEY = "kingdomsandcrowns:quest-timer";
const STOPPED_TIMER_KEY = "kingdomsandcrowns:quest-timer:stopped";
// jsdom does not evaluate `:has()` and vitest never loads the app's stylesheet,
// so the cascade half of this design is asserted against the stylesheet's text
// and the behavioural half against the attribute the rule's fallback reads.
const GLOBALS_CSS = fs.readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8").replace(/\s+/g, " ");

/** The one rule whose selector list starts with `head`, split into its selectors and its declarations. */
function ruleAt(head: string): { selectors: string[]; declarations: string[] } {
  const at = GLOBALS_CSS.indexOf(head);
  expect(at, `no rule in globals.css starting \`${head}\``).toBeGreaterThan(-1);
  const open = GLOBALS_CSS.indexOf("{", at);
  const close = GLOBALS_CSS.indexOf("}", open);
  return {
    selectors: GLOBALS_CSS.slice(at, open).split(",").map((sel) => sel.trim()).filter(Boolean),
    declarations: GLOBALS_CSS.slice(open + 1, close).split(";").map((d) => d.trim()).filter(Boolean),
  };
}
/** The declarations of a rule matched on its exact whole selector. */
function declarationsOf(selector: string): string[] {
  return ruleAt(`${selector} {`).declarations;
}

beforeEach(() => {
  vi.clearAllMocks();
  findBoundaryCrossings.mockReturnValue([]);
  mockParentAlerts = [];
  localStorage.clear();
  document.body.removeAttribute("data-realm-open");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

  it("raises the portal and hides the four floating chrome nodes, both ways", () => {
    // Declaration by declaration, not one full-rule string match: jsdom cannot evaluate
    // `:has()`, so this has to read the source — but nothing here should care what ORDER
    // the declarations are written in, or whether the selector list happens to end in a
    // comma. Each claim is asserted on its own, so a reformat with no behaviour change
    // leaves the test alone and a dropped declaration still fails it.
    const root = declarationsOf(".realm-root");
    // `--realm-touch` is declared here and nowhere else: drop it and every 56px control
    // over the world silently loses its minimum size.
    expect(root).toContain("--realm-touch: 56px");
    expect(root).toContain("--realm-hud-scale: 1");
    expect(root).toContain("--realm-bar-bottom: 1.25rem");
    // The portal out-ranks the app's chrome; nothing else in the Realm re-ranks itself.
    expect(root).toContain("z-index: 60");
    expect(root).toContain("position: fixed");

    // Four names, not the brief's original three: the parent-alert toast has no
    // auto-dismiss (parent-alerts.tsx), so left unhidden at z-60 it would sit under the
    // portal, unseen, but still in the DOM and the tab order, accumulating.
    const hide = ruleAt("body:has(.realm-root) .floating-dock");
    for (const target of [".floating-dock", ".quest-timer-popup", ".schedule-notification-popup", ".parent-alert-popup"]) {
      expect(hide.selectors).toContain(`body:has(.realm-root) ${target}`);
      expect(hide.selectors).toContain(`body[data-realm-open] ${target}`);
    }
    expect(hide.declarations).toContain("display: none");
  });

  it("renders the quest-timer popup with its own class name", () => {
    localStorage.setItem(
      QUEST_TIMER_KEY,
      JSON.stringify({ assignmentId: "a1", startedAt: Date.now(), accumulatedMs: 0, resumedAt: Date.now() })
    );
    render(<QuestTimerPopup />);
    expect(document.querySelector(".quest-timer-popup")).not.toBeNull();
  });

  it("renders the schedule-notification popup with its own class name", async () => {
    // A source-text grep here would pass even if the class moved into a comment or a
    // nested div; rendering the real toast and reading the DOM is what the rule
    // actually needs to be true.
    findBoundaryCrossings.mockReturnValue([
      { block: { id: "b1", subjectId: "s1", dayOfWeek: "monday", startTime: "09:00", endTime: "09:30" }, kind: "start" },
    ]);
    vi.useFakeTimers();
    const { container } = render(<ScheduleNotificationPopup childId="c1" />);
    // Let the mocked schedule/subject lookups resolve before the poll interval fires.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(container.firstElementChild).toHaveClass("schedule-notification-popup");
  });

  it("renders the parent-alert popup with its own class name", () => {
    // The toast only shows alerts that arrive *after* mount (see the comment on the
    // mock above), so the first render is empty and the alert is added on a rerender.
    mockParentAlerts = [];
    const { rerender, container } = render(<ParentAlertPopup />);
    mockParentAlerts = [
      { id: "a1", type: "quest_stuck", childId: "c1", childName: "Lily", questTitle: "Long division", subjectName: "Math", date: "2026-09-12", note: null, createdAt: new Date().toISOString() },
    ];
    rerender(<ParentAlertPopup />);
    expect(container.firstElementChild).toHaveClass("parent-alert-popup");
  });
});

describe("the re-admitted quest timer", () => {
  it("renders as a chip in the HUD's meta zone with the running quest's elapsed time", async () => {
    const now = Date.now();
    localStorage.setItem(
      QUEST_TIMER_KEY,
      JSON.stringify({ assignmentId: "a1", startedAt: now - 42_000, accumulatedMs: 42_000, resumedAt: now })
    );
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    // `getByRole` — not `getByLabelText` — because ARIA prohibits naming a roleless
    // `<span>` (role=generic): without `role="img"` a real screen reader announces only
    // "00:42", never "Quest timer". `getByLabelText` alone doesn't enforce that.
    const chip = screen.getByRole("img", { name: "Quest timer: 00:42" });
    expect(chip).toHaveClass("realm-hud-chip");
    const meta = document.querySelector(".realm-hud-meta");
    expect(meta).not.toBeNull();
    expect(meta!.contains(chip)).toBe(true);
  });

  it("shows nothing when no quest timer is running", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Quest timer/)).not.toBeInTheDocument();
  });

  it("says so when the timer is paused", async () => {
    localStorage.setItem(
      QUEST_TIMER_KEY,
      JSON.stringify({ assignmentId: "a1", startedAt: Date.now() - 90_000, accumulatedMs: 90_000, resumedAt: Date.now() - 90_000, pausedAt: Date.now() })
    );
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.getByLabelText("Quest timer paused: 01:30")).toHaveTextContent("01:30");
  });
});

describe("a quest timer that ran out", () => {
  it("names the subject in the problem lane and hands the child the way out", async () => {
    // The popup that would normally ask "complete or discard?" is display:none while the
    // portal is up, so this is the only thing that tells a child their chore ended.
    getAssignmentQuestInfo.mockResolvedValue({ title: "Long division", requireNotes: false, subjectName: "Math" });
    localStorage.setItem(
      STOPPED_TIMER_KEY,
      JSON.stringify({ assignmentId: "a1", startedAt: Date.now() - 600_000, endedAt: Date.now(), durationMinutes: 10 })
    );
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("realm-problem")).toHaveTextContent("Your Math timer finished."));
    fireEvent.click(screen.getByRole("button", { name: "Go to it →" }));
    expect(routerPush).toHaveBeenCalledWith("/quests");
    // Consumed on the way out, so the sentence cannot greet the child again next visit.
    await waitFor(() => expect(localStorage.getItem(STOPPED_TIMER_KEY)).toBeNull());
  });

  it("says nothing at all when no timer has stopped", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    expect(screen.queryByText(/timer finished\./)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go to it →" })).not.toBeInTheDocument();
    expect(getAssignmentQuestInfo).not.toHaveBeenCalled();
  });

  it("keeps a finished timer's sentence out of a parent's preview — the intro holds the lane instead", async () => {
    // The shared-device hand-off means a child's stopped timer sits in the same
    // localStorage a parent's preview then reads. This sentence, with a button that
    // navigates the viewer away, has no business replacing the preview's own intro.
    getAssignmentQuestInfo.mockResolvedValue({ title: "Long division", requireNotes: false, subjectName: "Math" });
    localStorage.setItem(
      STOPPED_TIMER_KEY,
      JSON.stringify({ assignmentId: "a1", startedAt: Date.now() - 600_000, endedAt: Date.now(), durationMinutes: 10 })
    );
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "school_hours" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={false} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("realm-problem")).toHaveTextContent(/You're looking at Lily's grounds/));
    expect(screen.queryByText(/timer finished\./)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go to it →" })).not.toBeInTheDocument();
  });

  it("lets the one-minute banner reclaim the lane from a finished quest timer", async () => {
    // The "complete or discard?" card that would normally clear a finished timer's
    // message is display:none behind the portal, so without this the message would
    // never yield — a child who ignores "Go to it →" would never see the one-minute
    // warning before the gate closes on them.
    getAssignmentQuestInfo.mockResolvedValue({ title: "Long division", requireNotes: false, subjectName: "Math" });
    localStorage.setItem(
      STOPPED_TIMER_KEY,
      JSON.stringify({ assignmentId: "a1", startedAt: Date.now() - 600_000, endedAt: Date.now(), durationMinutes: 10 })
    );
    // `minutesRemaining: 1` makes the real play clock warn on its very first tick —
    // the actual mechanism a child would hit, not a stand-in for it.
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 1, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await waitFor(
      () => expect(screen.getByTestId("realm-problem")).toHaveTextContent("One minute left in the Realm today."),
      { timeout: 3000 }
    );
    expect(screen.queryByText(/timer finished\./)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go to it →" })).not.toBeInTheDocument();
  });
});

describe("the hero switcher", () => {
  it("leaves a child's world outright, and stays put everywhere else", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(
      <>
        <SwitchHero isChildView={true} />
        <RealmShell bundle={bundle} childId="c1" isChildView={true} />
      </>
    );
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: /Leave \(switch hero\)/ })).not.toBeInTheDocument());
    cleanup();
    // Off the Realm the pill is exactly as it was: the only way to hand the device back.
    render(<SwitchHero isChildView={true} />);
    expect(screen.getByRole("button", { name: /Leave \(switch hero\)/ })).toBeInTheDocument();
  });

  it("sits in the preview header row for a parent, not in a floating dock", async () => {
    getRealmAccess.mockResolvedValue({ allowed: false, reason: "school_hours" });
    render(
      <RealmShell
        bundle={bundle}
        childId="c1"
        isChildView={false}
        selector={<SwitchHero isChildView={false} inline />}
      />
    );
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    const control = screen.getByRole("button", { name: "Play as a hero" });
    expect(control).not.toHaveClass("floating-dock");
    expect(document.querySelector(".floating-dock")).toBeNull();
    const meta = document.querySelector(".realm-hud-meta");
    expect(meta).not.toBeNull();
    expect(meta!.contains(control)).toBe(true);
  });
});
