import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
import { DeedBoard, deedResultOf, RunResultCard } from "./deed-board";
import { ALL_ANSWERED } from "@/lib/utils/deed-run-flow";
import type { RunStart } from "@/lib/utils/deed-run-types";

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
  raisedBy: null,
  raisedAt: null,
  deeds: [{ id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const, bestStars: 2 as const, crowned: false }],
};
const run = {
  runId: "run-1",
  deed: { id: "well-stones", title: "Count the Well Stones", story: "s", area: "math" as const },
  questions: [
    { kind: "choice" as const, id: "q1", skillId: "add", prompt: "What is 2 + 3?", view: { choices: ["4", "5"] }, readAloud: "What is two plus three?" },
    { kind: "choice" as const, id: "q2", skillId: "add", prompt: "What is 4 + 4?", view: { choices: ["8", "9"] } },
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

  it("begins in the world's context unless it is told it is the gate's, and a challenge follows the same context", async () => {
    vi.mocked(startDeedRun).mockResolvedValue(run);
    board();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    expect(startDeedRun).toHaveBeenLastCalledWith("demo-child-1", "well-stones", "realm");
    cleanup();
    board({ runContext: "gate" });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    expect(startDeedRun).toHaveBeenLastCalledWith("demo-child-1", "well-stones", "gate");
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
        building: { label: "Village Well", done: 5, total: 5, complete: true, stars: 9, maxStars: 9, practice: false }, minutesEarned: 0, sideQuestPayFull: false,
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
        building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 6, maxStars: 9, practice: false }, minutesEarned: 0, sideQuestPayFull: false,
      });
      const onResult = vi.fn();
      vi.mocked(startDeedRun).mockResolvedValue({ ...run, responses: ["5", null] });
      board({ onResult });
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "8" })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish side quest" })));
      expect(onResult).toHaveBeenCalledWith("well", expect.objectContaining({ done: 3, stars: 6, maxStars: 9, counted: true, earned: true, deed: { id: "well-stones", bestStars: 3, crowned: false } }));
    });
  });

  describe("a world run (logic locks; Puzzle practice)", () => {
    it("finishes with its own button, says the puzzles are solved, and shows no stars or building", async () => {
      const world = { ...run, kind: "world" as const, responses: ["5", null], deed: { id: "practice", title: "Puzzle practice", story: "Three puzzles.", area: "logic" as const } };
      vi.mocked(startDeedRun).mockResolvedValue(world);
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "8" });
      vi.mocked(completeDeedRun).mockResolvedValue({
        correctCount: 2, total: 2, flawless: true, masteryChanges: [], stars: 0, previousBest: 0, deedBest: 0, counted: false, crowned: false,
        kind: "world", building: null, minutesEarned: 0, sideQuestPayFull: false,
      });
      const onResult = vi.fn();
      board({ onResult });
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
      expect(screen.getByRole("button", { name: /Leave the puzzles/ })).toBeInTheDocument();
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "8" })));
      expect(screen.queryByRole("button", { name: "Finish side quest" })).toBeNull();
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish puzzles" })));
      expect(screen.getByText("Puzzles solved!")).toBeInTheDocument();
      expect(screen.queryByRole("img", { name: /of 3 stars/ })).toBeNull();
      expect(document.body.textContent).not.toMatch(/Flawless|side quest done|New best/i);
      expect(onResult).not.toHaveBeenCalled();
    });
  });

  describe("a chest's or vault door's run (RG-m)", () => {
    it.each([["chest:west-lane", "The old chest"], ["door:ringstones", "The vault door"]])("%s finishes with Done and is left with Leave the lock", async (id, title) => {
      const lock = { ...run, kind: "world" as const, responses: ["5", null], deed: { id, title, story: "Sealed with a puzzle.", area: "logic" as const } };
      vi.mocked(startDeedRun).mockResolvedValue(lock);
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "8" });
      board();
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
      expect(screen.getByRole("button", { name: "Leave the lock" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Leave the puzzles/ })).toBeNull();
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "8" })));
      expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Finish puzzles" })).toBeNull();
    });
  });

  describe("a build run", () => {
    const build = {
      ...run, kind: "build" as const, responses: ["5", null],
      deed: { id: "build:village-banners:2", title: "Banners", story: "Aldo has the plans ready.", area: "math" as const },
      plan: { improvementId: "village-banners" as const, level: 2, placed: 0 },
    };
    const built = {
      correctCount: 2, total: 2, flawless: true, masteryChanges: [], stars: 3, previousBest: 0, deedBest: 0, counted: false, crowned: false, kind: "build" as const,
      building: null, minutesEarned: 0, sideQuestPayFull: false,
      improvement: { id: "village-banners" as const, label: "Banners", level: 2, built: true, balance: { stone: 0, ink: 0, herbs: 0, thread: 0, dye: 0, timber: 0 } },
    };

    async function playToTheEnd(summary: Omit<typeof built, "building"> & { building: unknown }) {
      vi.mocked(startDeedRun).mockResolvedValue(build);
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "8" });
      vi.mocked(completeDeedRun).mockResolvedValue(summary as never);
      const onResult = vi.fn();
      board({ onResult });
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "8" })));
      expect(screen.queryByRole("button", { name: "Finish side quest" })).toBeNull();
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish building" })));
      return onResult;
    }

    it("says the plan grows, shows its stars, and never 'New best!' or a side quest", async () => {
      const onResult = await playToTheEnd(built);
      expect(screen.getByText("The Banners grow!")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "3 of 3 stars" })).toBeInTheDocument();
      expect(screen.queryByText("New best!")).toBeNull();
      expect(document.body.textContent).not.toMatch(/Flawless|side quest done/i);
      expect(onResult).not.toHaveBeenCalled();
    });

    it("reopens a run whose every task is answered at its finish step, never asking again (the finish call failed)", async () => {
      vi.mocked(startDeedRun).mockResolvedValue({ ...build, responses: ["5", "8"] });
      vi.mocked(completeDeedRun).mockResolvedValue(built as never);
      board();
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
      expect(screen.getByText(ALL_ANSWERED)).toBeInTheDocument();
      // The last task stands answered: nothing on it can be picked again.
      for (const choice of screen.queryAllByRole("button", { name: /^\d+$/ })) expect(choice).toBeDisabled();
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish building" })));
      expect(answerDeedQuestion).not.toHaveBeenCalled();
      expect(completeDeedRun).toHaveBeenCalledTimes(1);
      expect(screen.getByText("The Banners grow!")).toBeInTheDocument();
    });

    it("does the same for a side quest's run, which shares the flow", async () => {
      vi.mocked(startDeedRun).mockResolvedValue({ ...run, responses: ["5", "8"] });
      board();
      await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
      expect(screen.getByText(ALL_ANSWERED)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Finish side quest" })).toBeInTheDocument();
    });

    it("never hands a building up to be raised, even if a result carried one", async () => {
      const onResult = await playToTheEnd({ ...built, building: { label: "Village Well", done: 5, total: 5, complete: true, stars: 9, maxStars: 9, practice: false } });
      expect(screen.getByText("The Banners grow!")).toBeInTheDocument();
      expect(onResult).not.toHaveBeenCalled();
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
        { kind: "choice" as const, id: "q1", skillId: "add", prompt: "What is 2 + 3?", view: { choices: ["4", "5", "6", "7"] } },
        { kind: "choice" as const, id: "q2", skillId: "add", prompt: "What is 4 + 4?", view: { choices: ["8", "9"] } },
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
      const summary = { correctCount: 2, total: 2, flawless: true, masteryChanges: [], stars: 3 as const, previousBest: 2 as const, deedBest: 3 as const, counted: true, crowned: false, kind: "deed" as const, building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 3, maxStars: 15, practice: false }, minutesEarned: 3, sideQuestPayFull: false };
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
      vi.mocked(completeDeedRun).mockResolvedValue({ correctCount: 2, total: 2, flawless: true, masteryChanges: [], stars: 3, previousBest: 3, deedBest: 3, counted: true, crowned: false, kind: "deed", building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 3, maxStars: 15, practice: false }, minutesEarned: 0, sideQuestPayFull: true });
      await begin({ ...four, responses: ["5", null] });
      await click("8");
      await click("Finish side quest");
      expect(screen.getByText("You've earned all your side-quest minutes for today — great work!")).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/minutes? earned/);
    });

    it("says the villager will help when a side quest earned no stars, never 'failed'", async () => {
      vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: false, secondChance: false, answer: "8" });
      vi.mocked(completeDeedRun).mockResolvedValue({ correctCount: 0, total: 2, flawless: false, masteryChanges: [], stars: 0, previousBest: 0, deedBest: 0, counted: false, crowned: false, kind: "deed", building: { label: "Village Well", done: 2, total: 5, complete: false, stars: 0, maxStars: 15, practice: false }, minutesEarned: 0, sideQuestPayFull: false });
      await begin({ ...four, responses: ["5", null] });
      await click("9");
      await click("Finish side quest");
      expect(screen.getByText("Old Bram will help you try again.")).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/fail/i);
    });
  });
});

