import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import type { RecessBus } from "@/lib/realm3d/recess/bus";
import type { RecessEvent } from "@/lib/realm3d/recess/sim";
import { COURSE_ID } from "@/lib/realm3d/recess/course";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";
import { emptyRecessRecord } from "@/lib/realm/recess/record";

/**
 * RECESS, through the composition root with the canvas stubbed (it imports `three`): the two doors
 * (the schedule, and the arch), the boards, the words, what is written and who writes it, and the
 * clock that runs out at the end of a recess block saying recess is over.
 */
const handed: { bus?: HudBus; props?: Record<string, unknown> } = {};
vi.mock("next/dynamic", () => ({
  default: () =>
    function Dynamic(props: Record<string, unknown>) {
      if (props.layout) {
        handed.bus = props.bus as HudBus;
        handed.props = props;
      }
      return <div data-testid="canvas" />;
    },
}));
vi.mock("@/lib/actions/realm-settings", () => ({
  setRealmDepth: vi.fn(async () => {}),
  updateRealmSettings: vi.fn(async () => {}),
  setTutorialStep: vi.fn(async () => {}),
  markRealmHelpSeen: vi.fn(async () => {}),
}));
vi.mock("@/lib/actions/realm-sound", () => ({ saveRealmSound: vi.fn(async () => {}) }));
vi.mock("@/lib/actions/deeds", () => ({ startDeedRun: vi.fn(), answerDeedQuestion: vi.fn(), completeDeedRun: vi.fn() }));
vi.mock("@/lib/actions/seasons", () => ({ markCeremonySeen: vi.fn(async () => {}) }));
vi.mock("@/lib/actions/spells", () => ({ getSpellbook: vi.fn(async () => ({ spells: [], slots: 4, level: 3, unlocked: [], schoolCounts: {}, subjectNamesBySchool: {} })) }));
vi.mock("@/lib/actions/realm", () => ({ getRealmKingdom: vi.fn() }));
vi.mock("@/lib/actions/quest-assignments", () => ({ getAssignmentQuestInfo: vi.fn(async () => null) }));
vi.mock("@/lib/actions/realm-play", () => ({
  getRealmAccess: vi.fn(async () => ({ allowed: true, minutesRemaining: 30, source: "recess" })),
  recordRealmPlay: vi.fn(async () => {}),
  getTroubleBounty: vi.fn(async () => ({ enabled: true, capMinutes: 5, subCapMinutes: 5, paidMinutes: 0, remainingMinutes: 5, clearsToday: 0, paidHomes: [] })),
  recordTroubleClears: vi.fn(),
}));
vi.mock("@/lib/actions/realm-places", () => ({ recordPlacesFound: vi.fn(async () => []) }));
vi.mock("@/lib/actions/realm-recess", () => ({
  recordRecessResult: vi.fn(async (_c: string, r: { gleams: number; lapMs: number | null; mounted: boolean; courseId: string }) => {
    const { mergeRecess, emptyRecessRecord: empty } = await import("@/lib/realm/recess/record");
    return mergeRecess(empty(r.courseId), r, new Date());
  }),
  getRecessRecord: vi.fn(),
}));
vi.mock("@/lib/realm3d/worldgen", async (orig) => {
  const real = await orig<typeof import("@/lib/realm3d/worldgen")>();
  const world = { seed: 1, landmarks: [], roads: [], biomeAt: () => "meadow", heightAt: () => 0 };
  return { ...real, realmWorld: () => world };
});

import { recordRecessResult } from "@/lib/actions/realm-recess";
import { getRealmAccess } from "@/lib/actions/realm-play";
import { RealmGame, type RealmData } from "./realm-game";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.clearAllMocks();
});

const realm: RealmData = {
  childId: "c1",
  isChildView: true,
  kingdom: { tone: "gentle", buildings: [] },
  castleType: "campsite",
  banners: 0,
  profile: DEFAULT_LEARNING_PROFILE,
  depth: "full",
  toneMode: "gentle",
  recess: { ...emptyRecessRecord(COURSE_ID), totalGleams: 12, laps: 3, bestLapMs: 38400 },
};

function mount(over: Partial<React.ComponentProps<typeof RealmGame>> = {}) {
  render(<RealmGame heroName="Emma" realm={realm} entry={{ minutes: 30, visit: null, source: "earned" }} castleUnlocked={false} {...over} />);
  return { bus: handed.bus!, recess: handed.props!.recess as RecessBus };
}

