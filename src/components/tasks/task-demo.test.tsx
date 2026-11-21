import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunStart } from "@/lib/utils/deed-run-types";
import type { ClientTask } from "@/lib/tasks/types";
import { demoKeyOf, demoKind } from "@/lib/tasks/demos";
import { LockDemo, lockDemoCopy } from "./lock-demo";
import { TaskDemo, taskDemoCopy, useTaskDemo } from "./task-demo";

afterEach(cleanup);

const PATTERN = "Pip fits the next shape: red, blue, red, blue, … red!";
const SORT = "Pip puts each shape where it belongs.";
const WORDS = "Pip reads each word and puts it where it belongs: a dog is living, a stone is not.";
const SHAPES = "Pip puts each shape once in every row and every column.";
const BALANCE = "Pip puts stones on the pan until both sides weigh the same.";
const TRAIL = "Watch Pip follow a clue. The clue says: Go to the well. Pip reads it, walks to the well, and searches there. Found it!";
const ASSEMBLE = "Aldo needs a beam 5 feet long. He fits a 2-foot piece and a 3-foot piece: 2 + 3 = 5. Now you try!";

const bench = (mode: "assemble" | "cut"): ClientTask => ({ kind: "measure", id: "m1", skillId: "s", prompt: "p", view: { mode, unit: "ft" } });
const choice: ClientTask = { kind: "choice", id: "q", skillId: "s", prompt: "p", view: { choices: ["a"] } };
const lock = (view: Extract<ClientTask, { kind: "lock" }>["view"]): ClientTask => ({ kind: "lock", id: `l-${view.puzzle}`, skillId: "logic-k1", prompt: "p", view });
const pattern = lock({ puzzle: "pattern", sequence: [{ shape: "circle", color: "red" }, null], tray: [{ shape: "circle", color: "red" }] });
const sort1 = lock({ puzzle: "sort1", items: [{ shape: "circle", color: "red" }], bins: ["Red", "Blue"] });
const sort2 = lock({ puzzle: "sort2", items: [{ shape: "circle", color: "red" }], rows: ["Circles", "Stars"], cols: ["Red", "Blue"] });
const balance = lock({ puzzle: "balance", weights: [1, 2], target: 3 });
const wordSort = lock({ puzzle: "sort", categories: ["Alive", "Not alive"], items: [{ id: "r", label: "rock" }] });
const shapes3 = lock({ puzzle: "shapes3", symbols: [{ shape: "circle", color: "red" }], givens: [1, 0, 0, 0, 0, 0, 0, 0, 0] });
const cage4 = lock({ puzzle: "cage4", cages: [] });
const clue: ClientTask = { kind: "trail", id: "read-g1:trail:0a1b2c3d", skillId: "read-g1", prompt: "Go to the mill.", view: {} };
const rune: ClientTask = { kind: "rune", id: "lang-gk:rune:4e1f0a9c", skillId: "lang-gk", prompt: "The wagon is broken. Build the word you hear.", view: { effect: "mend", object: { id: "rune:west-wagon", label: "the broken wagon" }, tiles: ["d", "m", "a", "e", "n", "i"], listen: true } };
const RUNE = "Watch Pip build a rune. Pip hears the word hop, taps h, then o, then p, and casts it. It works!";

