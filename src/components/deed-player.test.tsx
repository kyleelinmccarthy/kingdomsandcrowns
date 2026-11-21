import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeedPlayer } from "./deed-player";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import { speak } from "@/lib/utils/speech";

// Speech is spoken to a spy; the browser check stays the real one (jsdom cannot speak).
vi.mock("@/lib/utils/speech", async (orig) => ({ ...(await orig<typeof import("@/lib/utils/speech")>()), speak: vi.fn() }));

const answerDeedQuestion = vi.fn();
const completeDeedRun = vi.fn();
const retryDeedQuestion = vi.fn();
const resolveDeedQuestion = vi.fn();
vi.mock("@/lib/actions/deeds", () => ({
  answerDeedQuestion: (...a: unknown[]) => answerDeedQuestion(...a),
  retryDeedQuestion: (...a: unknown[]) => retryDeedQuestion(...a),
  resolveDeedQuestion: (...a: unknown[]) => resolveDeedQuestion(...a),
  completeDeedRun: (...a: unknown[]) => completeDeedRun(...a),
}));

const run: RunStart = {
  runId: "r1",
  deed: { id: "well-signs", title: "Signs for the Well", story: "Help the sign-painter.", area: "reading" },
  questions: [
    { kind: "choice" as const, id: "q1", skillId: "sight-g23", prompt: 'Which word is "because"?', view: { choices: ["because", "become", "beside", "before"] }, readAloud: "because" },
    { kind: "choice" as const, id: "q2", skillId: "sight-g23", prompt: 'Which word is "again"?', view: { choices: ["again", "against"] } },
  ],
  responses: [null, null],
  kind: "deed",
  pending: null,
};
const profile = { fewerChoices: false, predictableRoutine: false, untimed: true, readAloud: false };
const summary = { correctCount: 1, total: 2, flawless: false, masteryChanges: ["Sight words: getting stronger"], stars: 1, previousBest: 0, counted: true, kind: "deed" as const, building: { label: "Village Well", done: 1, total: 5, complete: false, stars: 0, maxStars: 0, practice: false }, minutesEarned: 0, sideQuestPayFull: false };

beforeEach(() => {
  vi.clearAllMocks();
  answerDeedQuestion.mockResolvedValue({ correct: false, secondChance: false, answer: "because" });
  completeDeedRun.mockResolvedValue(summary);
});
afterEach(cleanup);