describe("a bench task on the board", () => {
  const bench = (id: string) => ({ kind: "measure" as const, id, skillId: "frac-addsub", prompt: "Cut a board three quarters of a foot long.", view: { mode: "cut" as const, unit: "feet", step: "1/4", maxLength: "2" } });
  // Two bench tasks and a choice: stage 1's 8 pieces are paced over the two bench tasks, 4 each.
  const cut = {
    ...run,
    questions: [bench("m1"), run.questions[1], bench("m2")],
    responses: [null, null, null] as (string | null)[],
    site: { stage: 1, complete: false, placed: 0 },
  };
  async function begin(onClose = vi.fn()) {
    vi.mocked(startDeedRun).mockResolvedValue(cut);
    board({ onClose });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    return onClose;
  }

  it("is played at the bench, beside the building going up; a right cut lays a piece and shows its worked sum", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "1/2 + 1/4 = 3/4", bridge: "1/2 + 1/4 = 3/4" });
    await begin();
    expect(screen.getByRole("heading", { name: "The bench" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^The site: 0 of/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Length in feet"), { target: { value: "0.75" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Cut it" })));
    expect(answerDeedQuestion).toHaveBeenCalledWith("run-1", 0, "c:3/4");
    expect(screen.getByRole("img", { name: "The site: 4 of 8 pieces laid" })).toBeInTheDocument();
    expect(screen.getByText("That's it! Old Bram is pleased. 1/2 + 1/4 = 3/4")).toBeInTheDocument();
  });

  it("a wrong cut says which way it is off, and the first try, and lays nothing", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: false, secondChance: true, hint: "Count the quarters.", firstPick: "c:1", feedback: "too_long" });
    await begin();
    fireEvent.change(screen.getByLabelText("Length in feet"), { target: { value: "1" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Cut it" })));
    expect(screen.getByText("A little long. Trim it. Count the quarters.")).toBeInTheDocument();
    expect(screen.getByText("Your first try: 1")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^The site: 0 of/ })).toBeInTheDocument();
  });

  it("a missed assemble task says its answer as the sentence it is", async () => {
    const answer = "Pieces that add up to 9 blocks, like 1 + 8 = 9.";
    vi.mocked(startDeedRun).mockResolvedValue({
      ...cut,
      questions: [{ kind: "measure" as const, id: "a1", skillId: "add-10", prompt: "Build a beam 9 blocks long.", view: { mode: "assemble" as const, unit: "blocks", pieces: ["1 block", "4 blocks", "8 blocks"], target: "9 blocks" } }],
      responses: [null],
    });
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: false, secondChance: false, answer, hint: "Count on." });
    board();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    fireEvent.click(screen.getByRole("button", { name: "4 blocks" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Fit it" })));
    expect(screen.getByText(`${answer} Count on.`)).toBeInTheDocument();
  });

  it("keys typed into the length stay there: no number key answers, and Esc does not leave (Review Focus 5)", async () => {
    const game = vi.fn();
    window.addEventListener("keydown", game);
    try {
      const onClose = await begin();
      const box = screen.getByLabelText("Length in feet");
      for (const [key, code] of [["w", "KeyW"], ["1", "Digit1"], ["Escape", "Escape"]]) fireEvent.keyDown(box, { key, code });
      expect(game).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.keyDown(window, { key: "1", code: "Digit1" });
      expect(answerDeedQuestion).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", game);
    }
  });
});

