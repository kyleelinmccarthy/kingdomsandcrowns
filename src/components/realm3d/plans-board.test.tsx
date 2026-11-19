import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/deeds", () => ({
  startDeedRun: vi.fn(),
  answerDeedQuestion: vi.fn(),
  retryDeedQuestion: vi.fn(),
  resolveDeedQuestion: vi.fn(),
  completeDeedRun: vi.fn(),
}));
vi.mock("@/lib/actions/improvements", () => ({ startBuildRun: vi.fn(), pinPlan: vi.fn() }));
vi.mock("@/lib/utils/speech", () => ({ canSpeak: () => false, speak: vi.fn(), stopSpeaking: vi.fn() }));

import { answerDeedQuestion, completeDeedRun } from "@/lib/actions/deeds";
import { pinPlan, startBuildRun } from "@/lib/actions/improvements";
import { EMPTY_WORKS, type Works } from "@/lib/realm/works-state";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import { BUILD_HERO_ONLY, PIN_HERO_ONLY } from "@/lib/utils/deed-refusals";
import { PlansBoard } from "./plans-board";
import { useWorks } from "./use-works";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { speechSynthesis: { cancel: () => void } }).speechSynthesis = { cancel: () => {} };
});

/** Enough dye and thread for the Banners' first level (4 and 2), nothing else. */
const WORKS: Works = { ...EMPTY_WORKS, balance: { ...EMPTY_WORKS.balance, dye: 4, thread: 2 }, built: { "village-lamps": 3 } };
const NONE: ReadonlySet<string> = new Set();

const run: RunStart = {
  runId: "build-1",
  deed: { id: "build:village-banners:1", title: "Banners", story: "Aldo has the plans ready. Measure true and it will stand.", area: "math" },
  questions: [{ kind: "choice" as const, id: "q1", skillId: "add", prompt: "What is 2 + 3?", view: { choices: ["4", "5"] } }],
  responses: [null],
  kind: "build",
  pending: null,
  plan: { improvementId: "village-banners", level: 1, placed: 0 },
};
const balanceAfter = { ...EMPTY_WORKS.balance };
const summary = (improvement: NonNullable<RunSummary["improvement"]>): RunSummary => ({
  correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 3, previousBest: 0, deedBest: 0,
  counted: false, crowned: false, kind: "build", building: null, minutesEarned: 0, sideQuestPayFull: false, improvement,
});
const BUILT = { id: "village-banners" as const, label: "Banners", level: 1, built: true, balance: balanceAfter, plaque: { improvementId: "village-banners" as const, level: 1, label: "Banners", builtBy: "Emma", season: "Autumn 2026", sources: [], stars: 3 } };

/** The board as the frame holds it: the works live above it, in `useWorks`, and the board reads them back. */
function Harness({ readOnly = false, works = WORKS, onClose = () => {} }: { readOnly?: boolean; works?: Works; onClose?: () => void }) {
  const w = useWorks(works);
  return (
    <PlansBoard
      childId="c1"
      works={w.works}
      raised={NONE}
      readOnly={readOnly}
      numerals
      profile={{ readAloud: false, untimed: true }}
      calm={false}
      onPinned={w.setPinned}
      onBuilt={w.applyBuildResult}
      onClose={onClose}
    />
  );
}

const row = (name: string) => screen.getByRole("listitem", { name });

async function playTheRun() {
  vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
  await act(async () => void fireEvent.click(within(row("Banners")).getByRole("button", { name: "Build" })));
  expect(startBuildRun).toHaveBeenCalledWith("c1", "village-banners");
  expect(screen.getByText("What is 2 + 3?")).toBeInTheDocument();
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "5" })));
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish building" })));
  expect(completeDeedRun).toHaveBeenCalledWith("build-1");
}