describe("DeedPlayer", () => {
  it("shows the question, grades a tap, and reveals the answer", async () => {
    const user = userEvent.setup();
    render(<DeedPlayer run={run} profile={profile} calm={false} onFinished={() => {}} />);
    expect(screen.getByText('Which word is "because"?')).toBeInTheDocument();
    expect(screen.getByLabelText("Question 1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "become" }));
    expect(answerDeedQuestion).toHaveBeenCalledWith("r1", 0, "become");
    expect(await screen.findByText("The answer was because.")).toBeInTheDocument();
  });

  it("advances with Next and finishes after the last question", async () => {
    const user = userEvent.setup();
    answerDeedQuestion.mockResolvedValue({ correct: true, secondChance: false, answer: "because" });
    const onFinished = vi.fn();
    render(<DeedPlayer run={run} profile={profile} calm={true} onFinished={onFinished} />);
    await user.click(screen.getByRole("button", { name: "because" }));
    await user.click(await screen.findByRole("button", { name: "Next question" }));
    expect(screen.getByText('Which word is "again"?')).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^(again|against)$/ })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "again" }));
    await user.click(await screen.findByRole("button", { name: "Finish side quest" }));
    expect(completeDeedRun).toHaveBeenCalledWith("r1");
    expect(await screen.findByText(/1 of 2/)).toBeInTheDocument();
    expect(screen.getByText("Sight words: getting stronger")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Side quest done!" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to side quests" }));
    expect(onFinished).toHaveBeenCalled();
  });

  it("hides the speaker when the browser cannot speak", () => {
    render(<DeedPlayer run={run} profile={profile} calm={false} onFinished={() => {}} />);
    expect(screen.queryByRole("button", { name: "Read aloud" })).not.toBeInTheDocument();
  });

  it("resumes at the first unanswered question instead of replaying from the start", () => {
    const resumed: RunStart = { ...run, responses: ["because", null] };
    render(<DeedPlayer run={resumed} profile={profile} calm={false} onFinished={() => {}} />);
    expect(screen.getByText('Which word is "again"?')).toBeInTheDocument();
    expect(screen.getByLabelText("Question 2 of 2")).toBeInTheDocument();
  });

  describe("the streak and the skill meter", () => {
    const meter = { skillLabel: "Sight words", filled: 3, needed: 7 };
    const right = { correct: true, secondChance: false, answer: "because", meter, rungChange: null };

    it("fills pips after an answer, and keeps them through the next question", async () => {
      const user = userEvent.setup();
      answerDeedQuestion.mockResolvedValue(right);
      render(<DeedPlayer run={run} profile={profile} calm={false} onFinished={() => {}} />);
      expect(screen.queryByText("Sight words")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "because" }));
      expect(await screen.findByText("Sight words")).toBeInTheDocument();
      expect(document.querySelectorAll(".deed-meter-pip--lit")).toHaveLength(3);
      await user.click(screen.getByRole("button", { name: "Next question" }));
      expect(screen.getByText("Sight words")).toBeInTheDocument();
    });

    it("shows the flame from two first tries right in a row,", async () => {
      const user = userEvent.setup();
      answerDeedQuestion.mockResolvedValue(right);
      render(<DeedPlayer run={run} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "because" }));
      expect(screen.queryByTestId("deed-streak")).not.toBeInTheDocument();
      await user.click(await screen.findByRole("button", { name: "Next question" }));
      await user.click(screen.getByRole("button", { name: "again" }));
      expect(await screen.findByTestId("deed-streak")).toHaveTextContent("2");
    });

    it("keeps the last meter when a retry brings none, and says a promotion kindly", async () => {
      const user = userEvent.setup();
      answerDeedQuestion.mockResolvedValue({ correct: false, secondChance: true, hint: "Look.", meter: { ...meter, filled: 2 } });
      render(<DeedPlayer run={run} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "become" }));
      retryDeedQuestion.mockResolvedValue({ correct: true, secondChance: false, answer: "because" });
      await user.click(await screen.findByRole("button", { name: "because" }));
      await screen.findByText("You got there!");
      expect(document.querySelectorAll(".deed-meter-pip--lit")).toHaveLength(2);
      expect(screen.queryByText(/getting stronger!/)).not.toBeInTheDocument();
    });

    it("says the promotion, and draws no meter once the skill is at the top", async () => {
      const user = userEvent.setup();
      answerDeedQuestion.mockResolvedValueOnce(right).mockResolvedValueOnce({ correct: true, secondChance: false, answer: "again", meter: null, rungChange: "Sight words: getting stronger!" });
      render(<DeedPlayer run={run} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "because" }));
      await user.click(await screen.findByRole("button", { name: "Next question" }));
      await user.click(screen.getByRole("button", { name: "again" }));
      expect(await screen.findByText("Sight words: getting stronger!")).toBeInTheDocument();
      expect(screen.queryByText("Sight words", { selector: ".deed-meter-label" })).not.toBeInTheDocument();
    });

    it("draws the flame without its animation for a calm child", async () => {
      const user = userEvent.setup();
      answerDeedQuestion.mockResolvedValue(right);
      render(<DeedPlayer run={run} profile={profile} calm onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "because" }));
      await user.click(await screen.findByRole("button", { name: "Next question" }));
      await user.click(screen.getByRole("button", { name: "again" }));
      expect(await screen.findByTestId("deed-streak")).toBeInTheDocument();
      expect(document.querySelector(".deed-meter-flame--live")).toBeNull();
    });
  });

  describe("second chances", () => {
    const open = { correct: false, secondChance: true, hint: "Look at the first letters." };
    const wrongFirst = async (user: ReturnType<typeof userEvent.setup>) => {
      answerDeedQuestion.mockResolvedValue(open);
      render(<DeedPlayer run={run} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "become" }));
    };

    it("shows the hint with a Try again state, crosses the pick out, and never shows the answer", async () => {
      const user = userEvent.setup();
      await wrongFirst(user);
      expect(await screen.findByText("Not quite. Look at the first letters.")).toBeInTheDocument();
      expect(screen.getByText("Try again")).toBeInTheDocument();
      expect(screen.queryByText(/The answer was/)).not.toBeInTheDocument();
      const crossed = screen.getByRole("button", { name: /^become/ });
      expect(crossed).toBeDisabled();
      expect(crossed).toHaveAttribute("aria-disabled", "true");
      expect(crossed).toHaveAttribute("data-tone", "ruled-out");
      expect(crossed).toHaveTextContent("(not this one)");
      expect(screen.getByRole("button", { name: "because" })).toHaveFocus();
    });

    it("sends the second pick to retryDeedQuestion and cheers a right one", async () => {
      const user = userEvent.setup();
      await wrongFirst(user);
      retryDeedQuestion.mockResolvedValue({ correct: true, secondChance: false, answer: "because" });
      await user.click(await screen.findByRole("button", { name: "because" }));
      expect(retryDeedQuestion).toHaveBeenCalledWith("r1", 0, "because");
      expect(answerDeedQuestion).toHaveBeenCalledTimes(1);
      expect(await screen.findByText("You got there!")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next question" })).toHaveFocus();
    });

    it("'Show me' resolves on the server and then shows the answer and the explanation", async () => {
      const user = userEvent.setup();
      await wrongFirst(user);
      resolveDeedQuestion.mockResolvedValue({ correct: false, secondChance: false, answer: "because", explain: "It starts with be-cause." });
      await user.click(await screen.findByRole("button", { name: "Show me" }));
      expect(resolveDeedQuestion).toHaveBeenCalledWith("r1", 0);
      expect(await screen.findByText("The answer was because. It starts with be-cause.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next question" })).toHaveFocus();
    });

    it("shows the answer at once with two choices", async () => {
      const user = userEvent.setup();
      render(<DeedPlayer run={{ ...run, responses: ["because", null] }} profile={profile} calm={false} onFinished={() => {}} />);
      answerDeedQuestion.mockResolvedValue({ correct: false, secondChance: false, answer: "again", explain: "Again has no s." });
      await user.click(screen.getByRole("button", { name: "against" }));
      expect(await screen.findByText("The answer was again. Again has no s.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Show me" })).not.toBeInTheDocument();
    });

    it("reopens a resumed second chance with the pick crossed and the hint shown", () => {
      const resumed: RunStart = { ...run, responses: ["become", null], pending: { index: 0, ruledOut: "become", hint: "Look at the ends." } };
      render(<DeedPlayer run={resumed} profile={profile} calm={false} onFinished={() => {}} />);
      expect(screen.getByText('Which word is "because"?')).toBeInTheDocument();
      expect(screen.getByText("Not quite. Look at the ends.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^become/ })).toBeDisabled();
    });

    it("draws the stars and celebrates a new best", async () => {
      const user = userEvent.setup();
      answerDeedQuestion.mockResolvedValue({ correct: true, secondChance: false, answer: "again" });
      render(<DeedPlayer run={{ ...run, responses: ["because", null] }} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "again" }));
      await user.click(await screen.findByRole("button", { name: "Finish side quest" }));
      expect(await screen.findByRole("img", { name: "1 of 3 stars" })).toBeInTheDocument();
      expect(screen.getByText("New best!")).toBeInTheDocument();
    });

    it("tells a starless run the village will help, never that it failed", async () => {
      const user = userEvent.setup();
      completeDeedRun.mockResolvedValue({ ...summary, stars: 0, previousBest: 0, counted: false });
      render(<DeedPlayer run={{ ...run, responses: ["because", null] }} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "against" }));
      await user.click(await screen.findByRole("button", { name: "Finish side quest" }));
      expect(await screen.findByText("The village will help you try again.")).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/fail/i);
    });

    it("says the play minutes a run earned", async () => {
      const user = userEvent.setup();
      completeDeedRun.mockResolvedValue({ ...summary, minutesEarned: 1 });
      render(<DeedPlayer run={{ ...run, responses: ["because", null] }} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "again" }));
      await user.click(await screen.findByRole("button", { name: "Finish side quest" }));
      expect(await screen.findByText("+1 minute earned")).toBeInTheDocument();
    });

    it("says gently when the day's side-quest minutes are all earned, and nothing when none were to earn", async () => {
      const user = userEvent.setup();
      completeDeedRun.mockResolvedValue({ ...summary, minutesEarned: 0, sideQuestPayFull: true });
      render(<DeedPlayer run={{ ...run, responses: ["because", null] }} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "again" }));
      await user.click(await screen.findByRole("button", { name: "Finish side quest" }));
      expect(await screen.findByText("You've earned all your side-quest minutes for today — great work!")).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/minutes? earned/);
    });
  });
  describe("a review run", () => {
    const reviewRun: RunStart = {
      ...run,
      deed: { id: "review:page", title: "Quick review", story: "Three riddles from things you have learned.", area: null },
      kind: "review",
      responses: ["because", null],
    };
    const reviewSummary = { ...summary, correctCount: 2, total: 3, stars: 0, counted: false, kind: "review" as const, building: null, masteryChanges: [], sideQuestPayFull: true };

    it("shows no subject chip while it is played", () => {
      render(<DeedPlayer run={reviewRun} profile={profile} calm={false} onFinished={() => {}} />);
      expect(screen.getByText("Quick review")).toBeInTheDocument();
      expect(document.querySelector("[data-subject]")).not.toBeInTheDocument();
    });

    it("summarises without stars, a building line or minutes", async () => {
      const user = userEvent.setup();
      completeDeedRun.mockResolvedValue(reviewSummary);
      render(<DeedPlayer run={reviewRun} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "again" }));
      await user.click(await screen.findByRole("button", { name: "Finish review" }));
      expect(screen.queryByRole("button", { name: "Finish side quest" })).not.toBeInTheDocument();
      expect(await screen.findByRole("heading", { name: "Review done!" })).toBeInTheDocument();
      expect(screen.queryByText("Side quest done!")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Back to side quests" })).toBeInTheDocument();
      expect(screen.getByText("Reviewed 3 \u00B7 2 right")).toBeInTheDocument();
      expect(screen.queryByText(/ of 3 right in/)).not.toBeInTheDocument();
      expect(screen.queryByText(/stars?\b/i)).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/minutes?/i);
      expect(document.body.textContent).not.toMatch(/built|Village Well/);
      expect(document.querySelector("[data-subject]")).not.toBeInTheDocument();
    });
  });

  describe("a build run", () => {
    const buildRun = (level: number): RunStart => ({
      ...run,
      deed: { id: `build:village-banners:${level}`, title: "Banners", story: "Aldo has the plans ready.", area: "math" },
      kind: "build", responses: ["because", null], plan: { improvementId: "village-banners", level, placed: 0 },
    });
    const balance = { stone: 0, ink: 0, herbs: 0, thread: 0, dye: 0, timber: 0 };
    const buildSummary = (level: number, improvement: Partial<NonNullable<RunSummary["improvement"]>> = {}) => ({
      ...summary, correctCount: 2, total: 3, stars: 2, previousBest: 0, counted: false, kind: "build" as const, building: null, masteryChanges: [], sideQuestPayFull: false,
      improvement: { id: "village-banners", label: "Banners", level, built: true, balance, ...improvement },
    });

    it("finishes with its own label, and says the plan is built at level 1", async () => {
      const user = userEvent.setup();
      completeDeedRun.mockResolvedValue(buildSummary(1));
      render(<DeedPlayer run={buildRun(1)} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "again" }));
      expect(screen.queryByRole("button", { name: "Finish side quest" })).not.toBeInTheDocument();
      await user.click(await screen.findByRole("button", { name: "Finish building" }));
      expect(await screen.findByRole("heading", { name: "The Banners are built!" })).toBeInTheDocument();
    });

    it("says the plan grows above level 1, shows its stars, and never 'New best!' or a side quest", async () => {
      const user = userEvent.setup();
      completeDeedRun.mockResolvedValue(buildSummary(2));
      render(<DeedPlayer run={buildRun(2)} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "again" }));
      await user.click(await screen.findByRole("button", { name: "Finish building" }));
      expect(await screen.findByRole("heading", { name: "The Banners grow!" })).toBeInTheDocument();
      expect(screen.getByText("2 of 3 right.")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "2 of 3 stars" })).toBeInTheDocument();
      expect(screen.queryByText("New best!")).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/side quest done|Flawless|minutes? earned/i);
    });

    it("says there were not enough materials, and that the plan will wait", async () => {
      const user = userEvent.setup();
      completeDeedRun.mockResolvedValue(buildSummary(1, { built: false, reason: "short" }));
      render(<DeedPlayer run={buildRun(1)} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "again" }));
      await user.click(await screen.findByRole("button", { name: "Finish building" }));
      expect(await screen.findByRole("heading", { name: "Not quite enough materials" })).toBeInTheDocument();
      expect(screen.getByText("The plan will wait for you on the plans board.")).toBeInTheDocument();
    });

    it("says the builders had to stop, and that nothing was spent, on an error", async () => {
      const user = userEvent.setup();
      completeDeedRun.mockResolvedValue(buildSummary(1, { built: false, reason: "error" }));
      render(<DeedPlayer run={buildRun(1)} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "again" }));
      await user.click(await screen.findByRole("button", { name: "Finish building" }));
      expect(await screen.findByRole("heading", { name: "The builders had to stop" })).toBeInTheDocument();
      expect(screen.getByText("Nothing was spent. Try again from the plans board.")).toBeInTheDocument();
    });
  });

  describe("Watch Aldo", () => {
    const bench = (id: string) => ({ kind: "measure" as const, id, skillId: "add-10", prompt: "Build a beam 9 blocks long.", readAloud: "Build a beam nine blocks long.", view: { mode: "assemble" as const, unit: "blocks", pieces: ["1 block", "4 blocks", "8 blocks"], target: "9 blocks" } });
    const young: RunStart = { ...run, deed: { ...run.deed, area: "math" }, questions: [bench("m1"), bench("m2")], responses: [null, null], demo: { at: 0 } };

    it("shows the worked example before the first task, and Got it brings the bench", async () => {
      const user = userEvent.setup();
      render(<DeedPlayer run={young} profile={profile} calm={false} onFinished={() => {}} />);
      expect(screen.getByRole("heading", { name: "Watch Aldo" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Got it" })).toHaveFocus();
      expect(screen.queryByRole("heading", { name: "The bench" })).not.toBeInTheDocument();
      expect(screen.queryByText("Build a beam 9 blocks long.")).not.toBeInTheDocument();
      await user.keyboard("{Enter}");
      expect(screen.queryByRole("heading", { name: "Watch Aldo" })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "The bench" })).toBeInTheDocument();
      expect(screen.getByText("Build a beam 9 blocks long.")).toBeInTheDocument();
    });

    it("is shown once: a second chance and the next task go straight to the bench", async () => {
      const user = userEvent.setup();
      answerDeedQuestion.mockResolvedValue({ correct: false, secondChance: true, hint: "Count on.", firstPick: "a:1" });
      render(<DeedPlayer run={young} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "Got it" }));
      await user.click(screen.getByRole("button", { name: "4 blocks" }));
      await user.click(screen.getByRole("button", { name: "Fit it" }));
      expect(await screen.findByText(/Count on\./)).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Watch Aldo" })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "The bench" })).toBeInTheDocument();
    });

    it("is not shown for a run that is not marked", () => {
      render(<DeedPlayer run={{ ...young, demo: undefined }} profile={profile} calm={false} onFinished={() => {}} />);
      expect(screen.queryByRole("heading", { name: "Watch Aldo" })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "The bench" })).toBeInTheDocument();
    });

    it("waits for the run's first bench task: a run that opens on choice meets Aldo when it reaches the bench, not before", async () => {
      const user = userEvent.setup();
      answerDeedQuestion.mockResolvedValue({ correct: true, secondChance: false, answer: "x" });
      const mixed: RunStart = { ...young, questions: [run.questions[0], run.questions[1], bench("m1")], responses: [null, null, null], demo: { at: 2 } };
      render(<DeedPlayer run={mixed} profile={profile} calm={true} onFinished={() => {}} />);
      expect(screen.queryByRole("heading", { name: "Watch Aldo" })).not.toBeInTheDocument();
      expect(screen.getByText('Which word is "because"?')).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "because" }));
      await user.click(await screen.findByRole("button", { name: "Next question" }));
      expect(screen.queryByRole("heading", { name: "Watch Aldo" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "again" }));
      await user.click(await screen.findByRole("button", { name: "Next question" }));
      expect(screen.getByRole("heading", { name: "Watch Aldo" })).toBeInTheDocument();
      expect(screen.getByText(/^Aldo needs a beam 5 feet long\./)).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "The bench" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Got it" }));
      expect(screen.getByRole("heading", { name: "The bench" })).toBeInTheDocument();
    });

    it("reads the demo aloud, then the task, for a hero with read-aloud on", async () => {
      const user = userEvent.setup();
      render(<DeedPlayer run={young} profile={{ ...profile, readAloud: true }} calm={false} onFinished={() => {}} />);
      expect(speak).toHaveBeenLastCalledWith(expect.stringMatching(/^Aldo needs a beam 5 feet long\./));
      await user.click(screen.getByRole("button", { name: "Got it" }));
      expect(speak).toHaveBeenLastCalledWith("Build a beam nine blocks long.");
    });
  });
});

