import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/deeds", () => ({ startDeedRun: vi.fn(), answerDeedQuestion: vi.fn(), completeDeedRun: vi.fn() }));
vi.mock("@/lib/utils/speech", () => ({ canSpeak: () => true, speak: vi.fn() }));

import { answerDeedQuestion, startDeedRun } from "@/lib/actions/deeds";
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
  deeds: [{ id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const }],
};
const run = {
  runId: "run-1",
  deed: { id: "well-stones", title: "Count the Well Stones", story: "s", area: "math" as const },
  questions: [
    { id: "q1", skillId: "add", prompt: "What is 2 + 3?", choices: ["4", "5"], readAloud: "What is two plus three?" },
    { id: "q2", skillId: "add", prompt: "What is 4 + 4?", choices: ["8", "9"] },
  ],
  responses: ["5", null] as (string | null)[],
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

  it("does not answer twice for a double press", async () => {
    vi.mocked(startDeedRun).mockResolvedValue({ ...run, responses: [null, null] });
    let resolve: (v: { correct: boolean; answer: string }) => void = () => {};
    vi.mocked(answerDeedQuestion).mockReturnValue(new Promise((r) => (resolve = r)));
    board();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Begin Count the Well Stones" })));
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    await act(async () => resolve({ correct: true, answer: "5" }));
    expect(answerDeedQuestion).toHaveBeenCalledTimes(1);
  });

  it("offers a grown-up no way to begin, and never calls the server", () => {
    board({ viewer: "parent" });
    expect(screen.queryByRole("button", { name: /Begin/ })).toBeNull();
    expect(screen.getByText("Side Quests are for Emma to play. Here is what each one asks.")).toBeInTheDocument();
    expect(startDeedRun).not.toHaveBeenCalled();
  });
});