/** What the scene hands over as a frame's event (it is pooled there; a fresh one here). */
const ev = (kind: RecessEvent["kind"], n = 0, lapMs = 0, mounted = false): RecessEvent => ({ kind, n, lapMs, mounted });
const arch = { kind: "arch" as const, id: "ring", label: "the Ring", verb: "Run" };

describe("the arch: the Ring any time the Realm is open", () => {
  it("hands the canvas a recess bus that may run for the hero's own visit", () => {
    const { recess } = mount();
    expect(recess.runs).toBe(true);
    expect(recess.course.posts).toHaveLength(8);
  });

  it("E at the arch opens the Ring's board with the stored record, and Run starts a run with its start board", async () => {
    const { bus, recess } = mount();
    act(() => bus.onNear(arch));
    expect(screen.getByRole("button", { name: /Run the Ring/ })).toBeInTheDocument();
    act(() => bus.onInteract(arch));
    const board = screen.getByRole("dialog", { name: "The Ring" });
    expect(board).toHaveTextContent("Gleams collected12");
    expect(board).toHaveTextContent("Best lap on foot38.4 s");
    fireEvent.click(screen.getByRole("button", { name: "Run the Ring" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(recess.want).toBe("arch"));
    expect(screen.getByText("Collect gleams. Follow the lit posts. Your best lap is 38.4 s.")).toBeInTheDocument();
    // The run strip: the arch comes first, and the best to beat.
    expect(screen.getByText("Run through the arch to start")).toBeInTheDocument();
    expect(screen.getByText("Best 38.4 s")).toBeInTheDocument();
    // Mid-run, the arch is the finish line: no prompt there.
    act(() => bus.onNear(arch));
    expect(screen.queryByRole("button", { name: /Run the Ring/ })).not.toBeInTheDocument();
  });
});

describe("a run, as the scene reports it", () => {
  async function running() {
    const m = mount();
    act(() => m.bus.onInteract(arch));
    fireEvent.click(screen.getByRole("button", { name: "Run the Ring" }));
    await waitFor(() => expect(m.recess.want).toBe("arch"));
    return m;
  }

  it("says a gleam at full depth with its count, lights the next post, and buffers gleams until the lap", async () => {
    const { recess } = await running();
    act(() => recess.onEvent(ev("started")));
    act(() => recess.onEvent(ev("gleam", 1)));
    expect(screen.getByText("A gleam! 1 so far.")).toBeInTheDocument();
    act(() => recess.onEvent(ev("post", 0)));
    expect(screen.getByText("Next: the Ringstones")).toBeInTheDocument();
    expect(recordRecessResult).not.toHaveBeenCalled();
  });

  it("closes a lap with the finish board and writes the lap through at once, carrying the gleams", async () => {
    const { recess } = await running();
    act(() => recess.onEvent(ev("started")));
    act(() => recess.onEvent(ev("gleam", 1)));
    act(() => recess.onEvent(ev("gleam", 2)));
    act(() => recess.onEvent(ev("lap", 1, 36200, false)));
    expect(screen.getByText("New best lap — 36.2 s!")).toBeInTheDocument();
    await waitFor(() => expect(recordRecessResult).toHaveBeenCalledWith("c1", { gleams: 2, lapMs: 36200, mounted: false, courseId: COURSE_ID }));
  });

  it("a slower lap is not a best, and a ridden lap is measured against the ride record", async () => {
    const { recess } = await running();
    act(() => recess.onEvent(ev("lap", 1, 41200, false)));
    expect(screen.getByText("Lap done — 41.2 s. Your best is 38.4 s.")).toBeInTheDocument();
    act(() => recess.onEvent(ev("lap", 2, 24100, true)));
    expect(screen.getByText("Your first ride — 24.1 s. That's the one to beat.")).toBeInTheDocument();
  });

  it("an impossibly fast lap is said so, and never written", async () => {
    const { recess } = await running();
    act(() => recess.onEvent(ev("lap", 1, 3000, true)));
    expect(screen.getByText("That lap was too fast to write down. Try it again.")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(recordRecessResult).not.toHaveBeenCalled();
  });

  it("fast travel mid-lap: the lap does not count", async () => {
    const { recess } = await running();
    act(() => recess.onEvent(ev("voided")));
    expect(screen.getByText("You took the fast road, so this lap doesn't count. Start again at the arch.")).toBeInTheDocument();
  });

  it("the nudge, when the child reaches a post that is not the lit one", async () => {
    const { recess } = await running();
    act(() => recess.onEvent(ev("offCourse", 3)));
    expect(screen.getByText("Follow the lit posts.")).toBeInTheDocument();
  });

  it("simple depth draws instead of counting: no digits in the gleam line or the lap board", async () => {
    const { bus, recess } = mount({ realm: { ...realm, depth: "simple" } });
    act(() => bus.onInteract(arch));
    fireEvent.click(screen.getByRole("button", { name: "Run the Ring" }));
    await waitFor(() => expect(recess.want).toBe("arch"));
    act(() => recess.onEvent(ev("gleam", 4)));
    expect(screen.getByText("A gleam!")).toBeInTheDocument();
    act(() => recess.onEvent(ev("lap", 1, 36200, false)));
    expect(screen.getByText("A new best!")).toBeInTheDocument();
    expect(document.querySelector(".r3-recess-time")).toBeNull();
  });
});

describe("recess by the schedule", () => {
  it("opens with the bell's board and a run, when the gate says recess", async () => {
    const { recess } = mount({ entry: { minutes: 20, visit: null, source: "recess" } });
    await waitFor(() => expect(recess.want).toBe("recess"));
    expect(screen.getByText("Recess!")).toBeInTheDocument();
    expect(screen.getByText("Collect gleams, then run through the arch and follow the lit posts. Your best lap is 38.4 s.")).toBeInTheDocument();
    expect(screen.getByText("Recess · 20 min left")).toBeInTheDocument();
  });

  it("when the recess block runs out, the Realm closes saying recess is over, not that minutes ran out", async () => {
    vi.useFakeTimers();
    // The minute is written, and the gate, asked again, has no recess minutes left.
    vi.mocked(getRealmAccess).mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "recess" });
    const onClose = vi.fn();
    render(<RealmGame heroName="Emma" realm={realm} entry={{ minutes: 1, visit: null, source: "recess" }} castleUnlocked={false} onClose={onClose} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(onClose).toHaveBeenCalledWith("outside_recess");
  });

  it("when recess ends and the Realm stays open (open or both), the run stops and the child is told", async () => {
    vi.useFakeTimers();
    vi.mocked(getRealmAccess).mockResolvedValue({ allowed: true, minutesRemaining: 200, source: "open" });
    render(<RealmGame heroName="Emma" realm={realm} entry={{ minutes: 30, visit: null, source: "recess" }} castleUnlocked={false} />);
    const recess = handed.props!.recess as RecessBus;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(recess.want).toBe("recess");
    recess.want = null; // the scene ate it
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(recess.want).toBe("stop");
    expect(screen.getByText("Recess is over. Your gleams are kept.")).toBeInTheDocument();
    expect(screen.queryByText("Run through the arch to start")).not.toBeInTheDocument();
  });

  it("says the last minute is recess's", async () => {
    vi.useFakeTimers();
    render(<RealmGame heroName="Emma" realm={realm} entry={{ minutes: 1, visit: null, source: "recess" }} castleUnlocked={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByText("One minute left of recess.")).toBeInTheDocument();
  });
});

describe("a visiting grown-up", () => {
  it("sees the child's laps at the arch, runs nothing and writes nothing", async () => {
    const { bus, recess } = mount({ viewer: "parent", realm: { ...realm, isChildView: false }, entry: { minutes: 0, visit: { minutes: 30, closedBecause: null }, source: null } });
    expect(recess.runs).toBe(false);
    act(() => bus.onNear(arch));
    expect(screen.getByRole("button", { name: /See Emma's laps/ })).toBeInTheDocument();
    act(() => bus.onInteract(arch));
    const board = screen.getByRole("dialog", { name: "The Ring" });
    expect(board).toHaveTextContent("Emma's Ring");
    expect(board).toHaveTextContent("Emma runs the Ring here.");
    expect(screen.queryByRole("button", { name: "Run the Ring" })).not.toBeInTheDocument();
    // Even a scene event could not make it write.
    act(() => recess.onEvent(ev("lap", 1, 36200, false)));
    await new Promise((r) => setTimeout(r, 20));
    expect(recordRecessResult).not.toHaveBeenCalled();
  });
});