describe("DeedPlayer (a word sort lock)", () => {
  const sort = {
    kind: "lock" as const, id: "q1", skillId: "sci-k", prompt: "Sort these: living or not living?",
    view: { puzzle: "sort" as const, categories: ["Living", "Not living"], items: [{ id: "a", label: "dog" }, { id: "b", label: "rock" }] },
  };
  const sortRun: RunStart = { ...run, questions: [sort], responses: [null] };

  it.each([[true, 1], [false, 0]])("hands the hero's read-aloud setting (%s) to the lock, so a pick speaks the word (%s times)", async (readAloud, times) => {
    const user = userEvent.setup();
    render(<DeedPlayer run={sortRun} profile={{ ...profile, readAloud }} calm={false} onFinished={() => {}} />);
    await user.click(screen.getByRole("button", { name: "dog" }));
    expect(vi.mocked(speak).mock.calls.filter(([w]) => w === "dog")).toHaveLength(times);
  });
});

describe("DeedPlayer (a reading trail on the page, H8)", () => {
  const clue = (n: number, prompt: string, readAloud?: string) => ({ kind: "trail" as const, id: `read-g1:trail:0000000${n}`, skillId: "read-g1", prompt, view: {}, ...(readAloud ? { readAloud } : {}) });
  const trailRun: RunStart = {
    ...run,
    questions: [clue(1, "Go where the big wheel turns.", "Go where the big wheel turns, and grain becomes flour."), clue(2, "Go where the water is drawn.")],
    responses: [null, null],
  };
  const OPEN = { correct: false, secondChance: true, hint: "That is where water is drawn.", feedback: "wrong_place", firstPick: "landmark:well" };
  const MISS = { correct: false, secondChance: false, answer: "It was the mill.", explain: "Flour is ground at the mill.", reveal: "landmark:mill" };

  async function search(user: ReturnType<typeof userEvent.setup>, label: string) {
    await user.click(screen.getByRole("button", { name: label }));
    await user.click(screen.getByRole("button", { name: "Search here" }));
  }

  it("plays a clue on the village map and answers with the place searched", async () => {
    const user = userEvent.setup();
    answerDeedQuestion.mockResolvedValue({ correct: true, secondChance: false, answer: "It was the mill." });
    render(<DeedPlayer run={trailRun} profile={profile} calm={false} onFinished={() => {}} />);
    expect(screen.getByText("Go where the big wheel turns.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set off" })).toBeNull();
    await search(user, "the mill");
    expect(answerDeedQuestion).toHaveBeenCalledWith("r1", 0, "landmark:mill");
    expect(await screen.findByRole("button", { name: "Next question" })).toBeInTheDocument();
  });

  it("a K run speaks the clue with read-aloud off; the same run without narrateClues does not", () => {
    render(<DeedPlayer run={{ ...trailRun, narrateClues: true }} profile={profile} calm={false} onFinished={() => {}} />);
    expect(speak).toHaveBeenLastCalledWith("Go where the big wheel turns, and grain becomes flour.");
    cleanup();
    vi.mocked(speak).mockClear();
    render(<DeedPlayer run={trailRun} profile={profile} calm={false} onFinished={() => {}} />);
    expect(speak).not.toHaveBeenCalled();
  });

  it("speaks a trail's second-chance line and miss line through autoSpeaks, as the board does (F-3)", async () => {
    const user = userEvent.setup();
    answerDeedQuestion.mockResolvedValue(OPEN);
    retryDeedQuestion.mockResolvedValue(MISS);
    render(<DeedPlayer run={{ ...trailRun, narrateClues: true }} profile={profile} calm={false} onFinished={() => {}} />);
    await search(user, "the well");
    expect(await screen.findByText("Not here. That is where water is drawn.")).toBeInTheDocument();
    expect(speak).toHaveBeenLastCalledWith("Not here. That is where water is drawn.");
    await search(user, "the garden");
    expect(retryDeedQuestion).toHaveBeenCalledWith("r1", 0, "landmark:garden");
    expect(await screen.findByText("It was the mill. Flour is ground at the mill.")).toBeInTheDocument();
    expect(speak).toHaveBeenLastCalledWith("It was the mill. Flour is ground at the mill.");
    expect(screen.getByRole("button", { name: "the mill" })).toHaveTextContent("It was here.");
  });

  it("says nothing unprompted to a hero who is not narrated and has read-aloud off", async () => {
    const user = userEvent.setup();
    answerDeedQuestion.mockResolvedValue(OPEN);
    render(<DeedPlayer run={trailRun} profile={profile} calm={false} onFinished={() => {}} />);
    await search(user, "the well");
    expect(await screen.findByText("Not here. That is where water is drawn.")).toBeInTheDocument();
    expect(speak).not.toHaveBeenCalled();
  });

  it("a choice run's speech is unchanged: with read-aloud on, a second chance speaks only its hint", async () => {
    const user = userEvent.setup();
    answerDeedQuestion.mockResolvedValue({ correct: false, secondChance: true, hint: "Sound it out." });
    render(<DeedPlayer run={{ ...run, narrateClues: true }} profile={{ ...profile, readAloud: true }} calm={false} onFinished={() => {}} />);
    expect(speak).toHaveBeenLastCalledWith("because");
    await user.click(screen.getByRole("button", { name: "become" }));
    expect(await screen.findByText("Not quite. Sound it out.")).toBeInTheDocument();
    expect(speak).toHaveBeenLastCalledWith("Sound it out.");
  });
});

