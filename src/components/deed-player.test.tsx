import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeedPlayer } from "./deed-player";
import type { RunStart } from "@/lib/actions/deeds";

const answerDeedQuestion = vi.fn();
const completeDeedRun = vi.fn();
vi.mock("@/lib/actions/deeds", () => ({
  answerDeedQuestion: (...a: unknown[]) => answerDeedQuestion(...a),
  completeDeedRun: (...a: unknown[]) => completeDeedRun(...a),
}));

const run: RunStart = {
  runId: "r1",
  deed: { id: "well-signs", title: "Signs for the Well", story: "Help the sign-painter." },
  questions: [
    { id: "q1", skillId: "sight-g23", prompt: 'Which word is "because"?', choices: ["because", "become", "beside", "before"], readAloud: "because" },
    { id: "q2", skillId: "sight-g23", prompt: 'Which word is "again"?', choices: ["again", "against"] },
  ],
  responses: [null, null],
};
const profile = { fewerChoices: false, predictableRoutine: false, untimed: true, readAloud: false };
const summary = { correctCount: 1, total: 2, flawless: false, masteryChanges: ["Sight words: getting stronger"], building: { label: "Village Well", done: 1, total: 5, complete: false } };

beforeEach(() => {
  vi.clearAllMocks();
  answerDeedQuestion.mockResolvedValue({ correct: false, answer: "because" });
  completeDeedRun.mockResolvedValue(summary);
});
afterEach(cleanup);

describe("DeedPlayer", () => {
  it("shows the question, grades a tap, and reveals the answer", async () => {
    const user = userEvent.setup();
    render(<DeedPlayer childId="c1" run={run} profile={profile} calm={false} onFinished={() => {}} />);
    expect(screen.getByText('Which word is "because"?')).toBeInTheDocument();
    expect(screen.getByLabelText("Question 1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "become" }));
    expect(answerDeedQuestion).toHaveBeenCalledWith("r1", 0, "become");
    expect(await screen.findByText("Not quite. The answer was because.")).toBeInTheDocument();
  });

  it("advances with Next and finishes after the last question", async () => {
    const user = userEvent.setup();
    answerDeedQuestion.mockResolvedValue({ correct: true, answer: "because" });
    const onFinished = vi.fn();
    render(<DeedPlayer childId="c1" run={run} profile={profile} calm={true} onFinished={onFinished} />);
    await user.click(screen.getByRole("button", { name: "because" }));
    await user.click(await screen.findByRole("button", { name: "Next question" }));
    expect(screen.getByText('Which word is "again"?')).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^(again|against)$/ })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "again" }));
    await user.click(await screen.findByRole("button", { name: "Finish deed" }));
    expect(completeDeedRun).toHaveBeenCalledWith("r1");
    expect(await screen.findByText(/1 of 2/)).toBeInTheDocument();
    expect(screen.getByText("Sight words: getting stronger")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to deeds" }));
    expect(onFinished).toHaveBeenCalled();
  });

  it("hides the speaker when the browser cannot speak", () => {
    render(<DeedPlayer childId="c1" run={run} profile={profile} calm={false} onFinished={() => {}} />);
    expect(screen.queryByRole("button", { name: "Read aloud" })).not.toBeInTheDocument();
  });

  it("resumes at the first unanswered question instead of replaying from the start", () => {
    const resumed: RunStart = { ...run, responses: ["because", null] };
    render(<DeedPlayer childId="c1" run={resumed} profile={profile} calm={false} onFinished={() => {}} />);
    expect(screen.getByText('Which word is "again"?')).toBeInTheDocument();
    expect(screen.getByLabelText("Question 2 of 2")).toBeInTheDocument();
  });
});