describe("the plans board", () => {
  it("lists every plan with its level, what it waits on, and what it costs", () => {
    render(<Harness />);
    expect(screen.getByRole("dialog", { name: "Kingdom plans" })).toBeInTheDocument();
    const banners = row("Banners");
    expect(banners).toHaveTextContent("Level 1 of 3");
    expect(banners).toHaveTextContent("Ready to build");
    expect(within(banners).getByTitle("4 Dye")).toBeInTheDocument();
    expect(within(banners).getByTitle("2 Thread")).toBeInTheDocument();
    // A building's wing names its building, and waits for it.
    const wellHouse = row("Well House");
    expect(wellHouse).toHaveTextContent("Village Well");
    expect(wellHouse).toHaveTextContent("Raise the Village Well first");
    expect(within(wellHouse).queryByRole("button", { name: "Build" })).toBeNull();
    // Short of materials: what is missing, in the plan's own words.
    expect(row("Fountain")).toHaveTextContent("Needs 4 more Stone and 2 more Herbs");
    // Every level stands.
    expect(row("Lamps")).toHaveTextContent("Built");
    expect(within(row("Lamps")).queryByText("Level 3 of 3")).toBeNull();
    // Ready plans come first.
    expect(screen.getAllByRole("listitem")[0]).toBe(banners);
  });

  it("pins one plan at a time, and unpins it", async () => {
    vi.mocked(pinPlan).mockResolvedValue(undefined);
    render(<Harness />);
    const pin = within(row("Fountain")).getByRole("button", { name: "Pin" });
    expect(pin).toHaveAttribute("aria-pressed", "false");
    await act(async () => void fireEvent.click(pin));
    expect(pinPlan).toHaveBeenCalledWith("c1", "village-fountain");
    expect(within(row("Fountain")).getByRole("button", { name: "Pinned" })).toHaveAttribute("aria-pressed", "true");

    await act(async () => void fireEvent.click(within(row("Banners")).getByRole("button", { name: "Pin" })));
    expect(pinPlan).toHaveBeenLastCalledWith("c1", "village-banners");
    expect(screen.getAllByRole("button", { name: "Pinned" })).toHaveLength(1);
    expect(within(row("Fountain")).getByRole("button", { name: "Pin" })).toHaveAttribute("aria-pressed", "false");

    await act(async () => void fireEvent.click(within(row("Banners")).getByRole("button", { name: "Pinned" })));
    expect(pinPlan).toHaveBeenLastCalledWith("c1", null);
    expect(screen.queryByRole("button", { name: "Pinned" })).toBeNull();
  });

  it("builds a ready plan as a run at the bench, then lists its next level", async () => {
    vi.mocked(startBuildRun).mockResolvedValue(run);
    vi.mocked(completeDeedRun).mockResolvedValue(summary(BUILT));
    render(<Harness />);
    await playTheRun();
    expect(screen.getByText("The Banners is built!")).toBeInTheDocument();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /Back to the plans/ })));
    // The works took the build: the next level is on offer, and the satchel is spent.
    expect(row("Banners")).toHaveTextContent("Level 2 of 3");
    expect(row("Banners")).toHaveTextContent("Needs");
  });

  it("says so when the materials were not there, and keeps the plan", async () => {
    vi.mocked(startBuildRun).mockResolvedValue(run);
    vi.mocked(completeDeedRun).mockResolvedValue(summary({ id: "village-banners", label: "Banners", level: 1, built: false, reason: "short", balance: { ...WORKS.balance, dye: 1 } }));
    render(<Harness />);
    await playTheRun();
    expect(screen.getByText("Not quite enough materials")).toBeInTheDocument();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /Back to the plans/ })));
    expect(row("Banners")).toHaveTextContent("Level 1 of 3");
    expect(row("Banners")).toHaveTextContent("Needs 3 more Dye");
  });

  it("shows a grown-up the plans, but no pin and no build", () => {
    render(<Harness readOnly works={{ ...WORKS, pinned: "village-banners" }} />);
    expect(row("Banners")).toHaveTextContent("Ready to build");
    expect(row("Banners")).toHaveTextContent("Pinned");
    expect(screen.queryByRole("button", { name: "Build" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Pin/ })).toBeNull();
    expect(screen.getByText(BUILD_HERO_ONLY)).toBeInTheDocument();
  });

  it("says what went wrong in the board, and stays open", async () => {
    vi.mocked(pinPlan).mockRejectedValue(new Error(PIN_HERO_ONLY));
    vi.mocked(startBuildRun).mockRejectedValue(new Error("the network is down"));
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await act(async () => void fireEvent.click(within(row("Banners")).getByRole("button", { name: "Pin" })));
    expect(screen.getByRole("alert")).toHaveTextContent(PIN_HERO_ONLY);
    expect(within(row("Banners")).getByRole("button", { name: "Pin" })).toHaveAttribute("aria-pressed", "false");
    await act(async () => void fireEvent.click(within(row("Banners")).getByRole("button", { name: "Build" })));
    expect(screen.getByRole("alert")).toHaveTextContent("That didn't work.");
    expect(screen.getByRole("dialog", { name: "Kingdom plans" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