describe("DeedPlayer (the picture run: a rune on the page, R-I11)", () => {
  /** A grade 2–3 dictation whose word is its effect id (R-I18, owner; RI-d). */
  const g23 = {
    kind: "rune" as const, id: "spell-g23:rune:1a2b3c4d", skillId: "spell-g23", prompt: "The lantern is dark. Build the word you hear.", readAloud: "Light. Light the lantern. Light.",
    view: { effect: "light" as const, object: { id: "rune:lane-lantern", label: "the dark lantern" }, tiles: ["t", "ee", "l", "s", "igh", "f"], listen: true },
  };
  const runeRun: RunStart = { ...run, deed: { id: "mill-ledger", title: "The Mill Ledger", story: "The miller needs words.", area: "language" }, questions: [g23], responses: [null] };
  const OPEN = { correct: false, secondChance: true, hint: "It rhymes with night.", feedback: "wrong_word", firstPick: "r:2,1,0" };

  /** jsdom cannot speak; give it a speech engine, so the page's own read control would show if it were drawn. */
  function withSpeech() {
    Object.defineProperty(window, "speechSynthesis", { value: { cancel: () => {}, speak: () => {} }, configurable: true, writable: true });
  }
  afterEach(() => {
    delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
  });

  async function cast(user: ReturnType<typeof userEvent.setup>, ...tiles: string[]) {
    const tray = screen.getByRole("group", { name: "Runes to tap" });
    for (const t of tiles) await user.click(within(tray).getByRole("button", { name: t }));
    await user.click(screen.getByRole("button", { name: "Cast" }));
  }

  it("plays on the stone, beside the object's picture, and answers with the tiles cast", async () => {
    const user = userEvent.setup();
    answerDeedQuestion.mockResolvedValue({ correct: true, secondChance: false, answer: "The word was light." });
    const { container } = render(<DeedPlayer run={runeRun} profile={profile} calm={false} onFinished={() => {}} />);
    expect(screen.getByText("The lantern is dark. Build the word you hear.")).toBeInTheDocument();
    expect(container.querySelector("svg.rune-pic")).not.toBeNull();
    expect(screen.getByText("the dark lantern")).toBeInTheDocument();
    await cast(user, "l", "igh", "t");
    expect(answerDeedQuestion).toHaveBeenCalledWith("r1", 0, "r:2,4,0");
  });

  it("speaks a grade-2 hero's word with read-aloud off, and the second-chance line (R-I18, owner)", async () => {
    const user = userEvent.setup();
    answerDeedQuestion.mockResolvedValue(OPEN);
    render(<DeedPlayer run={runeRun} profile={profile} calm={false} onFinished={() => {}} />);
    expect(speak).toHaveBeenLastCalledWith("Light. Light the lantern. Light.");
    await cast(user, "l", "ee", "t");
    expect(await screen.findByText("Not that word. It rhymes with night.")).toBeInTheDocument();
    expect(speak).toHaveBeenLastCalledWith("Not that word. It rhymes with night.");
  });

  it("one read control: the stone's Hear the word, never the page's Read aloud (RI-a / S4)", () => {
    withSpeech();
    render(<DeedPlayer run={runeRun} profile={profile} calm={false} onFinished={() => {}} />);
    expect(screen.queryByRole("button", { name: "Read aloud" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Hear the (word|meaning)$/ })).toHaveLength(1);
    // The word is heard, never shown, and the effect is a picture (RI-d).
    expect(document.body.textContent).not.toMatch(/\blight\b/i);
    cleanup();
    render(<DeedPlayer run={run} profile={profile} calm={false} onFinished={() => {}} />);
    expect(screen.getByRole("button", { name: "Read aloud" })).toBeInTheDocument();
  });

  it("a run picked back up at its finish step speaks nothing unprompted (I8 parked)", () => {
    render(<DeedPlayer run={{ ...runeRun, responses: ["r:2,4,0"] }} profile={profile} calm={false} onFinished={() => {}} />);
    expect(screen.getByText("Every answer is in.")).toBeInTheDocument();
    expect(speak).not.toHaveBeenCalled();
  });

  it("without speech, the dictation's word is printed under its picture (RI-a / S6)", () => {
    render(<DeedPlayer run={runeRun} profile={profile} calm={false} onFinished={() => {}} />);
    expect(screen.getByText("Sound is off. Read the word:", { exact: false })).toHaveTextContent("Sound is off. Read the word: Light. Light the lantern. Light.");
    expect(screen.queryByRole("button", { name: "Hear the word" })).not.toBeInTheDocument();
  });
});

