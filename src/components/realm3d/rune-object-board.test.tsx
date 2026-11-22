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
vi.mock("@/lib/actions/rune-objects", () => ({ startRuneObjectRun: vi.fn() }));
vi.mock("@/lib/utils/speech", () => ({ canSpeak: () => false, speak: vi.fn(), stopSpeaking: vi.fn() }));

import { answerDeedQuestion, completeDeedRun } from "@/lib/actions/deeds";
import { startRuneObjectRun } from "@/lib/actions/rune-objects";
import { runeObjectById } from "@/lib/realm/rune-objects";
import { toClientTask } from "@/lib/tasks/registry";
import { RUNE_CAST, RUNE_HOLDS_LINE, RUNE_HOLDS_LINE_VISITOR, RUNE_NOT_NOW, RUNE_READING, RUNE_STORY, RUNE_TITLE } from "@/lib/tasks/rune-copy";
import { RUNE_HERO_ONLY, RUNES_OFF } from "@/lib/utils/deed-refusals";
import { HELD } from "@/test/object-start";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import { runeStub } from "@/test/rune-stubs";
import { RuneObjectBoard } from "./rune-object-board";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { speechSynthesis: { cancel: () => void } }).speechSynthesis = { cancel: () => {} };
});

const WAGON = runeObjectById("rune:west-wagon")!;

/** A rune object's run of one word, as the server starts it: the stub dictation, tiles d m a e n i. */
const run: RunStart = {
  runId: "rune-1",
  deed: { id: "rune:west-wagon", title: RUNE_TITLE, story: RUNE_STORY, area: "language" },
  questions: [toClientTask(runeStub())],
  responses: [null],
  kind: "world",
  pending: null,
};
const fixedNow = [{ objectId: "rune:west-wagon", fixed: true }];
const summary: RunSummary = {
  correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 0, previousBest: 0, deedBest: 0,
  counted: false, crowned: false, kind: "world", building: null, minutesEarned: 0, sideQuestPayFull: false, runes: fixedNow,
};

type Props = React.ComponentProps<typeof RuneObjectBoard>;
function props(over: Partial<Props> = {}): Props {
  return { childId: "c1", object: WAGON, fixed: false, viewer: "child", numerals: true, profile: { readAloud: false, untimed: true }, calm: false, onOutcome: () => {}, onClose: () => {}, ...over };
}
const board = (over: Partial<Props> = {}) => render(<RuneObjectBoard {...props(over)} />);

/** Build "mend" from the tray (m, e, n, d) and cast it. */
async function buildAndCast() {
  for (const t of ["m", "e", "n", "d"]) await act(async () => void fireEvent.click(screen.getByRole("button", { name: t })));
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: RUNE_CAST })));
}
async function castToDone() {
  await buildAndCast();
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Done" })));
}
function answeredRight() {
  vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "The word was mend." });
  vi.mocked(completeDeedRun).mockResolvedValue(summary);
}

