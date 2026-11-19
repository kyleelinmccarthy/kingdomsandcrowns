import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/deeds", () => ({
  startDeedRun: vi.fn(),
  answerDeedQuestion: vi.fn(),
  retryDeedQuestion: vi.fn(),
  resolveDeedQuestion: vi.fn(),
  completeDeedRun: vi.fn(),
}));
vi.mock("@/lib/utils/speech", () => ({ canSpeak: () => true, speak: vi.fn(), stopSpeaking: vi.fn() }));

import { answerDeedQuestion, completeDeedRun, startDeedRun } from "@/lib/actions/deeds";
import type { BuildingOverview } from "@/lib/services/deeds";
import { GATE_BOARD_EMPTY, GateQuestBoard } from "./gate-quest-board";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { speechSynthesis: { cancel: () => void } }).speechSynthesis = { cancel: () => {} };
});

const building = (id: string, label: string, deeds: { id: string; title: string }[]): BuildingOverview => ({
  id,
  label,
  description: "",
  icon: "box",
  done: 0,
  total: 5,
  complete: false,
  stars: 0,
  maxStars: 15,
  raisedBy: null,
  raisedAt: null,
  deeds: deeds.map((d) => ({ ...d, story: "A story.", area: "math" as const, bestStars: 0 as const, crowned: false })),
});

const buildings = [
  building("well", "Village Well", [
    { id: "well-stones", title: "Count the Well Stones" },
    { id: "well-rope", title: "Measure the Rope" },
  ]),
  building("mill", "Mill", [{ id: "mill-sacks", title: "Sort the Sacks" }]),
  // A building with nothing to play is left off the board.
  building("bridge", "Bridge", []),
];

function board(onClose = () => {}, list: BuildingOverview[] = buildings, timezone?: string | null) {
  return render(
    <GateQuestBoard
      childId="demo-child-1"
      buildings={list}
      heroName="Emma"
      numerals
      profile={{ readAloud: false, untimed: true }}
      calm={false}
      timezone={timezone}
      onResult={() => {}}
      onClose={onClose}
    />,
  );
}

describe("the gate's quest board", () => {
  it("lists every building's side quests, under the villager who asks for them", () => {
    board();
    expect(screen.getByRole("dialog", { name: "Side Quests" })).toBeInTheDocument();
    for (const title of ["Count the Well Stones", "Measure the Rope", "Sort the Sacks"]) expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Talk to Old Bram" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Talk to Miller Tessa" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Talk to Carpenter Aldo" })).toBeNull();
  });

  it("tells a standing building's season in the hero's own time zone, not UTC's", async () => {
    // 15 April, 02:00 UTC: autumn in Sydney (April 15, noon there) and spring by UTC's northern clock.
    const raisedAt = Date.parse("2026-04-15T02:00:00Z") / 1000;
    const standing = [{ ...buildings[0], done: 5, complete: true, raisedBy: "Emma", raisedAt }];
    board(() => {}, standing, "Australia/Sydney");
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Talk to Old Bram" })));
    expect(screen.getByText(/Raised by Emma · Autumn 2026\./)).toBeInTheDocument();
  });

  it("opens the villager's own board, where a side quest begins, and comes back to the list", async () => {
    board();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Talk to Old Bram" })));
    expect(screen.getByRole("button", { name: "Begin Count the Well Stones" })).toBeInTheDocument();
    expect(screen.queryByText("Sort the Sacks")).toBeNull();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Goodbye" })));
    expect(screen.getByRole("button", { name: "Talk to Miller Tessa" })).toBeInTheDocument();
  });

  it("goes back to the gate", () => {
    const onClose = vi.fn();
    board(onClose);
    fireEvent.click(screen.getByRole("button", { name: "Back to the gate" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Esc closes the list", () => {
    const onClose = vi.fn();
    board(onClose);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc in a villager's board comes back to the list, not out of it", async () => {
    const onClose = vi.fn();
    board(onClose);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Talk to Old Bram" })));
    act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    expect(screen.getByRole("button", { name: "Talk to Miller Tessa" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("with nothing to play, invites instead of standing empty", () => {
    board(() => {}, []);
    expect(screen.getByText(GATE_BOARD_EMPTY)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to the gate" })).toBeInTheDocument();
  });

  it("begins a run in the gate's own context, which stays multiple choice (R-C4)", async () => {
    vi.mocked(startDeedRun).mockResolvedValue({
      runId: "run-1",
      deed: { id: "well-stones", title: "Count the Well Stones", story: "s", area: "math" as const },
      questions: [{ kind: "choice" as const, id: "q1", skillId: "add", prompt: "What is 2 + 3?", view: { choices: ["4", "5"] } }],
      responses: [null],
      kind: "deed" as const,
      pending: null,
    });
    board();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Talk to Old Bram" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    expect(startDeedRun).toHaveBeenCalledTimes(1);
    expect(startDeedRun).toHaveBeenCalledWith("demo-child-1", "well-stones", "gate");
  });

  it("a finished run's card goes back to the side quests, and says so", async () => {
    vi.mocked(startDeedRun).mockResolvedValue({
      runId: "run-1",
      deed: { id: "well-stones", title: "Count the Well Stones", story: "s", area: "math" as const },
      questions: [{ kind: "choice" as const, id: "q1", skillId: "add", prompt: "What is 2 + 3?", view: { choices: ["4", "5"] } }],
      responses: [null],
      kind: "deed" as const,
      pending: null,
    });
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
    vi.mocked(completeDeedRun).mockResolvedValue({
      correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 3, previousBest: 0, deedBest: 3, counted: true, crowned: false, kind: "deed",
      building: { label: "Village Well", done: 1, total: 5, complete: false, stars: 3, maxStars: 6, practice: false }, minutesEarned: 3, sideQuestPayFull: false,
    });
    board();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Talk to Old Bram" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "5" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
    expect(screen.queryByRole("button", { name: /Back to the Realm/ })).toBeNull();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /Back to the side quests/ })));
    expect(screen.getByRole("button", { name: "Talk to Miller Tessa" })).toBeInTheDocument();
  });
});
