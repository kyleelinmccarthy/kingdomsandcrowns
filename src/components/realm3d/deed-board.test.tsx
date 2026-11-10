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

import { answerDeedQuestion, completeDeedRun, resolveDeedQuestion, retryDeedQuestion, startDeedRun } from "@/lib/actions/deeds";
import { villagerById } from "@/lib/realm/villagers";
import { speak } from "@/lib/utils/speech";
import { DeedBoard } from "./deed-board";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no speech engine; the board cancels it on the way out.
  (window as unknown as { speechSynthesis: { cancel: () => void } }).speechSynthesis = { cancel: () => {} };
});

const site = {
  id: "well",
  label: "Village Well",
  description: "",
  icon: "box" as const,
  done: 2,
  total: 5,
  complete: false,
  stars: 2,
  maxStars: 9,
  deeds: [{ id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const, bestStars: 2 as const, crowned: false }],
};
const run = {
  runId: "run-1",
  deed: { id: "well-stones", title: "Count the Well Stones", story: "s", area: "math" as const },
  questions: [
    { kind: "choice" as const, id: "q1", skillId: "add", view: { prompt: "What is 2 + 3?", choices: ["4", "5"] }, readAloud: "What is two plus three?" },
    { kind: "choice" as const, id: "q2", skillId: "add", view: { prompt: "What is 4 + 4?", choices: ["8", "9"] } },
  ],
  responses: ["5", null] as (string | null)[],
  kind: "deed" as const,
  pending: null as { index: number; ruledOut: string; hint: string } | null,
};

function board(over: Partial<React.ComponentProps<typeof DeedBoard>> = {}) {
  return render(
    <DeedBoard
      childId="demo-child-1"
      villager={villagerById("bram")!}
      site={site}
      viewer="child"
      heroName="Emma"
      waiting
      numerals
      profile={{ readAloud: false, untimed: true }}
      calm={false}
      onResult={() => {}}
      onClose={() => {}}
      {...over}
    />,
  );
}

