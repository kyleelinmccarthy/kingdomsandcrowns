import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/deeds", () => ({
  startDeedRun: vi.fn(),
  answerDeedQuestion: vi.fn(),
  retryDeedQuestion: vi.fn(),
  resolveDeedQuestion: vi.fn(),
  completeDeedRun: vi.fn(),
}));
vi.mock("@/lib/actions/world-locks", () => ({ startWorldLockRun: vi.fn(), startTowerRun: vi.fn() }));
vi.mock("@/lib/utils/speech", () => ({ canSpeak: () => false, speak: vi.fn(), stopSpeaking: vi.fn() }));

import { answerDeedQuestion, completeDeedRun } from "@/lib/actions/deeds";
import { startTowerRun } from "@/lib/actions/world-locks";
import { TOWER_SHUT, WORLD_LOCKS_OFF } from "@/lib/utils/deed-refusals";
import type { RunSummary } from "@/lib/utils/deed-run-types";
import type { TowerFloorView } from "@/lib/realm/world-state";
import { TowerBoard } from "./tower-board";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { speechSynthesis: { cancel: () => void } }).speechSynthesis = { cancel: () => {} };
});

/** Bottom first, as `towerFloors` gives them: the hero's own floor waits at the top. */
const THREE: TowerFloorView[] = [
  { band: "k1", open: true, solved: 4 },
  { band: "g23", open: true, solved: 0 },
  { band: "g45", open: false, solved: 0 },
];

/** A floor's run of one lock, played here as a choice so the test needs no puzzle surface. */
const run = {
  runId: "tower-1",
  deed: { id: "tower:g23", title: "The Puzzle Tower", story: "A bonus puzzle, just for the joy of it.", area: "logic" as const },
  questions: [{ kind: "choice" as const, id: "q1", skillId: "logic-g23", prompt: "Which shape comes next?", view: { choices: ["circle", "square"] } }],
  responses: [null] as (string | null)[],
  kind: "tower" as const,
  pending: null,
};
const solvedNow = { band: "g23" as const, solved: 1, solvedNow: true };
const summary: RunSummary = {
  correctCount: 1, total: 1, flawless: true, masteryChanges: [], stars: 0, previousBest: 0, deedBest: 0,
  counted: false, crowned: false, kind: "tower", building: null, minutesEarned: 0, sideQuestPayFull: false, tower: solvedNow,
};

type Props = React.ComponentProps<typeof TowerBoard>;
function props(over: Partial<Props> = {}): Props {
  return { childId: "c1", floors: THREE, viewer: "child", numerals: true, profile: { readAloud: false, untimed: true }, calm: false, onOutcome: () => {}, onClose: () => {}, ...over };
}
const board = (over: Partial<Props> = {}) => render(<TowerBoard {...props(over)} />);
const rows = () => screen.getAllByRole("listitem");

