import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeedPlayer } from "./deed-player";
import type { RunStart } from "@/lib/utils/deed-run-types";
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
const summary = { correctCount: 1, total: 2, flawless: false, masteryChanges: ["Sight words: getting stronger"], stars: 1, previousBest: 0, counted: true, kind: "deed" as const, building: { label: "Village Well", done: 1, total: 5, complete: false, stars: 0, maxStars: 0 }, minutesEarned: 0, sideQuestPayFull: false };

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
    const buildSummary = { ...summary, correctCount: 2, total: 3, stars: 2, previousBest: 0, counted: false, kind: "build" as const, building: null, masteryChanges: [], sideQuestPayFull: false };

    it("finishes with its own label, and says the plan is built at level 1", async () => {
      const user = userEvent.setup();
      completeDeedRun.mockResolvedValue(buildSummary);
      render(<DeedPlayer run={buildRun(1)} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "again" }));
      expect(screen.queryByRole("button", { name: "Finish side quest" })).not.toBeInTheDocument();
      await user.click(await screen.findByRole("button", { name: "Finish building" }));
      expect(await screen.findByRole("heading", { name: "The Banners is built!" })).toBeInTheDocument();
    });

    it("says the plan grows above level 1, shows its stars, and never 'New best!' or a side quest", async () => {
      const user = userEvent.setup();
      completeDeedRun.mockResolvedValue(buildSummary);
      render(<DeedPlayer run={buildRun(2)} profile={profile} calm={false} onFinished={() => {}} />);
      await user.click(screen.getByRole("button", { name: "again" }));
      await user.click(await screen.findByRole("button", { name: "Finish building" }));
      expect(await screen.findByRole("heading", { name: "The Banners grows!" })).toBeInTheDocument();
      expect(screen.getByText("2 of 3 right.")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "2 of 3 stars" })).toBeInTheDocument();
      expect(screen.queryByText("New best!")).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/side quest done|Flawless|minutes? earned/i);
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
