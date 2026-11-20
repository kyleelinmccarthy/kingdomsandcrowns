import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TASK_CODECS } from "@/lib/tasks/codecs";
import { lockKind } from "@/lib/tasks/lock";
import { lockFor } from "@/lib/tasks/locks";
import { toClientTask } from "@/lib/tasks/registry";
import type { LockResponse } from "@/lib/tasks/lock-rules";
import { tokenName } from "@/lib/tasks/lock-shapes";
import type { ClientTask, LockTask } from "@/lib/tasks/types";
import { seededRng } from "@/lib/utils/drill-generators";
import { initialFlow, type FlowState } from "@/lib/utils/deed-run-flow";
import { speak } from "@/lib/utils/speech";
import { SORT } from "@/test/lock-stubs";
import { TaskPresenter } from "./presenters";

// Speech is spoken to a spy; nothing here can speak for real.
vi.mock("@/lib/utils/speech", async (orig) => ({ ...(await orig<typeof import("@/lib/utils/speech")>()), speak: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type Lock = Extract<ClientTask, { kind: "lock" }>;
type Puzzle = LockTask["puzzle"];

const SKILL: Record<Exclude<Puzzle, "sort">, string> = {
  pattern: "logic-k1", sort1: "logic-k1", shapes3: "logic-g23", balance: "logic-g23", sort2: "logic-g23",
  cage4: "logic-g45", logic3: "logic-g45", cage5: "logic-g912", nono5: "logic-g912", logic4: "logic-g912",
};

/** A real generated task of a puzzle: the first seed (from 1) whose draw at `level` is that puzzle (and passes `where`). */
function gen<P extends Exclude<Puzzle, "sort">>(puzzle: P, level = 0, where: (t: Extract<LockTask, { puzzle: P }>) => boolean = () => true): Extract<LockTask, { puzzle: P }> {
  for (let seed = 1; seed < 5000; seed++) {
    const t = lockFor(SKILL[puzzle])!(level, seededRng(seed), SKILL[puzzle]);
    if (t?.puzzle === puzzle && where(t as Extract<LockTask, { puzzle: P }>)) return t as Extract<LockTask, { puzzle: P }>;
  }
  throw new Error(`no ${puzzle}`);
}
const client = (t: LockTask) => toClientTask(t) as Lock;

const asking: FlowState = initialFlow({ questions: [{ id: "q1" }] as never, responses: [null], pending: null });
const secondChance = (first: string): FlowState => ({ ...asking, phase: "second-chance", ruledOut: [first], picked: first, result: { correct: false, secondChance: true, feedback: "rule_broken" } });
const missed = (t: LockTask): FlowState => ({
  ...asking, phase: "resolved", ruledOut: ["x"], result: { correct: false, secondChance: false, answer: "Here is one way it fits.", reveal: TASK_CODECS.lock.encode(t.solution) },
});

type Over = { task?: LockTask; flow?: FlowState; variant?: "board" | "page"; disabled?: boolean; calm?: boolean; numerals?: boolean; readAloud?: boolean };
function show(t: LockTask, over: Over = {}) {
  const onRespond = vi.fn();
  const props = (o: Over) => ({
    task: client(o.task ?? t), flow: o.flow ?? asking, variant: o.variant ?? ("board" as const), numerals: o.numerals ?? true,
    calm: o.calm ?? false, disabled: o.disabled ?? false, readAloud: o.readAloud, onRespond,
  });
  const view = render(<TaskPresenter {...props(over)} />);
  return { onRespond, container: view.container, rerender: (o: Over) => view.rerender(<TaskPresenter {...props({ ...over, ...o })} />) };
}

const check = () => screen.getByRole("button", { name: "Check the lock" });
const cell = (r: number, c: number) => screen.getByRole("button", { name: new RegExp(`^Row ${r + 1}, column ${c + 1}:`) });
const marked = (container: HTMLElement) => container.querySelectorAll("[data-broken='true']");

/** Taps a grid square until it shows `value` (cycling from blank). */
function tapTo(r: number, c: number, times: number) {
  for (let k = 0; k < times; k++) fireEvent.click(cell(r, c));
}

/** Enters a response on the face by tapping, the way a child would, for any puzzle. */
function enter(t: LockTask, r: LockResponse) {
  const v = client(t).view;
  switch (v.puzzle) {
    case "shapes3": case "cage4": case "cage5": case "nono5": {
      const side = v.puzzle === "shapes3" ? 3 : v.puzzle === "cage4" ? 4 : 5;
      const givens = v.puzzle === "nono5" ? undefined : v.givens;
      r.cells.forEach((x, i) => {
        if (givens?.[i]) return;
        tapTo(Math.floor(i / side), i % side, x);
      });
      return;
    }
    case "logic3": case "logic4":
      r.cells.forEach((x, row) => x > 0 && fireEvent.click(screen.getByRole("button", { name: `${v.rows[row]}, ${v.cols[x - 1]}: empty` })));
      return;
    case "pattern":
      r.cells.forEach((x, k) => {
        if (x === 0) return;
        const blanks = screen.getAllByRole("button", { name: /^Space \d+:/ });
        fireEvent.click(blanks[k]);
        fireEvent.click(screen.getByRole("button", { name: `Tray: ${tokenName(v.tray[x - 1])}` }));
      });
      return;
    case "balance":
      r.cells.forEach((x, i) => {
        if (x === 1) fireEvent.click(screen.getAllByRole("button", { name: /^Stone / })[i]);
      });
      return;
    case "sort1": case "sort2": case "sort": {
      const bins = v.puzzle === "sort1" ? v.bins : v.puzzle === "sort" ? v.categories : [0, 1, 2, 3].map((b) => `${v.rows[Math.floor(b / 2)]}, ${v.cols[b % 2]}`);
      r.cells.forEach((x) => {
        if (x === 0) return;
        // Items are placed in order, so the next one is always first among those left to sort.
        fireEvent.click(within(screen.getByRole("group", { name: "To sort" })).getAllByRole("button")[0]);
        fireEvent.click(screen.getByRole("button", { name: `Put in ${bins[x - 1]}` }));
      });
      return;
    }
  }
}

const ALL: LockTask[] = [
  gen("pattern"), gen("pattern", 4), gen("sort1"), gen("sort1", 2), gen("sort2", 2), gen("shapes3"), gen("balance"),
  gen("cage4"), gen("cage5"), gen("logic3"), gen("logic4"), gen("nono5"), SORT,
];

describe("the lock's face: each puzzle is solved by tapping, and sent in the lock's own form", () => {
  it.each(ALL.map((t) => [t.puzzle, t] as const))("%s: tapping in the solution sends it, and the server's parser takes it", (_, t) => {
    const { onRespond } = show(t);
    expect(screen.getByRole("heading", { name: "The lock" })).toBeInTheDocument();
    enter(t, t.solution);
    fireEvent.click(check());
    const sent = onRespond.mock.calls[0]?.[0];
    expect(sent).toBe(TASK_CODECS.lock.encode(t.solution));
    const parsed = lockKind.parseResponse(sent, t);
    expect(parsed).not.toBeNull();
    expect(lockKind.isCorrect(t, parsed!)).toBe(true);
  });

  it.each(ALL.map((t) => [t.puzzle, t] as const))("%s: Check the lock stays shut until the board is full", (_, t) => {
    const { onRespond } = show(t);
    expect(check()).toBeDisabled();
    // Everything but the last place.
    const cells = [...t.solution.cells];
    const last = t.puzzle === "balance" ? -1 : cells.findLastIndex((x, i) => x !== 0 && !isGivenAt(t, i));
    if (last >= 0) {
      enter(t, { ...t.solution, cells: cells.map((x, i) => (i === last ? 0 : x)) } as LockResponse);
      expect(check()).toBeDisabled();
      fireEvent.click(check());
      expect(onRespond).not.toHaveBeenCalled();
    }
  });

  it("works on the page as well as on the board", () => {
    const t = gen("cage4");
    const { onRespond } = show(t, { variant: "page" });
    enter(t, t.solution);
    fireEvent.click(check());
    expect(onRespond).toHaveBeenCalledWith(TASK_CODECS.lock.encode(t.solution));
  });
});

function isGivenAt(t: LockTask, i: number): boolean {
  return (t.puzzle === "shapes3" || t.puzzle === "cage4" || t.puzzle === "cage5") && !!t.givens?.[i];
}

describe("the rules are marked only after a check (R-F3)", () => {
  /** A cage4 board with the first row's first two squares swapped: full, and broken. */
  function brokenCage() {
    const t = gen("cage4");
    const cells = [...t.solution.cells];
    // Swap two open squares in one row so the row still holds 1..4 once but a column repeats.
    const open = [0, 1, 2, 3].filter((i) => !t.givens?.[i]);
    [cells[open[0]], cells[open[1]]] = [cells[open[1]], cells[open[0]]];
    return { t, wrong: { puzzle: "cage4", cells } as LockResponse };
  }

  it("a full but broken board shows no marks before the first check: the face is never a free solver", () => {
    const { t, wrong } = brokenCage();
    const { container } = show(t);
    enter(t, wrong);
    expect(marked(container)).toHaveLength(0);
    expect(screen.queryByText(/doesn't fit/)).toBeNull();
  });

  it("on a second chance it opens on the first try, with the broken rules marked, and will not send it again", () => {
    const { t, wrong } = brokenCage();
    const first = TASK_CODECS.lock.encode(wrong);
    const { container, onRespond } = show(t, { flow: secondChance(first) });
    // The first try is back on the board.
    expect(cell(0, 0).getAttribute("aria-label")).toMatch(new RegExp(`^Row 1, column 1: ${wrong.cells[0]}`));
    expect(marked(container).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /doesn't fit yet/ }).length).toBeGreaterThan(0);
    expect(check()).toBeDisabled();
    fireEvent.click(check());
    expect(onRespond).not.toHaveBeenCalled();
  });

  it("the marks follow the board live during the second chance, and clear once it fits", () => {
    const { t, wrong } = brokenCage();
    const { container, onRespond } = show(t, { flow: secondChance(TASK_CODECS.lock.encode(wrong)) });
    const side = 4;
    // Put the right values back by tapping each changed square round to its solution value.
    wrong.cells.forEach((x, i) => {
      const want = t.solution.cells[i];
      if (x === want) return;
      tapTo(Math.floor(i / side), i % side, (want - x + 5) % 5);
    });
    expect(marked(container)).toHaveLength(0);
    fireEvent.click(check());
    expect(onRespond).toHaveBeenCalledWith(TASK_CODECS.lock.encode(t.solution));
  });

  it("marks a logic grid's broken clue in the list", () => {
    const t = gen("logic3");
    const cells = t.solution.cells.map((x) => x);
    [cells[0], cells[1]] = [cells[1], cells[0]];
    show(t, { flow: secondChance(TASK_CODECS.lock.encode({ puzzle: "logic3", cells })) });
    const clues = screen.getAllByRole("listitem");
    expect(clues.some((li) => li.getAttribute("data-broken") === "true")).toBe(true);
  });

  it("a sort marks nothing on its second chance (RF-c): which bin is right is the answer", () => {
    const wrong = { puzzle: "sort", cells: [2, 2, 1, 1, 1] } as LockResponse;
    const { container } = show(SORT, { flow: secondChance(TASK_CODECS.lock.encode(wrong)) });
    expect(marked(container)).toHaveLength(0);
    expect(screen.queryByText(/marked rule|doesn't fit/)).toBeNull();
    // It opens on the first try: every item is in a bin.
    expect(within(screen.getByRole("group", { name: "To sort" })).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "fish, in Lives on land" })).toBeInTheDocument();
  });
});

describe("after a miss, the solved board (R-F2)", () => {
  it.each([gen("cage4"), gen("shapes3"), gen("logic3"), gen("nono5"), gen("sort1"), gen("pattern"), gen("balance")].map((t) => [t.puzzle, t] as const))(
    "%s: draws the reveal read-only, leaving its line to the player's feedback (said once, not twice)",
    (_, t) => {
      show(t, { flow: missed(t) });
      expect(screen.queryByText(/Here is one way it fits/)).toBeNull();
      expect(screen.getByRole("region", { name: "The lock" })).toHaveAttribute("data-solved", "true");
      for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Check the lock" })).toBeNull();
    },
  );

  it("the reveal shows the solution's values", () => {
    const t = gen("cage4");
    show(t, { flow: missed(t) });
    t.solution.cells.forEach((x, i) => expect(cell(Math.floor(i / 4), i % 4).getAttribute("aria-label")).toMatch(new RegExp(`^Row ${Math.floor(i / 4) + 1}, column ${(i % 4) + 1}: ${x}`)));
  });

  it("a nonogram's reveal fills its picture; a logic grid's ticks its matching", () => {
    const n = gen("nono5");
    show(n, { flow: missed(n) });
    n.solution.cells.forEach((x, i) => expect(cell(Math.floor(i / 5), i % 5).getAttribute("aria-label")).toContain(x === 1 ? ": filled" : ": empty"));
    cleanup();
    const l = gen("logic3");
    show(l, { flow: missed(l) });
    const v = client(l).view as Extract<Lock["view"], { puzzle: "logic3" }>;
    l.solution.cells.forEach((x, r) => expect(screen.getByRole("button", { name: `${v.rows[r]}, ${v.cols[x - 1]}: yes` })).toBeDisabled());
  });

  it("a right answer keeps the child's own board, read-only, with no reveal line", () => {
    const t = gen("cage4");
    const { rerender } = show(t);
    enter(t, t.solution);
    rerender({ flow: { ...asking, phase: "resolved", result: { correct: true, secondChance: false } } });
    expect(screen.queryByText("Here is one way it fits.")).toBeNull();
    expect(cell(0, 0).getAttribute("aria-label")).toMatch(new RegExp(`: ${t.solution.cells[0]}`));
    expect(cell(0, 0)).toBeDisabled();
  });
});

describe("keys on a grid", () => {
  it("number keys set a square, arrows move, and Backspace clears", () => {
    const t = gen("cage4");
    show(t);
    const open = t.solution.cells.findIndex((_, i) => !t.givens?.[i] && i % 4 < 3 && !t.givens?.[i + 1]);
    const [r, c] = [Math.floor(open / 4), open % 4];
    cell(r, c).focus();
    fireEvent.keyDown(cell(r, c), { key: "3" });
    expect(cell(r, c).getAttribute("aria-label")).toMatch(/: 3/);
    fireEvent.keyDown(cell(r, c), { key: "ArrowRight" });
    expect(cell(r, c + 1)).toHaveFocus();
    fireEvent.keyDown(cell(r, c + 1), { key: "2" });
    expect(cell(r, c + 1).getAttribute("aria-label")).toMatch(/: 2/);
    fireEvent.keyDown(cell(r, c + 1), { key: "ArrowLeft" });
    fireEvent.keyDown(cell(r, c), { key: "Backspace" });
    expect(cell(r, c).getAttribute("aria-label")).toMatch(/: empty/);
    // A number past the grid's largest does nothing.
    fireEvent.keyDown(cell(r, c), { key: "9" });
    expect(cell(r, c).getAttribute("aria-label")).toMatch(/: empty/);
  });

  it("a given never changes, by tap or by key", () => {
    const t = gen("cage4");
    const g = t.givens!.findIndex((x) => x !== 0);
    show(t);
    const square = cell(Math.floor(g / 4), g % 4);
    expect(square.getAttribute("aria-label")).toMatch(new RegExp(`: ${t.givens![g]}, given`));
    fireEvent.click(square);
    fireEvent.keyDown(square, { key: "1" });
    expect(square.getAttribute("aria-label")).toMatch(new RegExp(`: ${t.givens![g]}, given`));
  });

  it("one square at a time is in the tab order, and it follows the arrows", () => {
    const t = gen("cage5");
    show(t);
    const squares = screen.getAllByRole("button", { name: /^Row \d, column \d:/ });
    expect(squares.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    squares[0].focus();
    fireEvent.keyDown(squares[0], { key: "ArrowDown" });
    expect(cell(1, 0)).toHaveFocus();
    expect(cell(1, 0).tabIndex).toBe(0);
  });

  it("a nonogram square takes 1 to fill and 2 to mark", () => {
    const t = gen("nono5");
    show(t);
    cell(0, 0).focus();
    fireEvent.keyDown(cell(0, 0), { key: "1" });
    expect(cell(0, 0).getAttribute("aria-label")).toBe("Row 1, column 1: filled");
    fireEvent.click(cell(0, 0));
    expect(cell(0, 0).getAttribute("aria-label")).toBe("Row 1, column 1: marked empty");
    fireEvent.click(cell(0, 0));
    expect(cell(0, 0).getAttribute("aria-label")).toBe("Row 1, column 1: empty");
  });
});

describe("the Realm's keys stay out of the lock", () => {
  it.each([gen("cage4"), gen("logic3"), gen("pattern"), gen("sort1"), gen("balance")].map((t) => [t.puzzle, t] as const))("%s: the face's own keys never reach the window; Esc still does, to close the board", (_, t) => {
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    try {
      show(t);
      const target = screen.getAllByRole("button").find((b) => !(b as HTMLButtonElement).disabled)!;
      for (const key of ["1", "3", "0", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", " ", "Enter", "Backspace", "Delete"]) fireEvent.keyDown(target, { key });
      expect(onWindowKey).not.toHaveBeenCalled();
      fireEvent.keyDown(target, { key: "Escape" });
      expect(onWindowKey).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", onWindowKey);
    }
  });
});

describe("a nonogram's marks are the child's notes, never a new answer", () => {
  it("a mark is sent as empty, so marking on a second chance never makes the first try new", () => {
    const t = gen("nono5");
    const first = TASK_CODECS.lock.encode(t.solution);
    const { onRespond } = show(t, { flow: secondChance(first) });
    const blank = t.solution.cells.findIndex((x) => x === 0);
    const square = cell(Math.floor(blank / 5), blank % 5);
    fireEvent.click(square);
    expect(square.getAttribute("aria-label")).toMatch(/: filled/);
    fireEvent.click(square);
    expect(square.getAttribute("aria-label")).toMatch(/: marked empty/);
    expect(check()).toBeDisabled();
    fireEvent.click(check());
    expect(onRespond).not.toHaveBeenCalled();
  });

  it("the same filled picture with marks is the same response, so the server refuses it as a repeat", () => {
    const t = gen("nono5");
    const { onRespond } = show(t);
    enter(t, { puzzle: "nono5", cells: t.solution.cells.map((x) => (x === 1 ? 1 : 2)) } as LockResponse);
    fireEvent.click(check());
    const sent = onRespond.mock.calls[0][0];
    expect(sent).toBe(TASK_CODECS.lock.encode(t.solution));
    expect(sent).not.toMatch(/2/);
    expect(lockKind.sameResponse(lockKind.decode(sent)!, t.solution)).toBe(true);
  });
});

describe("focus", () => {
  it("starts on the first open square, never on a given", () => {
    const t = gen("cage4", 0, (x) => !!x.givens?.[0]);
    show(t);
    const first = t.givens!.findIndex((x) => x === 0);
    expect(cell(Math.floor(first / 4), first % 4)).toHaveFocus();
    expect(cell(Math.floor(first / 4), first % 4).tabIndex).toBe(0);
  });

  it("a sort hands focus to the next item to sort after a placement, and to the item sent back", () => {
    const t = gen("sort1");
    show(t);
    const tray = () => within(screen.getByRole("group", { name: "To sort" })).getAllByRole("button");
    fireEvent.click(tray()[0]);
    fireEvent.click(screen.getByRole("button", { name: `Put in ${t.bins[0]}` }));
    expect(tray()[0]).toHaveFocus();
    const placed = screen.getByRole("button", { name: `${tokenName(t.items[0])}, in ${t.bins[0]}` });
    fireEvent.click(placed);
    expect(tray()[0]).toHaveFocus();
    expect(tray()[0].getAttribute("aria-label")).toBe(tokenName(t.items[0]));
    // With nothing left to sort, focus stays on the item just placed.
    enter(t, t.solution);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/, in /);
  });
});

describe("every square and every shape is named", () => {
  it("a shape grid's squares say their row, column and shape, never a number", () => {
    const t = gen("shapes3");
    show(t);
    const g = t.givens.findIndex((x) => x !== 0);
    expect(cell(Math.floor(g / 3), g % 3).getAttribute("aria-label")).toBe(`Row ${Math.floor(g / 3) + 1}, column ${(g % 3) + 1}: ${tokenName(t.symbols[t.givens[g] - 1])}, given`);
    const o = t.givens.findIndex((x) => x === 0);
    fireEvent.click(cell(Math.floor(o / 3), o % 3));
    expect(cell(Math.floor(o / 3), o % 3).getAttribute("aria-label")).toBe(`Row ${Math.floor(o / 3) + 1}, column ${(o % 3) + 1}: ${tokenName(t.symbols[0])}`);
  });

  it("a shape grid's legend shows the key for each shape", () => {
    const t = gen("shapes3");
    const { container } = show(t);
    expect([...container.querySelectorAll(".lock-legend-key")].map((k) => k.textContent)).toEqual(["1", "2", "3"]);
  });

  it("a nonogram's clue says it doesn't fit yet in text a screen reader reads", () => {
    const t = gen("nono5");
    const wrong = { puzzle: "nono5", cells: t.solution.cells.map((x, i) => (i < 5 ? 1 : x)) } as LockResponse;
    const { container } = show(t, { flow: secondChance(TASK_CODECS.lock.encode(wrong)) });
    const clue = container.querySelector(".lock-clue-row[data-broken='true']")!;
    expect(clue).not.toBeNull();
    expect(clue.hasAttribute("aria-label")).toBe(false);
    expect(clue.textContent).toMatch(/^Row 1 clue: .*, doesn't fit yet$/);
  });

  it("a cage square names its cage", () => {
    const t = gen("cage4");
    show(t);
    expect(cell(0, 0).getAttribute("aria-label")).toMatch(/cage \d+/);
  });

  it("a pattern's shown shapes are pictures with names, and sizes are clearly apart", () => {
    const t = gen("pattern");
    const { container } = show(t);
    const shown = t.sequence.flatMap((s, i) => (s ? [[s, i] as const] : []));
    for (const [s, i] of shown) expect(screen.getByRole("img", { name: `Space ${i + 1}: ${tokenName(s)}` })).toBeInTheDocument();
    expect(container.querySelector("svg[aria-label]")).toBeNull();
  });

  it("draws a big shape at least 1.6 times a small one", () => {
    const t = gen("sort1", 2, (x) => x.items.some((i) => i.size === "big") && x.items.some((i) => i.size === "small"));
    const { container } = show(t);
    const scales = [...container.querySelectorAll<SVGElement>("svg[data-size]")].map((s) => [s.dataset.size, Number(s.dataset.scale)] as const);
    const big = scales.find(([s]) => s === "big")?.[1];
    const small = scales.find(([s]) => s === "small")?.[1];
    expect(big).toBeDefined();
    expect(small).toBeDefined();
    expect(big! / small!).toBeGreaterThanOrEqual(1.6);
  });

  it("a sort's bins and items are labelled, and a placed item comes back with a tap", () => {
    const t = gen("sort2", 2);
    show(t);
    const v = client(t).view as Extract<Lock["view"], { puzzle: "sort2" }>;
    for (const r of v.rows) for (const c of v.cols) expect(screen.getByRole("button", { name: `Put in ${r}, ${c}` })).toBeInTheDocument();
    const first = within(screen.getByRole("group", { name: "To sort" })).getAllByRole("button")[0];
    const name = first.getAttribute("aria-label")!;
    expect(name).toBe(tokenName(v.items[0]));
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: `Put in ${v.rows[0]}, ${v.cols[0]}` }));
    const placed = screen.getByRole("button", { name: `${name}, in ${v.rows[0]}, ${v.cols[0]}` });
    fireEvent.click(placed);
    expect(within(screen.getByRole("group", { name: "To sort" })).getAllByRole("button")[0].getAttribute("aria-label")).toBe(name);
  });

  it("a subject sort's items are its words", () => {
    show(SORT);
    for (const item of SORT.items) expect(within(screen.getByRole("group", { name: "To sort" })).getByRole("button", { name: item.label })).toHaveTextContent(item.label);
  });
});

describe("read-aloud on a sort", () => {
  const tray = () => within(screen.getByRole("group", { name: "To sort" })).getAllByRole("button");

  it("a word sort speaks exactly the picked word, once, when read-aloud is on", () => {
    show(SORT, { readAloud: true });
    fireEvent.click(screen.getByRole("button", { name: "dog" }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith("dog");
  });

  it("the keyboard path speaks too: a pick is a button press", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    show(SORT, { readAloud: true });
    screen.getByRole("button", { name: "horse" }).focus();
    await user.keyboard("{Enter}");
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith("horse");
  });

  it.each([[false], [undefined]])("a word sort speaks nothing when read-aloud is %s", (readAloud) => {
    show(SORT, { readAloud });
    fireEvent.click(screen.getByRole("button", { name: "dog" }));
    expect(speak).not.toHaveBeenCalled();
  });

  it("a shape sort stays silent, read-aloud or not", () => {
    show(gen("sort1"), { readAloud: true });
    fireEvent.click(tray()[0]);
    expect(speak).not.toHaveBeenCalled();
  });

  it("putting a word in a bin and sending it back speak nothing", () => {
    show(SORT, { readAloud: true });
    fireEvent.click(screen.getByRole("button", { name: "fish" }));
    vi.mocked(speak).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Put in Lives in water" }));
    fireEvent.click(screen.getByRole("button", { name: "fish, in Lives in water" }));
    expect(speak).not.toHaveBeenCalled();
  });

  it("putting the picked word down again (a second tap) speaks nothing", () => {
    show(SORT, { readAloud: true });
    const fish = screen.getByRole("button", { name: "fish" });
    fireEvent.click(fish);
    vi.mocked(speak).mockClear();
    fireEvent.click(fish);
    expect(speak).not.toHaveBeenCalled();
  });

  it("a read-only face (busy, or resolved) speaks nothing", () => {
    show(SORT, { readAloud: true, disabled: true });
    fireEvent.click(screen.getByRole("button", { name: "dog" }));
    cleanup();
    show(SORT, { readAloud: true, flow: missed(SORT) });
    for (const b of screen.queryAllByRole("button")) fireEvent.click(b);
    expect(speak).not.toHaveBeenCalled();
  });
});

describe("the balance", () => {
  it("shows the weight to match and what is on the pan", () => {
    const t = gen("balance");
    show(t);
    expect(screen.getByText(`${t.target} ${t.unit}`)).toBeInTheDocument();
    const stones = screen.getAllByRole("button", { name: /^Stone / });
    fireEvent.click(stones[0]);
    expect(stones[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(`Your pan: ${t.weights[0]}`)).toBeInTheDocument();
    fireEvent.click(stones[0]);
    expect(stones[0]).toHaveAttribute("aria-pressed", "false");
  });

  it("without numerals, the pans say which side is heavier instead of a total", () => {
    const t = gen("balance");
    show(t, { numerals: false });
    fireEvent.click(screen.getAllByRole("button", { name: /^Stone / })[0]);
    expect(screen.queryByText(/Your pan: \d/)).toBeNull();
    expect(screen.getByText(/heavier|level/)).toBeInTheDocument();
  });
});

describe("calm play and the busy player", () => {
  it("nothing moves when calm", () => {
    const t = gen("pattern");
    const { container, rerender } = show(t, { calm: true });
    expect(container.querySelector(".lock--move")).toBeNull();
    rerender({ calm: false });
    expect(container.querySelector(".lock--move")).not.toBeNull();
  });

  it("while the player is busy, nothing can be pressed", () => {
    const t = gen("cage4");
    show(t, { disabled: true });
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
  });

  it("a fresh board for each task: nothing carries over", () => {
    const a = gen("cage4");
    const b = gen("cage4", 4);
    const { rerender } = show(a);
    enter(a, a.solution);
    expect(check()).toBeEnabled();
    rerender({ task: b, flow: { ...asking, index: 1 } });
    expect(check()).toBeDisabled();
    expect(cell(0, 0).getAttribute("aria-label")).toMatch(b.givens?.[0] ? /given/ : /: empty/);
  });
});