describe("the Puzzle Tower's board", () => {
  it("lists every floor it is given, top down, each by its position", () => {
    board();
    expect(rows()).toHaveLength(3);
    expect(rows().map((r) => within(r).getByRole("heading").textContent)).toEqual(["The third floor", "The second floor", "The first floor"]);
    expect(screen.getByRole("dialog", { name: "The Puzzle Tower" })).toBeInTheDocument();
  });

  it("lists one row per floor given, and no more: nothing above the hero's own is ever added", () => {
    board({ floors: [THREE[0]] });
    expect(rows()).toHaveLength(1);
    cleanup();
    board({ floors: [] });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("says a waiting floor's line exactly, and names no grade anywhere", () => {
    board();
    expect(screen.getByText("Earn 3 stars on a science side quest to open this floor.")).toBeInTheDocument();
    expect(screen.getAllByText("Earn 3 stars on a science side quest to open this floor.")).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/grade|kindergarten|\bband\b/i);
  });

  it("says what each open floor holds: its count with numerals, a plain line without, a new puzzle for none yet", () => {
    board();
    expect(screen.getByText("4 solved here.")).toBeInTheDocument();
    expect(screen.getByText("A new puzzle waits.")).toBeInTheDocument();
    cleanup();
    board({ numerals: false });
    expect(screen.getByText("You've solved puzzles here.")).toBeInTheDocument();
    expect(screen.queryByText("4 solved here.")).toBeNull();
  });

  it("gives the hero a Climb on each open floor and none on a waiting one", () => {
    board();
    const [third, second, first] = rows();
    expect(within(third).queryByRole("button")).toBeNull();
    expect(within(second).getByRole("button", { name: /climb/i })).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: /climb/i })).toBeInTheDocument();
  });

  it("gives a visiting grown-up no Climb at all, and still shows the floors", () => {
    board({ viewer: "parent" });
    expect(screen.queryByRole("button", { name: /climb/i })).toBeNull();
    expect(rows()).toHaveLength(3);
    expect(screen.getByText("4 solved here.")).toBeInTheDocument();
    expect(startTowerRun).not.toHaveBeenCalled();
  });

  it("gives no Climb when there is no hero to climb for", () => {
    board({ childId: null });
    expect(screen.queryByRole("button", { name: /climb/i })).toBeNull();
  });

  it("starts the floor's run once, for this hero and that floor's band", async () => {
    vi.mocked(startTowerRun).mockResolvedValue(run);
    board();
    await act(async () => void fireEvent.click(within(rows()[1]).getByRole("button", { name: /climb/i })));
    expect(startTowerRun).toHaveBeenCalledTimes(1);
    expect(startTowerRun).toHaveBeenCalledWith("c1", "g23");
    expect(screen.getByText("Which shape comes next?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave the puzzles" })).toBeInTheDocument();
  });

  it("hands up a finished run's outcome, and shows the result", async () => {
    vi.mocked(startTowerRun).mockResolvedValue(run);
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "circle" });
    vi.mocked(completeDeedRun).mockResolvedValue(summary);
    const onOutcome = vi.fn();
    board({ onOutcome });
    await act(async () => void fireEvent.click(within(rows()[1]).getByRole("button", { name: /climb/i })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "circle" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish puzzles" })));
    expect(completeDeedRun).toHaveBeenCalledWith("tower-1");
    expect(onOutcome).toHaveBeenCalledTimes(1);
    expect(onOutcome).toHaveBeenCalledWith(solvedNow);
    expect(screen.getByText("Floor solved!")).toBeInTheDocument();
    // A title alone: no empty line, and no lone subject seal, under it (G5 m4).
    expect(document.querySelector(".r3-result-line")).toBeNull();
  });

  it("hands up nothing for a summary with no outcome", async () => {
    vi.mocked(startTowerRun).mockResolvedValue(run);
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "circle" });
    vi.mocked(completeDeedRun).mockResolvedValue({ ...summary, tower: undefined });
    const onOutcome = vi.fn();
    board({ onOutcome });
    await act(async () => void fireEvent.click(within(rows()[1]).getByRole("button", { name: /climb/i })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "circle" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish puzzles" })));
    expect(onOutcome).not.toHaveBeenCalled();
  });

  it("goes back to the floors from a result, with the floors still there to climb again", async () => {
    vi.mocked(startTowerRun).mockResolvedValue(run);
    vi.mocked(answerDeedQuestion).mockResolvedValue({ correct: true, secondChance: false, answer: "circle" });
    vi.mocked(completeDeedRun).mockResolvedValue(summary);
    const onClose = vi.fn();
    board({ onClose });
    await act(async () => void fireEvent.click(within(rows()[1]).getByRole("button", { name: /climb/i })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "circle" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Finish puzzles" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Back to the floors" })));
    expect(onClose).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(3);
  });

  it("leaves the Realm from the floors", () => {
    const onClose = vi.fn();
    board({ onClose });
    fireEvent.click(screen.getByRole("button", { name: "Back to the Realm" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("says a refused start plainly, and stays on the floors", async () => {
    vi.mocked(startTowerRun).mockRejectedValue(new Error(TOWER_SHUT));
    board();
    await act(async () => void fireEvent.click(within(rows()[1]).getByRole("button", { name: /climb/i })));
    expect(screen.getByRole("alert")).toHaveTextContent("That floor isn't open yet.");
    expect(rows()).toHaveLength(3);
  });

  it("says the locks are resting when the grown-up has them off", async () => {
    vi.mocked(startTowerRun).mockRejectedValue(new Error(WORLD_LOCKS_OFF));
    board();
    await act(async () => void fireEvent.click(within(rows()[1]).getByRole("button", { name: /climb/i })));
    expect(screen.getByRole("alert")).toHaveTextContent("The locks are resting for now.");
  });
});
