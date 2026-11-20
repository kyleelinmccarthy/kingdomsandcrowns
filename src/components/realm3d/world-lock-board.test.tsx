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
vi.mock("@/lib/actions/world-locks", () => ({ startWorldLockRun: vi.fn() }));
vi.mock("@/lib/utils/speech", () => ({ canSpeak: () => false, speak: vi.fn(), stopSpeaking: vi.fn() }));

import { answerDeedQuestion, completeDeedRun } from "@/lib/actions/deeds";
import { startWorldLockRun } from "@/lib/actions/world-locks";
import { WORLD_HERO_ONLY, WORLD_OPEN } from "@/lib/utils/deed-refusals";
import { CHEST_OPEN_LINE, DOOR_OPEN_LINE } from "@/lib/utils/world-lock-copy";
import type { RunSummary } from "@/lib/utils/deed-run-types";
import { WorldLockBoard } from "./world-lock-board";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { speechSynthesis: { cancel: () => void } }).speechSynthesis = { cancel: () => {} };
});

const CHEST = { id: "chest:west-lane", type: "chest" as const };
const DOOR = { id: "door:ringstones", type: "door" as const };

/** A chest's run of one lock, played here as a choice so the test needs no puzzle surface. */
const run = {
  runId: "lock-1",
  deed: { id: "chest:west-lane", title: "The old chest", story: "An old chest, shut with a puzzle for a lock.", area: "logic" as const },
  questions: [{ kind: "choice" as const, id: "q1", skillId: "logic-g45", prompt: "Which shape comes next?", view: { choices: ["circle", "square"] } }],
  responses: [null] as (string | null)[],
  kind: "world" as const,
  pending: null,
};
const opened = { objectId: "chest:west-lane", opened: true, rewards: [{ kind: "decor" as const, id: "stone-bench" as const }] };
const summary: RunSummary = {
  correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 0, previousBest: 0, deedBest: 0,
  counted: false, crowned: false, kind: "world", building: null, minutesEarned: 0, sideQuestPayFull: false, world: opened,
};

type Props = React.ComponentProps<typeof WorldLockBoard>;
function props(over: Partial<Props> = {}): Props {
  return { childId: "c1", object: CHEST, open: false, viewer: "child", numerals: true, profile: { readAloud: false, untimed: true }, calm: false, onOutcome: () => {}, onClose: () => {}, ...over };
}
const board = (over: Partial<Props> = {}) => render(<WorldLockBoard {...props(over)} />);

async function playToDone() {
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "circle" })));
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Done" })));
}

describe("a chest's or vault door's lock board", () => {
  it("starts the lock once for this hero and this chest, even mounted twice over", async () => {
    vi.mocked(startWorldLockRun).mockResolvedValue(run);
    await act(async () => void render(<StrictMode><WorldLockBoard {...props()} /></StrictMode>));
    expect(startWorldLockRun).toHaveBeenCalledTimes(1);
    expect(startWorldLockRun).toHaveBeenCalledWith("c1", "chest:west-lane");
    expect(screen.getByRole("heading", { name: "The old chest" })).toBeInTheDocument();
    expect(screen.getByText("Which shape comes next?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave the lock" })).toBeInTheDocument();
  });

  it("tells a visiting grown-up at a shut lock that locks are the hero's, and starts nothing", async () => {
    await act(async () => void board({ viewer: "parent" }));
    expect(startWorldLockRun).not.toHaveBeenCalled();
    expect(screen.getByText("Locks are for the hero to open.")).toBeInTheDocument();
    expect(WORLD_HERO_ONLY).toBe("Locks are for the hero to open.");
  });

  it("shows an open chest's line to the hero and to a visitor, and starts nothing", async () => {
    for (const viewer of ["child", "parent"] as const) {
      await act(async () => void board({ open: true, viewer }));
      expect(screen.getByText(CHEST_OPEN_LINE)).toBeInTheDocument();
      expect(screen.queryByText(WORLD_HERO_ONLY)).toBeNull();
      cleanup();
    }
    expect(CHEST_OPEN_LINE).toBe("You opened this chest. A new lock comes next week.");
    expect(startWorldLockRun).not.toHaveBeenCalled();
  });

  it("shows an open vault door's own line, under its own name", async () => {
    await act(async () => void board({ object: DOOR, open: true }));
    expect(screen.getByRole("heading", { name: "The vault door" })).toBeInTheDocument();
    expect(screen.getByText(DOOR_OPEN_LINE)).toBeInTheDocument();
    expect(DOOR_OPEN_LINE).toBe("The vault stands open. Its map is yours.");
    expect(startWorldLockRun).not.toHaveBeenCalled();
  });

  it("hands up a finished run's outcome, and keeps the result showing once the chest stands open", async () => {
    vi.mocked(startWorldLockRun).mockResolvedValue(run);
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "circle" });
    vi.mocked(completeDeedRun).mockResolvedValue(summary);
    const onOutcome = vi.fn();
    const view = render(<WorldLockBoard {...props({ onOutcome })} />);
    await act(async () => {});
    await playToDone();
    expect(completeDeedRun).toHaveBeenCalledWith("lock-1");
    expect(onOutcome).toHaveBeenCalledWith(opened);
    // The frame mirrors the opening, and the board is told the chest stands open: the result stays.
    view.rerender(<WorldLockBoard {...props({ onOutcome, open: true })} />);
    expect(screen.getByText("The chest opens!")).toBeInTheDocument();
    expect(screen.getByText(/Inside: a stone bench\. Look for it in the village\./)).toBeInTheDocument();
    expect(screen.queryByText(CHEST_OPEN_LINE)).toBeNull();
  });

  it("hands up nothing for a summary with no outcome", async () => {
    vi.mocked(startWorldLockRun).mockResolvedValue(run);
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "circle" });
    vi.mocked(completeDeedRun).mockResolvedValue({ ...summary, world: undefined });
    const onOutcome = vi.fn();
    await act(async () => void board({ onOutcome }));
    await playToDone();
    expect(onOutcome).not.toHaveBeenCalled();
  });

  it("says a finish that failed plainly, and keeps Done to press again (RG-n)", async () => {
    vi.mocked(startWorldLockRun).mockResolvedValue(run);
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "circle" });
    vi.mocked(completeDeedRun).mockRejectedValueOnce(new Error("database is locked")).mockResolvedValueOnce(summary);
    const onOutcome = vi.fn();
    await act(async () => void board({ onOutcome }));
    await playToDone();
    expect(screen.getByRole("alert")).toHaveTextContent("That didn't work.");
    expect(onOutcome).not.toHaveBeenCalled();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Done" })));
    expect(completeDeedRun).toHaveBeenCalledTimes(2);
    expect(onOutcome).toHaveBeenCalledWith(opened);
  });

  it("says a refused start plainly", async () => {
    vi.mocked(startWorldLockRun).mockRejectedValue(new Error(WORLD_OPEN));
    await act(async () => void board());
    expect(screen.getByRole("alert")).toHaveTextContent("That's already open.");
  });
});