describe("Watch Aldo on the board", () => {
  const bench = (id: string) => ({ kind: "measure" as const, id, skillId: "add-10", prompt: "Cut a board three quarters of a foot long.", readAloud: "Cut three quarters.", view: { mode: "cut" as const, unit: "feet", step: "1/4", maxLength: "2" } });
  const young = { ...run, questions: [bench("m1"), bench("m2")], responses: [null, null] as (string | null)[], demo: { at: 0 } };
  const begin = async (over: Partial<React.ComponentProps<typeof DeedBoard>> = {}) => {
    vi.mocked(startDeedRun).mockResolvedValue(young);
    board(over);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
  };

  it("shows the worked example first, with no bench, and Got it brings the first task", async () => {
    await begin();
    expect(screen.getByRole("heading", { name: "Watch Aldo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toHaveFocus();
    expect(screen.queryByRole("heading", { name: "The bench" })).toBeNull();
    expect(screen.queryByText("Cut a board three quarters of a foot long.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("heading", { name: "Watch Aldo" })).toBeNull();
    expect(screen.getByRole("heading", { name: "The bench" })).toBeInTheDocument();
    expect(screen.getByText("Cut a board three quarters of a foot long.")).toBeInTheDocument();
  });

  it("comes back for neither the next task nor a second chance", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: false, secondChance: true, hint: "Count the quarters.", firstPick: "c:1", feedback: "too_long" });
    await begin();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    fireEvent.change(screen.getByLabelText("Length in feet"), { target: { value: "1" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Cut it" })));
    expect(screen.queryByRole("heading", { name: "Watch Aldo" })).toBeNull();
    expect(screen.getByRole("heading", { name: "The bench" })).toBeInTheDocument();
  });

  it("is not shown for a run that is not marked", async () => {
    vi.mocked(startDeedRun).mockResolvedValue({ ...young, demo: undefined });
    board();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    expect(screen.queryByRole("heading", { name: "Watch Aldo" })).toBeNull();
    expect(screen.getByRole("heading", { name: "The bench" })).toBeInTheDocument();
  });

  it("reads the demo aloud, then the first task once Got it is pressed, for a child with read-aloud on", async () => {
    await begin({ profile: { readAloud: true, untimed: true } });
    expect(speak).toHaveBeenLastCalledWith(expect.stringMatching(/^Aldo needs a board 3\/4 of a foot long\./));
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(speak).toHaveBeenLastCalledWith("Cut three quarters.");
  });

  it("takes no keys from the game: Esc and a number key still reach it, and no number key answers", async () => {
    const game = vi.fn();
    window.addEventListener("keydown", game);
    try {
      await begin();
      const got = screen.getByRole("button", { name: "Got it" });
      fireEvent.keyDown(got, { key: "1", code: "Digit1" });
      fireEvent.keyDown(got, { key: "Escape", code: "Escape" });
      expect(game).toHaveBeenCalledTimes(2);
      expect(game.mock.calls.every(([e]) => !(e as KeyboardEvent).defaultPrevented)).toBe(true);
      expect(answerDeedQuestion).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", game);
    }
  });
});

describe("a lock on the board (F4)", () => {
  const red = { shape: "circle" as const, color: "red" as const };
  const blue = { shape: "circle" as const, color: "blue" as const };
  const pattern = {
    kind: "lock" as const, id: "logic-k1:pat:x", skillId: "logic-k1", prompt: "What comes next?",
    view: { puzzle: "pattern" as const, sequence: [red, blue, red, blue, null], tray: [blue, red] },
  };
  const locks = { ...run, questions: [pattern], responses: [null] as (string | null)[], demo: { at: 0 } as { at: number } | undefined };
  const begin = async (over: Partial<React.ComponentProps<typeof DeedBoard>> = {}, start: Awaited<ReturnType<typeof startDeedRun>> = locks) => {
    vi.mocked(startDeedRun).mockResolvedValue(start);
    board(over);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
  };

  it("a young hero's first lock opens on Watch Pip, read aloud, and Got it brings the lock", async () => {
    await begin({ profile: { readAloud: true, untimed: true } });
    expect(screen.getByRole("heading", { name: "Watch Pip" })).toBeInTheDocument();
    expect(speak).toHaveBeenLastCalledWith("Pip fits the next shape: red, blue, red, blue, … red!");
    expect(screen.queryByRole("heading", { name: "The lock" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.getByRole("heading", { name: "The lock" })).toBeInTheDocument();
    expect(screen.getByText("What comes next?")).toBeInTheDocument();
  });

  it.each([[true, 1], [false, 0]])("hands the hero's read-aloud setting (%s) to a word sort, so a pick speaks the word (%s times)", async (readAloud, times) => {
    const sort = {
      kind: "lock" as const, id: "sci-k:sort:x", skillId: "sci-k", prompt: "Sort these: living or not living?",
      view: { puzzle: "sort" as const, categories: ["Living", "Not living"], items: [{ id: "a", label: "dog" }, { id: "b", label: "rock" }] },
    };
    await begin({ profile: { readAloud, untimed: true } }, { ...run, questions: [sort], responses: [null] });
    fireEvent.click(screen.getByRole("button", { name: "dog" }));
    expect(vi.mocked(speak).mock.calls.filter(([w]) => w === "dog")).toHaveLength(times);
  });

  it("no Pip for a run that is not marked", async () => {
    await begin({}, { ...locks, demo: undefined });
    expect(screen.queryByRole("heading", { name: "Watch Pip" })).toBeNull();
    expect(screen.getByRole("heading", { name: "The lock" })).toBeInTheDocument();
  });

  it("is answered through the face: the second chance keeps the first try, and a miss draws the solved board", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: false, secondChance: true, hint: "Say the colours.", firstPick: "pattern:1", feedback: "rule_broken" });
    vi.mocked(retryDeedQuestion).mockResolvedValue({ correct: false, secondChance: false, answer: "Here is one way it fits.", reveal: "pattern:2" });
    await begin({}, { ...locks, demo: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Tray: blue circle" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Check the lock" })));
    expect(answerDeedQuestion).toHaveBeenCalledWith(expect.any(String), 0, "pattern:1");
    expect(screen.getByText(/Look at the marked rule\. Say the colours\./)).toBeInTheDocument();
    const gap = screen.getByRole("button", { name: /^Space 5: blue circle, doesn't fit yet/ });
    expect(gap).toHaveAttribute("data-broken", "true");
    expect(screen.getByRole("button", { name: "Check the lock" })).toBeDisabled();
    fireEvent.click(gap);
    fireEvent.click(screen.getByRole("button", { name: "Tray: red circle" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Check the lock" })));
    expect(screen.getByRole("button", { name: "Space 5: red circle" })).toBeDisabled();
    // Said once, by the feedback line beside the solved board; the face draws, it does not repeat it.
    expect(screen.getAllByText(/Here is one way it fits\./)).toHaveLength(1);
  });
});

describe("a reading trail on the board (H8)", () => {
  const clue = (n: number, prompt: string, readAloud?: string) => ({ kind: "trail" as const, id: `read-g1:trail:0000000${n}`, skillId: "read-g1", prompt, view: {}, ...(readAloud ? { readAloud } : {}) });
  const CLUE_1 = clue(1, "Go where the big wheel turns.", "Go where the big wheel turns, and grain becomes flour.");
  const trailRun: RunStart = {
    ...run,
    deed: { id: "well-signs", title: "Signs for the Well", story: "The sign-painter left clues.", area: "reading" },
    questions: [CLUE_1, clue(2, "Go where the water is drawn.")],
    responses: [null, null],
  };
  const OPEN = { correct: false, secondChance: true, hint: "That is where water is drawn.", feedback: "wrong_place" as const, firstPick: "landmark:well" };
  const MISS = { correct: false, secondChance: false, answer: "It was the mill.", explain: "Flour is ground at the mill.", reveal: "landmark:mill" };
  const summary = {
    correctCount: 2, total: 2, flawless: true, masteryChanges: [], stars: 3 as const, previousBest: 2 as const, deedBest: 3 as const, counted: true, crowned: false, kind: "deed" as const,
    building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 6, maxStars: 9, practice: false }, minutesEarned: 3, sideQuestPayFull: false,
  };

  async function begin(r: RunStart, over: Partial<React.ComponentProps<typeof DeedBoard>> = {}) {
    vi.mocked(startDeedRun).mockResolvedValue(r);
    board(over);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
  }
  const click = (name: string | RegExp) => act(async () => void fireEvent.click(screen.getByRole("button", { name })));
  const search = async (label: string) => {
    await click(label);
    await click("Search here");
  };

  it("a two-clue trail run in the Realm shows the clue and Set off, which hands the run to the walk", async () => {
    const onWalk = vi.fn();
    await begin(trailRun, { onWalk });
    expect(screen.getByText("Go where the big wheel turns.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "the mill" })).toBeNull();
    await click("Set off");
    expect(onWalk).toHaveBeenCalledTimes(1);
    expect(onWalk).toHaveBeenCalledWith(trailRun);
  });

  it("a mixed run shows no Set off: its clue is answered on the map", async () => {
    await begin({ ...trailRun, questions: [CLUE_1, run.questions[1]] }, { onWalk: vi.fn() });
    expect(screen.queryByRole("button", { name: "Set off" })).toBeNull();
    expect(screen.getByRole("button", { name: "the mill" })).toBeInTheDocument();
  });

  it("the gate's board never walks: its clue is answered on the map", async () => {
    await begin(trailRun, { onWalk: vi.fn(), runContext: "gate" });
    expect(screen.queryByRole("button", { name: "Set off" })).toBeNull();
    expect(screen.getByRole("button", { name: "Search here" })).toBeInTheDocument();
  });

  it("a walked run comes back as its result card, titled by the deed, and its way out closes the board", () => {
    const onClose = vi.fn();
    board({ walked: { run: trailRun, summary }, onClose });
    expect(screen.getByRole("heading", { name: "Signs for the Well" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "3 of 3 stars" })).toBeInTheDocument();
    expect(screen.getByText("New best!")).toBeInTheDocument();
    expect(screen.getByText("+3 minutes earned")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Begin/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Back to the Realm/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a walked Crown Challenge is titled as one", () => {
    board({ walked: { run: { ...trailRun, kind: "challenge" }, summary: { ...summary, kind: "challenge", stars: 0, counted: false, crowned: true } } });
    expect(screen.getByRole("heading", { name: "Crown Challenge: Signs for the Well" })).toBeInTheDocument();
    expect(screen.getByText("Crowned!")).toBeInTheDocument();
  });

  it("deedResultOf is what the board hands up: a side quest's and a challenge's, never a build's", () => {
    expect(deedResultOf(summary, "well-signs")).toEqual({
      label: "Village Well", done: 3, total: 5, complete: false, stars: 6, maxStars: 9, practice: false,
      counted: true, earned: true, minutesEarned: 3, deed: { id: "well-signs", bestStars: 3, crowned: false },
    });
    expect(deedResultOf({ ...summary, kind: "challenge", stars: 0, counted: false, crowned: true }, "well-signs")).toEqual({
      label: "Village Well", done: 3, total: 5, complete: false, stars: 6, maxStars: 9, practice: false,
      counted: false, earned: false, minutesEarned: 3, deed: { id: "well-signs", bestStars: 3, crowned: true }, challenge: { won: true },
    });
    expect(deedResultOf({ ...summary, kind: "build" }, "build:village-banners:2")).toBeNull();
    expect(deedResultOf({ ...summary, building: null }, "well-signs")).toBeNull();
  });

  it("a K hero hears the clue with read-aloud off, and the second chance's line", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    await begin({ ...trailRun, narrateClues: true });
    expect(speak).toHaveBeenLastCalledWith("Go where the big wheel turns, and grain becomes flour.");
    await search("the well");
    expect(answerDeedQuestion).toHaveBeenCalledWith("run-1", 0, "landmark:well");
    expect(speak).toHaveBeenLastCalledWith("Not here. That is where water is drawn.");
  });

  it("the board speaks a trail's second-chance and miss lines (F-3)", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    vi.mocked(retryDeedQuestion).mockResolvedValue(MISS);
    await begin({ ...trailRun, narrateClues: true });
    await search("the well");
    expect(screen.getByText("Not here. That is where water is drawn.")).toBeInTheDocument();
    expect(speak).toHaveBeenLastCalledWith("Not here. That is where water is drawn.");
    await search("the garden");
    expect(retryDeedQuestion).toHaveBeenCalledWith("run-1", 0, "landmark:garden");
    expect(speak).toHaveBeenLastCalledWith("It was the mill. Flour is ground at the mill.");
    expect(screen.getByRole("button", { name: "the mill" })).toHaveTextContent("It was here.");
    await click("Next question");
    expect(speak).toHaveBeenLastCalledWith("Go where the water is drawn.");
  });

  it("a grade-1 hero's clue is not spoken unless asked", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    await begin(trailRun);
    expect(speak).not.toHaveBeenCalled();
    await click("Read aloud");
    expect(speak).toHaveBeenLastCalledWith("Go where the big wheel turns, and grain becomes flour.");
    vi.mocked(speak).mockClear();
    await search("the well");
    expect(speak).not.toHaveBeenCalled();
  });

  it("a K hero hears Pip's trail demo first, with read-aloud off", async () => {
    await begin({ ...trailRun, narrateClues: true, demo: { at: 0 } });
    expect(screen.getByRole("heading", { name: "Watch Pip" })).toBeInTheDocument();
    expect(speak).toHaveBeenLastCalledWith("Watch Pip follow a clue. The clue says: Go to the well. Pip reads it, walks to the well, and searches there. Found it!");
    await click("Got it");
    expect(speak).toHaveBeenLastCalledWith("Go where the big wheel turns, and grain becomes flour.");
  });

  it("a trail second chance picked back up still says Not here.", async () => {
    await begin({ ...trailRun, responses: ["landmark:well", null], pending: { index: 0, ruledOut: "landmark:well", hint: "That is where water is drawn." } });
    expect(screen.getByText("Not here. That is where water is drawn.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "the well" })).toBeDisabled();
  });

  it("other kinds' speech is unchanged: a choice's second chance speaks only its hint, and its miss says nothing more", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: false, secondChance: true, hint: "Count on." });
    vi.mocked(resolveDeedQuestion).mockResolvedValue({ correct: false, secondChance: false, answer: "5", explain: "2 + 3 makes 5." });
    const four: RunStart = { ...run, questions: [{ ...run.questions[0], view: { choices: ["4", "5", "6", "7"] } }, run.questions[1]], responses: [null, null] };
    await begin({ ...four, narrateClues: true }, { profile: { readAloud: true, untimed: true } });
    await click("4");
    expect(speak).toHaveBeenLastCalledWith("Count on.");
    const calls = vi.mocked(speak).mock.calls.length;
    await click("Show me");
    expect(vi.mocked(speak).mock.calls.length).toBe(calls);
  });

  it("narrated clues make no choice task speak with read-aloud off", async () => {
    await begin({ ...run, responses: [null, null], narrateClues: true });
    expect(speak).not.toHaveBeenCalled();
  });
});

describe("a rune on the board (R-I11, R-I18)", () => {
  type RuneClient = Extract<RunStart["questions"][number], { kind: "rune" }>;
  const WAGON = { id: "rune:west-wagon", label: "the broken wagon" };
  const LANTERN = { id: "rune:lane-lantern", label: "the dark lantern" };
  /** A K–1 dictation: "mend", tiles d m a e n i. */
  const k1 = (n: number, object: RuneClient["view"]["object"] = WAGON): RuneClient => ({
    kind: "rune", id: `lang-gk:rune:0000000${n}`, skillId: "lang-gk", prompt: "The wagon is broken. Build the word you hear.", readAloud: "Mend. Mend the wagon. Mend.",
    view: { effect: "mend", object, tiles: ["d", "m", "a", "e", "n", "i"], listen: true },
  });
  /** A grade 2–3 dictation whose word is its effect id (R-I18, owner; RI-d). */
  const g23: RuneClient = {
    kind: "rune", id: "spell-g23:rune:1a2b3c4d", skillId: "spell-g23", prompt: "The lantern is dark. Build the word you hear.", readAloud: "Light. Light the lantern. Light.",
    view: { effect: "light", object: LANTERN, tiles: ["t", "ee", "l", "s", "igh", "f"], listen: true },
  };
  /** A meaning (grade 4 and up). */
  const meaning: RuneClient = {
    kind: "rune", id: "vocab-g68:rune:9f8e7d6c", skillId: "vocab-g68", prompt: "To put a thing back the way it was.", readAloud: "To put a thing back the way it was.",
    view: { effect: "mend", object: WAGON, tiles: ["ore", "st", "pre", "re", "ive", "ed"], listen: false },
  };
  const runeRun = (questions: RuneClient[], over: Partial<RunStart> = {}): RunStart => ({
    ...run, deed: { id: "mill-ledger", title: "The Mill Ledger", story: "The miller needs words.", area: "language" }, questions, responses: questions.map(() => null), ...over,
  });
  const OPEN = { correct: false, secondChance: true, hint: "It rhymes with send.", feedback: "wrong_word" as const, firstPick: "r:1,2,4,0" };
  const MISS = { correct: false, secondChance: false, answer: "The word was mend.", explain: "Mend means to make whole.", reveal: "r:1,3,4,0" };

  async function begin(r: RunStart, over: Partial<React.ComponentProps<typeof DeedBoard>> = {}) {
    vi.mocked(startDeedRun).mockResolvedValue(r);
    board(over);
    vi.mocked(speak).mockClear();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
  }
  const click = (name: string | RegExp) => act(async () => void fireEvent.click(screen.getByRole("button", { name })));
  const castWord = async (...tiles: string[]) => {
    const tray = screen.getByRole("group", { name: "Runes to tap" });
    for (const t of tiles) fireEvent.click(within(tray).getByRole("button", { name: t }));
    await click("Cast");
  };

  it("a dictation is spoken with read-aloud off: a K–1 word", async () => {
    await begin(runeRun([k1(1)]));
    expect(speak).toHaveBeenCalledWith("Mend. Mend the wagon. Mend.");
  });

  it("a dictation is spoken with read-aloud off: a grade-2 hero's word (R-I18, owner)", async () => {
    await begin(runeRun([g23]));
    expect(speak).toHaveBeenCalledWith("Light. Light the lantern. Light.");
    // The word is heard, never shown, and the effect is a picture (RI-d).
    expect(document.body.textContent).not.toMatch(/\blight\b/i);
  });

  it("a meaning is not spoken unless asked: the stone's Hear the meaning says it", async () => {
    await begin(runeRun([meaning]));
    expect(speak).not.toHaveBeenCalled();
    await click("Hear the meaning");
    expect(speak).toHaveBeenLastCalledWith("To put a thing back the way it was.");
  });

  it("one read control on a rune task: the stone's, never the board's Read aloud (RI-a / S4)", async () => {
    await begin(runeRun([k1(1)]));
    expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Hear the (word|meaning)$/ })).toHaveLength(1);
    cleanup();
    await begin({ ...run, responses: [null, null] });
    expect(screen.getByRole("button", { name: "Read aloud" })).toBeInTheDocument();
  });

  it("the board speaks a rune's second-chance and miss lines", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue(OPEN);
    vi.mocked(retryDeedQuestion).mockResolvedValue(MISS);
    await begin(runeRun([k1(1), k1(2, LANTERN)]));
    await castWord("m", "a", "n", "d");
    expect(answerDeedQuestion).toHaveBeenCalledWith("run-1", 0, "r:1,2,4,0");
    expect(screen.getByText("Not that word. It rhymes with send.")).toBeInTheDocument();
    expect(speak).toHaveBeenLastCalledWith("Not that word. It rhymes with send.");
    await castWord("m", "e", "n", "d");
    expect(retryDeedQuestion).toHaveBeenCalledWith("run-1", 0, "r:1,3,4,0");
    expect(speak).toHaveBeenLastCalledWith("The word was mend. Mend means to make whole.");
  });

  it("a two-rune walking run in the Realm shows Set off with both labels, which hands the run to the walk", async () => {
    const onWalk = vi.fn();
    const two = runeRun([k1(1), k1(2, LANTERN)]);
    await begin(two, { onWalk });
    expect(screen.getByText("Two things in the village need a rune: the broken wagon and the dark lantern. Walk to each one and cast it there.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "The rune stone" })).toBeNull();
    await click("Set off");
    expect(onWalk).toHaveBeenCalledTimes(1);
    expect(onWalk).toHaveBeenCalledWith(two);
  });

  it("nothing is spoken at Set off, even a dictation with read-aloud on (RI-a / S5)", async () => {
    await begin(runeRun([k1(1), k1(2, LANTERN)]), { onWalk: vi.fn(), profile: { readAloud: true, untimed: true } });
    expect(screen.getByRole("button", { name: "Set off" })).toBeInTheDocument();
    expect(speak).not.toHaveBeenCalled();
  });

  it("a rune run with a stop that left the catalog is not walked: it plays on the stone (RI-a / N5)", async () => {
    await begin(runeRun([k1(1), k1(2, { id: "rune:gone", label: "the broken gone thing" })]), { onWalk: vi.fn() });
    expect(screen.queryByRole("button", { name: "Set off" })).toBeNull();
    expect(screen.getByRole("group", { name: "The rune stone" })).toBeInTheDocument();
  });

  it("a run that may not be walked (runes off since it began) plays on the stone, and its finish mirrors the fixes (RI-a / S7)", async () => {
    const canWalk = vi.fn(() => false);
    const onRuneOutcomes = vi.fn();
    const runes = [{ objectId: "rune:west-wagon", fixed: true }];
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "The word was mend." });
    vi.mocked(completeDeedRun).mockResolvedValue({
      correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 3, previousBest: 0, deedBest: 3, counted: true, crowned: false, kind: "deed",
      building: { label: "Village Well", done: 3, total: 5, complete: false, stars: 6, maxStars: 9, practice: false }, minutesEarned: 3, sideQuestPayFull: false, runes,
    });
    const one = runeRun([k1(1)]);
    await begin(one, { onWalk: vi.fn(), canWalk, onRuneOutcomes });
    expect(canWalk).toHaveBeenCalledWith(one);
    expect(screen.queryByRole("button", { name: "Set off" })).toBeNull();
    await castWord("m", "e", "n", "d");
    await click("Finish side quest");
    expect(onRuneOutcomes).toHaveBeenCalledTimes(1);
    expect(onRuneOutcomes).toHaveBeenCalledWith(runes);
  });

  it("a walkable run is still offered the walk when canWalk says so", async () => {
    await begin(runeRun([k1(1), k1(2, LANTERN)]), { onWalk: vi.fn(), canWalk: () => true });
    expect(screen.getByRole("button", { name: "Set off" })).toBeInTheDocument();
  });

  it("a rune world run's result card draws the object mended, or still broken", () => {
    const one = runeRun([k1(1)], { kind: "world", deed: { id: "rune:west-wagon", title: "The rune stone", story: "Something here needs a rune.", area: "language" } });
    const summary = { correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 0 as const, previousBest: 0 as const, deedBest: 0 as const, counted: false, crowned: false, kind: "world" as const, building: null, minutesEarned: 0, sideQuestPayFull: false };
    const fixed = render(<RunResultCard run={one} summary={{ ...summary, runes: [{ objectId: "rune:west-wagon", fixed: true }] }} onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "The rune works!" })).toBeInTheDocument();
    const mended = fixed.container.querySelector("svg.rune-pic")!.innerHTML;
    cleanup();
    const missed = render(<RunResultCard run={one} summary={{ ...summary, flawless: false, runes: [{ objectId: "rune:west-wagon", fixed: false, reason: "missed" }] }} onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "The rune fades." })).toBeInTheDocument();
    expect(missed.container.querySelector("svg.rune-pic")!.innerHTML).not.toBe(mended);
    cleanup();
    const gone = render(<RunResultCard run={one} summary={{ ...summary, runes: [{ objectId: "rune:gone", fixed: false, reason: "missed" }] }} onClose={() => {}} />);
    expect(gone.container.querySelector("svg.rune-pic")).toBeNull();
  });

  it("other kinds' speech is unchanged: a choice is not spoken with read-aloud off", async () => {
    await begin({ ...run, responses: [null, null] });
    expect(speak).not.toHaveBeenCalled();
  });
});
