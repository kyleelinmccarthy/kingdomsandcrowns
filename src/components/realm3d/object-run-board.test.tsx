import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/deeds", () => ({
  startDeedRun: vi.fn(),
  answerDeedQuestion: vi.fn(),
  retryDeedQuestion: vi.fn(),
  resolveDeedQuestion: vi.fn(),
  completeDeedRun: vi.fn(),
}));
vi.mock("@/lib/utils/speech", () => ({ canSpeak: () => false, speak: vi.fn(), stopSpeaking: vi.fn() }));

import { answerDeedQuestion, completeDeedRun } from "@/lib/actions/deeds";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import { RUNE_FIXED } from "@/lib/utils/deed-refusals";
import { ObjectRunBoard } from "./object-run-board";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { speechSynthesis: { cancel: () => void } }).speechSynthesis = { cancel: () => {} };
});

const HELD = RUNE_FIXED;
const COPY = {
  title: "The stub object",
  story: "A stub object waits for a puzzle.",
  icon: "key" as const,
  reading: "The stub stirs…",
  notNow: "Not now.",
  heroOnly: "For the hero only.",
  heldLine: (visitor: boolean) => (visitor ? "It holds (visitor)." : "It holds (hero)."),
};

const run: RunStart = {
  runId: "obj-1",
  deed: { id: "chest:west-lane", title: "The stub object", story: "A stub object waits for a puzzle.", area: "logic" },
  questions: [{ kind: "choice", id: "q1", skillId: "logic-g45", prompt: "Which shape comes next?", view: { choices: ["circle", "square"] } }],
  responses: [null],
  kind: "world",
  pending: null,
};
const summary: RunSummary = {
  correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 0, previousBest: 0, deedBest: 0,
  counted: false, crowned: false, kind: "world", building: null, minutesEarned: 0, sideQuestPayFull: false,
};

type Props = React.ComponentProps<typeof ObjectRunBoard>;
function props(over: Partial<Props> = {}): Props {
  return {
    childId: "c1", viewer: "child", numerals: true, profile: { readAloud: false, untimed: true }, calm: false,
    held: false, start: vi.fn().mockResolvedValue(run), heldRefusal: HELD, copy: COPY,
    onHeldRefused: vi.fn(), onSummary: vi.fn(), onClose: vi.fn(), ...over,
  };
}
const board = (over: Partial<Props> = {}) => {
  const p = props(over);
  return { p, ...render(<ObjectRunBoard {...p} />) };
};

describe("the object-board shell", () => {
  it("asks the server once for this hero, even mounted twice over, and plays the run at once", async () => {
    const p = props();
    await act(async () => void render(<StrictMode><ObjectRunBoard {...p} /></StrictMode>));
    expect(p.start).toHaveBeenCalledTimes(1);
    expect(p.start).toHaveBeenCalledWith("c1");
    expect(screen.getByRole("heading", { name: "The stub object" })).toBeInTheDocument();
    expect(screen.getByText("Which shape comes next?")).toBeInTheDocument();
  });

  it("says the reading line, and the story, while it asks about an object drawn not held", async () => {
    let resolve!: (r: RunStart) => void;
    const start = vi.fn(() => new Promise<RunStart>((r) => (resolve = r)));
    board({ start });
    expect(screen.getByRole("status")).toHaveTextContent("The stub stirs…");
    expect(screen.getByText(COPY.story)).toBeInTheDocument();
    await act(async () => resolve(run));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not describe an object drawn held as waiting while it asks the server about it", () => {
    board({ held: true, start: vi.fn(() => new Promise<RunStart>(() => {})) });
    expect(screen.getByRole("status")).toHaveTextContent("The stub stirs…");
    expect(screen.queryByText(COPY.story)).toBeNull();
  });

  it("asks the server even at an object drawn held, and plays a run that starts (it broke overnight)", async () => {
    const { p } = board({ held: true });
    await act(async () => {});
    expect(p.start).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Which shape comes next?")).toBeInTheDocument();
    expect(screen.queryByText(COPY.heldLine(false))).toBeNull();
  });

  it("a held refusal at an object drawn held says the held line and reports nothing", async () => {
    const { p } = board({ held: true, start: vi.fn().mockRejectedValue(new Error(HELD)) });
    await act(async () => {});
    expect(screen.getByText("It holds (hero).")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(p.onHeldRefused).not.toHaveBeenCalled();
  });

  it("a held refusal at an object drawn not held reports it once, and says the refusal's own line", async () => {
    const { p } = board({ start: vi.fn().mockRejectedValue(new Error(HELD)) });
    await act(async () => {});
    expect(p.onHeldRefused).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(HELD);
  });

  it("a held refusal shows the caller's own line, when it names one, at an object drawn not held", async () => {
    const { p } = board({ start: vi.fn().mockRejectedValue(new Error(HELD)), copy: { ...COPY, refusedLine: "It holds already." } });
    await act(async () => {});
    expect(p.onHeldRefused).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("It holds already.");
  });

  it("says any other refusal plainly and reports nothing", async () => {
    const { p } = board({ start: vi.fn().mockRejectedValue(new Error("The runes are resting for now.")) });
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent("The runes are resting for now.");
    expect(p.onHeldRefused).not.toHaveBeenCalled();
  });

  it("says an unknown failure as a plain line, never the raw message", async () => {
    board({ start: vi.fn().mockRejectedValue(new Error("database is locked")) });
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent("That didn't work.");
  });

  it("a visitor asks nothing: held says the visitor's line, not held says it is the hero's", async () => {
    const heldBoard = board({ viewer: "parent", held: true });
    await act(async () => {});
    expect(heldBoard.p.start).not.toHaveBeenCalled();
    expect(screen.getByText("It holds (visitor).")).toBeInTheDocument();
    cleanup();
    const shut = board({ viewer: "parent" });
    await act(async () => {});
    expect(shut.p.start).not.toHaveBeenCalled();
    expect(screen.getByText(COPY.heroOnly)).toBeInTheDocument();
  });

  it("a child view with no hero named says the not-now line, never the hero-only one, and asks nothing", async () => {
    const { p } = board({ childId: null });
    await act(async () => {});
    expect(p.start).not.toHaveBeenCalled();
    expect(screen.getByText(COPY.notNow)).toBeInTheDocument();
    expect(screen.queryByText(COPY.heroOnly)).toBeNull();
  });

  it("hands a finished run's summary up the moment the server has it", async () => {
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "circle" });
    vi.mocked(completeDeedRun).mockResolvedValue(summary);
    const { p } = board();
    await act(async () => {});
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "circle" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Done" })));
    expect(completeDeedRun).toHaveBeenCalledWith("obj-1");
    expect(p.onSummary).toHaveBeenCalledWith(summary);
  });

  it("reads whether the object was held once, when it opens: a later change keeps the story put", async () => {
    const view = board({ held: false, start: vi.fn(() => new Promise<RunStart>(() => {})) });
    expect(screen.getByText(COPY.story)).toBeInTheDocument();
    view.rerender(<ObjectRunBoard {...view.p} held start={view.p.start} />);
    expect(screen.getByText(COPY.story)).toBeInTheDocument();
  });

  it("closes from the back button", async () => {
    const { p } = board({ viewer: "parent" });
    fireEvent.click(screen.getByRole("button", { name: "Back to the Realm" }));
    expect(p.onClose).toHaveBeenCalled();
  });
});