describe("a rune object's board", () => {
  it("starts the run once for this hero and this object, even mounted twice over, and shows the stone", async () => {
    vi.mocked(startRuneObjectRun).mockResolvedValue(run);
    await act(async () => void render(<StrictMode><RuneObjectBoard {...props()} /></StrictMode>));
    expect(startRuneObjectRun).toHaveBeenCalledTimes(1);
    expect(startRuneObjectRun).toHaveBeenCalledWith("c1", "rune:west-wagon");
    expect(screen.getByRole("heading", { name: RUNE_TITLE })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "The rune stone" })).toBeInTheDocument();
  });

  it("says the stone is stirring while it asks the server, with the object's story for a broken one", async () => {
    vi.mocked(startRuneObjectRun).mockReturnValue(new Promise(() => {}));
    board();
    expect(screen.getByRole("status")).toHaveTextContent(RUNE_READING);
    expect(RUNE_READING).toBe("The rune stone stirs…");
    expect(screen.getByText(RUNE_STORY)).toBeInTheDocument();
  });

  it("a right cast's finish calls onOutcome with the fix, and keeps the result showing", async () => {
    vi.mocked(startRuneObjectRun).mockResolvedValue(run);
    answeredRight();
    const onOutcome = vi.fn();
    await act(async () => void board({ onOutcome }));
    await castToDone();
    expect(answerDeedQuestion).toHaveBeenCalledWith("rune-1", 0, "r:1,3,4,0");
    expect(completeDeedRun).toHaveBeenCalledWith("rune-1");
    expect(onOutcome).toHaveBeenCalledTimes(1);
    expect(onOutcome).toHaveBeenCalledWith(fixedNow);
    expect(screen.getByText("The rune works!")).toBeInTheDocument();
  });

  it("hands up nothing but an empty list for a summary with no fixes", async () => {
    vi.mocked(startRuneObjectRun).mockResolvedValue(run);
    answeredRight();
    vi.mocked(completeDeedRun).mockResolvedValue({ ...summary, runes: undefined });
    const onOutcome = vi.fn();
    await act(async () => void board({ onOutcome }));
    await castToDone();
    expect(onOutcome).toHaveBeenCalledWith([]);
  });

  it("a run of one word shows no progress dots, no minutes and no skill meter: there is nothing to count (smoke, final review)", async () => {
    vi.mocked(startRuneObjectRun).mockResolvedValue(run);
    vi.mocked(answerDeedQuestion).mockResolvedValue({
      correct: false, secondChance: true, hint: "It rhymes with send.", feedback: "wrong_word", firstPick: "r:1,2,4,0",
      meter: { skillLabel: "Vocabulary", filled: 1, needed: 7 },
    } as never);
    const { container } = await act(async () => board({ profile: { readAloud: false, untimed: false } }));
    expect(container.querySelector(".r3-run-dots")).toBeNull();
    expect(container.querySelector(".r3-run-time")).toBeNull();
    for (const t of ["m", "a", "n", "d"]) await act(async () => void fireEvent.click(screen.getByRole("button", { name: t })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: RUNE_CAST })));
    expect(screen.getByText("Not that word. It rhymes with send.")).toBeInTheDocument();
    expect(container.querySelector(".deed-meter")).toBeNull();
    expect(screen.queryByText("Vocabulary")).toBeNull();
    // Leave is still there.
    expect(screen.getByRole("button", { name: "Leave the rune" })).toBeInTheDocument();
  });

  it("the run's finish button reads Done and its leave link reads Leave the rune", async () => {
    vi.mocked(startRuneObjectRun).mockResolvedValue(run);
    answeredRight();
    await act(async () => void board());
    expect(screen.getByRole("button", { name: "Leave the rune" })).toBeInTheDocument();
    await buildAndCast();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  describe("an object drawn fixed is still asked about (RI-a / S20)", () => {
    it("the hero's board calls startRuneObjectRun, and the held answer shows the holds line and reports nothing", async () => {
      vi.mocked(startRuneObjectRun).mockResolvedValue(HELD);
      const onOutcome = vi.fn();
      await act(async () => void board({ fixed: true, onOutcome }));
      expect(startRuneObjectRun).toHaveBeenCalledWith("c1", "rune:west-wagon");
      expect(screen.getByText(RUNE_HOLDS_LINE)).toBeInTheDocument();
      expect(RUNE_HOLDS_LINE).toBe("The rune holds. In a few days it will need a fresh one.");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(onOutcome).not.toHaveBeenCalled();
    });

    it("a run that starts (the object broke overnight) is played at once", async () => {
      vi.mocked(startRuneObjectRun).mockResolvedValue(run);
      await act(async () => void board({ fixed: true }));
      expect(startRuneObjectRun).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("group", { name: "The rune stone" })).toBeInTheDocument();
      expect(screen.queryByText(RUNE_HOLDS_LINE)).toBeNull();
    });

    it("does not call the object waiting while it asks", () => {
      vi.mocked(startRuneObjectRun).mockReturnValue(new Promise(() => {}));
      board({ fixed: true });
      expect(screen.getByRole("status")).toHaveTextContent(RUNE_READING);
      expect(screen.queryByText(RUNE_STORY)).toBeNull();
    });
  });

  it("a held answer at an object drawn broken reports already-fixed and shows the holds line", async () => {
    vi.mocked(startRuneObjectRun).mockResolvedValue(HELD);
    const onOutcome = vi.fn();
    await act(async () => void board({ onOutcome }));
    expect(onOutcome).toHaveBeenCalledTimes(1);
    expect(onOutcome).toHaveBeenCalledWith([{ objectId: "rune:west-wagon", fixed: false, reason: "already-fixed" }]);
    expect(screen.getByText(RUNE_HOLDS_LINE)).toBeInTheDocument();
  });

  it("says the runes are resting plainly, and reports nothing", async () => {
    vi.mocked(startRuneObjectRun).mockRejectedValue(new Error(RUNES_OFF));
    const onOutcome = vi.fn();
    await act(async () => void board({ onOutcome }));
    expect(screen.getByRole("alert")).toHaveTextContent("The runes are resting for now.");
    expect(onOutcome).not.toHaveBeenCalled();
  });

  it("a grown-up sees the visitor's holds line at a fixed object and the hero-only line at a broken one, and nothing is called", async () => {
    await act(async () => void board({ viewer: "parent", fixed: true }));
    expect(screen.getByText(RUNE_HOLDS_LINE_VISITOR)).toBeInTheDocument();
    expect(RUNE_HOLDS_LINE_VISITOR).toBe("The rune holds here.");
    cleanup();
    await act(async () => void board({ viewer: "parent" }));
    expect(screen.getByText(RUNE_HERO_ONLY)).toBeInTheDocument();
    expect(RUNE_HERO_ONLY).toBe("Runes are for the hero to cast.");
    expect(startRuneObjectRun).not.toHaveBeenCalled();
    expect(screen.queryByText(/Locks are for the hero/)).toBeNull();
  });

  it("a child view with no hero named says the not-now line and asks nothing", async () => {
    await act(async () => void board({ childId: null }));
    expect(screen.getByText(RUNE_NOT_NOW)).toBeInTheDocument();
    expect(RUNE_NOT_NOW).toBe("No rune can be cast here just now.");
    expect(startRuneObjectRun).not.toHaveBeenCalled();
  });
});