describe("LockDemo: Watch Pip", () => {
  it("shows Pip fitting the pattern, with a heading, a named picture and a Got it button that has focus", () => {
    render(<LockDemo mode="pattern" calm={false} onDone={() => {}} />);
    expect(screen.getByRole("heading", { name: "Watch Pip" })).toBeInTheDocument();
    expect(screen.getByText(PATTERN)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /red circle fitted in the gap/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toHaveFocus();
  });

  it("shows Pip sorting, and hands over on Got it", () => {
    const onDone = vi.fn();
    render(<LockDemo mode="sort" calm onDone={onDone} variant="page" />);
    expect(screen.getByText(SORT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("draws nothing that moves when calm", () => {
    const { container, rerender } = render(<LockDemo mode="pattern" calm onDone={() => {}} />);
    expect(container.querySelector(".lock--move")).toBeNull();
    rerender(<LockDemo mode="pattern" calm={false} onDone={() => {}} />);
    expect(container.querySelector(".lock--move")).not.toBeNull();
  });

  it("says its words for read-aloud", () => {
    expect(lockDemoCopy("pattern")).toBe(PATTERN);
    expect(lockDemoCopy("sort")).toBe(SORT);
    expect(lockDemoCopy("words")).toBe(WORDS);
    expect(lockDemoCopy("shapes")).toBe(SHAPES);
    expect(lockDemoCopy("balance")).toBe(BALANCE);
  });

  it.each([["words", WORDS], ["shapes", SHAPES], ["balance", BALANCE]] as const)("shows Pip's %s lock, with a named picture", (mode, words) => {
    render(<LockDemo mode={mode} calm onDone={() => {}} />);
    expect(screen.getByRole("heading", { name: "Watch Pip" })).toBeInTheDocument();
    expect(screen.getByText(words)).toBeInTheDocument();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBeTruthy();
  });
});

describe("which demo a task has (demoKeyOf)", () => {
  it("Aldo for a bench task's mode; Pip for every lock a K–3 hero can meet (RF-g); none for the rest", () => {
    expect([bench("assemble"), bench("cut")].map(demoKeyOf)).toEqual(["assemble", "cut"]);
    expect([pattern, sort1, sort2, wordSort, shapes3, balance].map(demoKeyOf)).toEqual(["pattern", "sort", "sort", "words", "shapes", "balance"]);
    expect([cage4, choice, undefined].map(demoKeyOf)).toEqual([null, null, null]);
  });

  it("each demo belongs to one hands-on kind (demoKind)", () => {
    expect(demoKind("assemble")).toBe("measure");
    expect(demoKind("cut")).toBe("measure");
    for (const key of ["pattern", "sort", "words", "shapes", "balance"] as const) expect(demoKind(key)).toBe("lock");
    expect(demoKind("trail")).toBe("trail");
  });
});

describe("TaskDemo picks the demo by kind and puzzle", () => {
  it("the bench's demo is unchanged", () => {
    render(<TaskDemo demo="assemble" calm onDone={() => {}} />);
    expect(screen.getByRole("heading", { name: "Watch Aldo" })).toBeInTheDocument();
    expect(screen.getByText(ASSEMBLE)).toBeInTheDocument();
    expect(taskDemoCopy("assemble")).toBe(ASSEMBLE);
  });

  it("a lock's is Pip's", () => {
    render(<TaskDemo demo="sort" calm variant="page" onDone={() => {}} />);
    expect(screen.getByRole("heading", { name: "Watch Pip" })).toBeInTheDocument();
    expect(taskDemoCopy("pattern")).toBe(PATTERN);
  });
});

describe("Watch Pip follow a clue (R-H16)", () => {
  it("a clue's demo is the trail's", () => {
    expect(demoKeyOf(clue)).toBe("trail");
  });

  it("shows Pip's steps, says its words, and Got it, with the focus, hands over", () => {
    const onDone = vi.fn();
    render(<TaskDemo demo="trail" calm onDone={onDone} />);
    expect(screen.getByRole("heading", { name: "Watch Pip" })).toBeInTheDocument();
    expect(screen.getByText(TRAIL)).toBeInTheDocument();
    expect(taskDemoCopy("trail")).toBe(TRAIL);
    const steps = screen.getByRole("list", { name: "What Pip does" });
    expect(within(steps).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Read the clue", "Walk to the well", "Search there"]);
    const go = screen.getByRole("button", { name: "Got it" });
    expect(go).toHaveFocus();
    fireEvent.click(go);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("on the page too, and draws nothing that moves when calm", () => {
    const { container, rerender } = render(<TaskDemo demo="trail" calm variant="page" onDone={() => {}} />);
    expect(container.querySelector(".trail--page")).not.toBeNull();
    expect(container.querySelector(".trail--move")).toBeNull();
    rerender(<TaskDemo demo="trail" calm={false} variant="page" onDone={() => {}} />);
    expect(container.querySelector(".trail--move")).not.toBeNull();
  });

  it("shows before a run's first clue", () => {
    const { result } = renderHook(() => useTaskDemo({ questions: [clue, clue], demo: { at: 0 } } as unknown as RunStart, 0));
    expect(result.current.demo).toBe("trail");
  });
});

describe("useTaskDemo", () => {
  const run = (over: Partial<RunStart> = {}) => ({ questions: [bench("cut")], demo: { at: 0 }, ...over }) as RunStart;

  it("shows the demo task's own demo once: after Got it it stays done", () => {
    const { result, rerender } = renderHook(({ r }) => useTaskDemo(r, 0), { initialProps: { r: run() } });
    expect(result.current.demo).toBe("cut");
    act(() => result.current.finish());
    expect(result.current.demo).toBeNull();
    rerender({ r: run() });
    expect(result.current.demo).toBeNull();
  });

  it("shows on reaching the demo's index, not before, for that task", () => {
    const mixed = run({ questions: [choice, choice, bench("assemble")], demo: { at: 2 } });
    const { result, rerender } = renderHook(({ i }) => useTaskDemo(mixed, i), { initialProps: { i: 0 } });
    expect(result.current.demo).toBeNull();
    rerender({ i: 1 });
    expect(result.current.demo).toBeNull();
    rerender({ i: 2 });
    expect(result.current.demo).toBe("assemble");
  });

  it("shows Pip before the run's first lock, once", () => {
    const locks = run({ questions: [choice, pattern, sort1], demo: { at: 1 } });
    const { result, rerender } = renderHook(({ i }) => useTaskDemo(locks, i), { initialProps: { i: 0 } });
    expect(result.current.demo).toBeNull();
    rerender({ i: 1 });
    expect(result.current.demo).toBe("pattern");
    act(() => result.current.finish());
    rerender({ i: 2 });
    expect(result.current.demo).toBeNull();
  });

  it("is off for a run that was not marked (a hero who has answered a lock, or an older one)", () => {
    expect(renderHook(() => useTaskDemo(run({ questions: [pattern], demo: undefined }), 0)).result.current.demo).toBeNull();
  });

  it.each([["words", wordSort], ["shapes", shapes3], ["balance", balance]] as const)("shows Pip before a first %s lock", (key, task) => {
    const { result } = renderHook(() => useTaskDemo(run({ questions: [choice, task], demo: { at: 1 } }), 1));
    expect(result.current.demo).toBe(key);
  });

  it("is off when the marked task has no demo", () => {
    expect(renderHook(() => useTaskDemo(run({ questions: [choice] }), 0)).result.current.demo).toBeNull();
    expect(renderHook(() => useTaskDemo(run({ questions: [cage4] }), 0)).result.current.demo).toBeNull();
  });
});

describe("Watch Pip build a rune (R-I12)", () => {
  it("a rune's demo is the rune's, of the rune kind", () => {
    expect(demoKeyOf(rune)).toBe("rune");
    expect(demoKind("rune")).toBe("rune");
  });

  it("shows Pip's steps, says its words, and Got it, with the focus, hands over", () => {
    const onDone = vi.fn();
    render(<TaskDemo demo="rune" calm onDone={onDone} />);
    expect(screen.getByRole("heading", { name: "Watch Pip" })).toBeInTheDocument();
    expect(screen.getByText(RUNE)).toBeInTheDocument();
    expect(taskDemoCopy("rune")).toBe(RUNE);
    const steps = screen.getByRole("list", { name: "What Pip does" });
    expect(within(steps).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Hear the word", "Tap the runes in order", "Cast"]);
    const go = screen.getByRole("button", { name: "Got it" });
    expect(go).toHaveFocus();
    fireEvent.click(go);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("on the page too, and draws nothing that moves when calm", () => {
    const { container, rerender } = render(<TaskDemo demo="rune" calm variant="page" onDone={() => {}} />);
    expect(container.querySelector(".trail--page")).not.toBeNull();
    expect(container.querySelector(".trail--move")).toBeNull();
    rerender(<TaskDemo demo="rune" calm={false} variant="page" onDone={() => {}} />);
    expect(container.querySelector(".trail--move")).not.toBeNull();
  });

  it("shows before a run's first rune", () => {
    const { result } = renderHook(() => useTaskDemo({ questions: [rune, rune], demo: { at: 0 } } as unknown as RunStart, 0));
    expect(result.current.demo).toBe("rune");
  });
});