describe("the deed board", () => {
  it("resumes a run left half-way at its first unanswered question, as DeedPlayer does", async () => {
    vi.mocked(startDeedRun).mockResolvedValue(run);
    board();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    expect(screen.getByText("What is 4 + 4?")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Question 2 of 2" })).toBeInTheDocument();
  });

  it("reads each question aloud, the readAloud line first, for a child who asked for it", async () => {
    vi.mocked(startDeedRun).mockResolvedValue({ ...run, responses: [null, null] });
    board({ profile: { readAloud: true, untimed: true } });
    // The villager speaks first, once.
    expect(speak).toHaveBeenCalledWith(expect.stringMatching(/^Old Bram\. There you are!/));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    expect(speak).toHaveBeenLastCalledWith("What is two plus three?");
    fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
    expect(speak).toHaveBeenLastCalledWith("What is two plus three?");
  });

  it("says a failed start plainly and lets the child try again", async () => {
    vi.mocked(startDeedRun).mockRejectedValue(new Error("No side quests are ready for this hero yet."));
    board();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    expect(screen.getByRole("alert")).toHaveTextContent("No side quests are ready for this hero yet.");
  });

  it("says a start the server hid the reason for as one friendly line, never \"failed\"", async () => {
    vi.mocked(startDeedRun).mockRejectedValue(new Error("An error occurred in the Server Components render. The specific message is omitted in production builds."));
    board();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    expect(screen.getByRole("alert")).toHaveTextContent("That didn't work.");
    expect(screen.getByRole("alert").textContent).not.toMatch(/failed|Server Components/);
  });

  it("does not answer twice for a double press", async () => {
    vi.mocked(startDeedRun).mockResolvedValue({ ...run, responses: [null, null] });
    let resolve: (v: { correct: boolean; secondChance: boolean; answer: string }) => void = () => {};
    vi.mocked(answerDeedQuestion).mockReturnValue(new Promise((r) => (resolve = r)));
    board();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    await act(async () => resolve({ correct: true, secondChance: false, answer: "5" }));
    expect(answerDeedQuestion).toHaveBeenCalledTimes(1);
  });

  it("offers a grown-up no way to begin, and never calls the server", () => {
    board({ viewer: "parent" });
    expect(screen.queryByRole("button", { name: /Begin/ })).toBeNull();
    expect(screen.getByText("Side Quests are for Emma to play. Here is what each one asks.")).toBeInTheDocument();
    expect(startDeedRun).not.toHaveBeenCalled();
  });

  describe("stars on the list", () => {
    it("draws three stars per side quest, lit up to the best, and says so to a screen reader", () => {
      board();
      const stars = screen.getByRole("img", { name: "2 of 3 stars" });
      const icons = stars.querySelectorAll(".r3-star");
      expect(icons).toHaveLength(3);
      expect(stars.querySelectorAll(".r3-star--on")).toHaveLength(2);
    });

    it("shows an unplayed side quest with three dark stars", () => {
      board({ site: { ...site, deeds: [{ ...site.deeds[0], bestStars: 0 }] } });
      expect(screen.getByRole("img", { name: "0 of 3 stars" }).querySelectorAll(".r3-star--on")).toHaveLength(0);
    });

    it("marks a crowned side quest", () => {
      board({ site: { ...site, deeds: [{ ...site.deeds[0], crowned: true }] } });
      expect(screen.getByText("Crown earned")).toBeInTheDocument();
    });

    it("shows a visiting grown-up the stars and the crown, and no way to begin", () => {
      board({ viewer: "parent", site: { ...site, deeds: [{ ...site.deeds[0], crowned: true }] } });
      expect(screen.getByRole("img", { name: "2 of 3 stars" })).toBeInTheDocument();
      expect(screen.getByText("Crown earned")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Begin|Challenge/ })).toBeNull();
    });

    it("offers the Crown Challenge only on a side quest with every star, and only to the hero", () => {
      const threeStars = { ...site, deeds: [{ ...site.deeds[0], bestStars: 3 as const }] };
      board();
      expect(screen.queryByRole("button", { name: /Crown Challenge/ })).toBeNull();
      cleanup();
      board({ viewer: "parent", site: threeStars });
      expect(screen.queryByRole("button", { name: /Crown Challenge/ })).toBeNull();
      cleanup();
      board({ site: threeStars });
      const go = screen.getByRole("button", { name: "Begin the Crown Challenge for Count the Well Stones" });
      expect(go).toHaveTextContent("Crown Challenge");
    });

    it("begins a challenge, and a crown earned there is handed up with the result", async () => {
      const challenge = { ...run, kind: "challenge" as const, responses: ["5", null] };
      vi.mocked(startDeedRun).mockResolvedValue(challenge);
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "8" });
      vi.mocked(completeDeedRun).mockResolvedValue({
        correctCount: 2, total: 2, flawless: true, masteryChanges: [], stars: 0, previousBest: 3, deedBest: 3, counted: false, crowned: true, kind: "challenge",
        building: { label: "Village Well", done: 5, total: 5, complete: true, stars: 9, maxStars: 9 }, minutesEarned: 0, sideQuestPayFull: false,
      });
      const onResult = vi.fn();
      board({ onResult, site: { ...site, deeds: [{ ...site.deeds[0], bestStars: 3 }] } });
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin the Crown Challenge for Count the Well Stones" })));
      expect(startDeedRun).toHaveBeenCalledWith("demo-child-1", "well-stones", "realm", { challenge: true });
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "8" })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
      expect(screen.getByText("Crowned!")).toBeInTheDocument();
      expect(screen.queryByText("New best!")).toBeNull();
      expect(screen.queryByRole("img", { name: /of 3 stars/ })).toBeNull();
      expect(onResult).toHaveBeenCalledWith("well", expect.objectContaining({ counted: false, challenge: { won: true }, deed: { id: "well-stones", bestStars: 3, crowned: true } }));
    });

    it("hands up the finished side quest's new best with the building's progress", async () => {
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "8" });
      vi.mocked(completeDeedRun).mockResolvedValue({
        correctCount: 2, total: 2, flawless: true, masteryChanges: [], stars: 3, previousBest: 2, deedBest: 3, counted: true, crowned: false, kind: "deed",
        building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 6, maxStars: 9 }, minutesEarned: 0, sideQuestPayFull: false,
      });
      const onResult = vi.fn();
      vi.mocked(startDeedRun).mockResolvedValue({ ...run, responses: ["5", null] });
      board({ onResult });
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "8" })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
      expect(onResult).toHaveBeenCalledWith("well", expect.objectContaining({ done: 3, stars: 6, maxStars: 9, counted: true, deed: { id: "well-stones", bestStars: 3, crowned: false } }));
    });
  });

  describe("the streak and the skill meter", () => {
    const meter = { skillLabel: "Addition", filled: 4, needed: 7 };
    const fresh = { ...run, responses: [null, null] };

    it("fills the pips after an answer and keeps them when a retry brings none", async () => {
      vi.mocked(startDeedRun).mockResolvedValue(fresh);
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: false, secondChance: true, hint: "Count on.", meter });
      vi.mocked(retryDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
      board();
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
      expect(screen.queryByText("Addition")).not.toBeInTheDocument();
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: /^4/ })));
      expect(screen.getByText("Addition")).toBeInTheDocument();
      expect(document.querySelectorAll(".deed-meter-pip--lit")).toHaveLength(4);
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: /^5/ })));
      expect(document.querySelectorAll(".deed-meter-pip--lit")).toHaveLength(4);
    });

    it("lights the flame at two first tries in a row, and says a promotion", async () => {
      vi.mocked(startDeedRun).mockResolvedValue(fresh);
      vi.mocked(answerDeedQuestion)
        .mockResolvedValueOnce({ correct: true, secondChance: false, answer: "5", meter })
        .mockResolvedValueOnce({ correct: true, secondChance: false, answer: "8", meter: { ...meter, filled: 0 }, rungChange: "Addition: getting stronger!" });
      board();
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: /^5/ })));
      expect(screen.queryByTestId("deed-streak")).not.toBeInTheDocument();
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Next question" })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: /^8/ })));
      expect(screen.getByTestId("deed-streak")).toHaveTextContent("2");
      expect(screen.getByText("Addition: getting stronger!")).toBeInTheDocument();
    });

    it("at simple depth lights the flame without its count", async () => {
      vi.mocked(startDeedRun).mockResolvedValue(fresh);
      vi.mocked(answerDeedQuestion)
        .mockResolvedValueOnce({ correct: true, secondChance: false, answer: "5", meter })
        .mockResolvedValueOnce({ correct: true, secondChance: false, answer: "8", meter });
      board({ numerals: false });
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: /^5/ })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Next question" })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: /^8/ })));
      expect(screen.getByTestId("deed-streak").textContent).not.toMatch(/\d/);
    });
  });

  describe("second chances", () => {
    const four = {
      ...run,
      questions: [
        { kind: "choice" as const, id: "q1", skillId: "add", view: { prompt: "What is 2 + 3?", choices: ["4", "5", "6", "7"] } },
        { kind: "choice" as const, id: "q2", skillId: "add", view: { prompt: "What is 4 + 4?", choices: ["8", "9"] } },
      ],
      responses: [null, null] as (string | null)[],
    };
    const open = { correct: false, secondChance: true, hint: "Count up from the bigger number." };

    async function begin(r = four, over: Partial<React.ComponentProps<typeof DeedBoard>> = {}) {
      vi.mocked(startDeedRun).mockResolvedValue(r);
      board(over);
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    }
    const click = (name: string | RegExp) => act(async () => void fireEvent.click(screen.getByRole("button", { name })));

    it("shows the hint, not the answer, after a wrong first pick, and crosses the pick out", async () => {
      vi.mocked(answerDeedQuestion).mockResolvedValue(open);
      await begin();
      await click("4");
      expect(screen.getByText("Not quite. Count up from the bigger number.")).toBeInTheDocument();
      expect(screen.getByText("Try again")).toBeInTheDocument();
      expect(screen.queryByText(/The answer was/)).toBeNull();
      const crossed = screen.getByRole("button", { name: /^4/ });
      expect(crossed).toBeDisabled();
      expect(crossed).toHaveAttribute("aria-disabled", "true");
      expect(crossed).toHaveAttribute("data-tone", "ruled-out");
      expect(crossed).toHaveTextContent("(not this one)");
      expect(screen.getByRole("button", { name: "5" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "5" })).toHaveFocus();
      expect(screen.queryByRole("button", { name: "Next question" })).toBeNull();
    });

    it("sends the second pick to retryDeedQuestion and says 'You got there!' when it is right", async () => {
      vi.mocked(answerDeedQuestion).mockResolvedValue(open);
      vi.mocked(retryDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
      await begin();
      await click("4");
      await click("5");
      expect(retryDeedQuestion).toHaveBeenCalledWith("run-1", 0, "5");
      expect(answerDeedQuestion).toHaveBeenCalledTimes(1);
      expect(screen.getByText("You got there!")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next question" })).toHaveFocus();
    });

    it("'Show me' resolves on the server, then shows the answer and the explanation", async () => {
      vi.mocked(answerDeedQuestion).mockResolvedValue(open);
      vi.mocked(resolveDeedQuestion).mockResolvedValue({ correct: false, secondChance: false, answer: "5", explain: "2 + 3 makes 5." });
      await begin();
      await click("4");
      await click("Show me");
      expect(resolveDeedQuestion).toHaveBeenCalledWith("run-1", 0);
      expect(screen.getByText("The answer was 5. 2 + 3 makes 5.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "5" })).toHaveAttribute("data-tone", "answer");
      expect(screen.getByRole("button", { name: "Next question" })).toHaveFocus();
    });

    it("shows the answer at once when there were only two choices", async () => {
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: false, secondChance: false, answer: "8", explain: "Double 4." });
      await begin({ ...four, responses: ["5", null] });
      await click("9");
      expect(screen.getByText("The answer was 8. Double 4.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Show me" })).toBeNull();
    });

    it("answers with the number keys, and the crossed-out number does nothing", async () => {
      vi.mocked(answerDeedQuestion).mockResolvedValue(open);
      vi.mocked(retryDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "6" });
      await begin();
      await act(async () => void fireEvent.keyDown(window, { code: "Digit1" }));
      expect(answerDeedQuestion).toHaveBeenCalledWith("run-1", 0, "4");
      await act(async () => void fireEvent.keyDown(window, { code: "Digit1" }));
      expect(retryDeedQuestion).not.toHaveBeenCalled();
      await act(async () => void fireEvent.keyDown(window, { code: "Digit3" }));
      expect(retryDeedQuestion).toHaveBeenCalledWith("run-1", 0, "6");
    });

    it("reopens a resumed second chance on that question with the pick crossed and the hint shown", async () => {
      await begin({ ...four, responses: ["4", null], pending: { index: 0, ruledOut: "4", hint: "Count up." } });
      expect(screen.getByText("What is 2 + 3?")).toBeInTheDocument();
      expect(screen.getByText("Not quite. Count up.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^4/ })).toBeDisabled();
    });

    it("reads the hint aloud for a child who asked for it", async () => {
      vi.mocked(answerDeedQuestion).mockResolvedValue(open);
      await begin(four, { profile: { readAloud: true, untimed: true } });
      await click("4");
      expect(speak).toHaveBeenLastCalledWith("Count up from the bigger number.");
    });

    it("keeps the sparkle away from a calm child", async () => {
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "5" });
      await begin(four, { calm: true });
      await click("5");
      expect(screen.getByRole("button", { name: "5" }).className).not.toMatch(/sparkle/);
    });

    it("finishes with stars, a new best, and a villager who will help when nothing was earned", async () => {
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "8" });
      const summary = { correctCount: 2, total: 2, flawless: true, masteryChanges: [], stars: 3 as const, previousBest: 2 as const, deedBest: 3 as const, counted: true, crowned: false, kind: "deed" as const, building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 3, maxStars: 15 }, minutesEarned: 3, sideQuestPayFull: false };
      vi.mocked(completeDeedRun).mockResolvedValue(summary);
      await begin({ ...four, responses: ["5", null] });
      await click("8");
      await click("Finish side quest");
      expect(screen.getByRole("img", { name: "3 of 3 stars" })).toBeInTheDocument();
      expect(screen.getByText("New best!")).toBeInTheDocument();
      expect(screen.getByText("+3 minutes earned")).toBeInTheDocument();
    });

    it("says gently when the day's side-quest minutes are all earned", async () => {
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "8" });
      vi.mocked(completeDeedRun).mockResolvedValue({ correctCount: 2, total: 2, flawless: true, masteryChanges: [], stars: 3, previousBest: 3, deedBest: 3, counted: true, crowned: false, kind: "deed", building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 3, maxStars: 15 }, minutesEarned: 0, sideQuestPayFull: true });
      await begin({ ...four, responses: ["5", null] });
      await click("8");
      await click("Finish side quest");
      expect(screen.getByText("You've earned all your side-quest minutes for today — great work!")).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/minutes? earned/);
    });

    it("says the villager will help when a side quest earned no stars, never 'failed'", async () => {
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: false, secondChance: false, answer: "8" });
      vi.mocked(completeDeedRun).mockResolvedValue({ correctCount: 0, total: 2, flawless: false, masteryChanges: [], stars: 0, previousBest: 0, deedBest: 0, counted: false, crowned: false, kind: "deed", building: { label: "Village Well", done: 2, total: 5, complete: false, stars: 0, maxStars: 15 }, minutesEarned: 0, sideQuestPayFull: false });
      await begin({ ...four, responses: ["5", null] });
      await click("9");
      await click("Finish side quest");
      expect(screen.getByText("Old Bram will help you try again.")).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/fail/i);
    });
  });
});
