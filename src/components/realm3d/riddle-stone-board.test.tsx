import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/deeds", () => ({
  startDeedRun: vi.fn(),
  answerDeedQuestion: vi.fn(),
  retryDeedQuestion: vi.fn(),
  resolveDeedQuestion: vi.fn(),
  completeDeedRun: vi.fn(),
}));
vi.mock("@/lib/actions/review", () => ({ startReviewRun: vi.fn(), getReviewDue: vi.fn() }));
vi.mock("@/lib/utils/speech", () => ({ canSpeak: () => false, speak: vi.fn(), stopSpeaking: vi.fn() }));

import { answerDeedQuestion, completeDeedRun } from "@/lib/actions/deeds";
import { getReviewDue, startReviewRun } from "@/lib/actions/review";
import { HERO_ONLY } from "@/lib/utils/deed-refusals";
import { RIDDLE_QUIET, RiddleStoneBoard } from "./riddle-stone-board";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { speechSynthesis: { cancel: () => void } }).speechSynthesis = { cancel: () => {} };
});

const run = {
  runId: "review-1",
  deed: { id: "review:longwater", title: "Longwater riddle stone", story: "Three riddles from things you have learned.", area: null },
  questions: [{ kind: "choice" as const, id: "q1", skillId: "add", prompt: "What is 2 + 3?", view: { choices: ["4", "5"] } }],
  responses: [null] as (string | null)[],
  kind: "review" as const,
  pending: null,
};
const summary = {
  correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 0 as const, previousBest: 0 as const, deedBest: 0 as const,
  counted: false, crowned: false, kind: "review" as const, building: null, minutesEarned: 0, sideQuestPayFull: false,
};

function board(over: Partial<React.ComponentProps<typeof RiddleStoneBoard>> = {}) {
  return render(
    <RiddleStoneBoard
      childId="c1"
      placeId="longwater"
      viewer="child"
      numerals
      profile={{ readAloud: false, untimed: true }}
      calm={false}
      onDue={() => {}}
      onClose={() => {}}
      {...over}
    />,
  );
}

describe("the riddle stone board", () => {
  it("starts a review at this stone and plays it through the deed board's run, with no building and no minutes", async () => {
    vi.mocked(startReviewRun).mockResolvedValue(run);
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
    vi.mocked(completeDeedRun).mockResolvedValue(summary);
    vi.mocked(getReviewDue).mockResolvedValue(false);
    const onDue = vi.fn();
    await act(async () => void board({ onDue }));
    expect(startReviewRun).toHaveBeenCalledWith("c1", { kind: "stone", placeId: "longwater" });
    expect(screen.getByRole("heading", { name: "Longwater riddle stone" })).toBeInTheDocument();
    expect(screen.getByText("What is 2 + 3?")).toBeInTheDocument();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "5" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish review" })));
    expect(completeDeedRun).toHaveBeenCalledWith("review-1");
    expect(screen.getByText("Review done!")).toBeInTheDocument();
    expect(screen.getByText("Reviewed 1 · 1 right")).toBeInTheDocument();
    expect(screen.queryByText(/earned|raised|of 5/)).not.toBeInTheDocument();
    // The stones' glow follows what is due now.
    expect(getReviewDue).toHaveBeenCalledWith("c1");
    expect(onDue).toHaveBeenCalledWith(false);
  });

  it("says the stone is quiet when there is nothing to review", async () => {
    vi.mocked(startReviewRun).mockResolvedValue({ empty: true });
    const onClose = vi.fn();
    await act(async () => void board({ onClose }));
    expect(screen.getByText("The stone is quiet today. Come back after a side quest or two.")).toBeInTheDocument();
    expect(RIDDLE_QUIET).toBe("The stone is quiet today. Come back after a side quest or two.");
    expect(screen.getByRole("heading", { name: "Longwater riddle stone" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to the Realm" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("starts nothing for a visiting grown-up, and says why", async () => {
    await act(async () => void board({ viewer: "parent" }));
    expect(startReviewRun).not.toHaveBeenCalled();
    expect(screen.getByText(HERO_ONLY)).toBeInTheDocument();
  });

  it("says a refused start plainly, and tries again on request", async () => {
    vi.mocked(startReviewRun).mockRejectedValueOnce(new Error(HERO_ONLY)).mockResolvedValueOnce({ empty: true });
    await act(async () => void board());
    expect(screen.getByRole("alert")).toHaveTextContent(HERO_ONLY);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(startReviewRun).toHaveBeenCalledTimes(2);
    expect(screen.getByText(RIDDLE_QUIET)).toBeInTheDocument();
  });
});
