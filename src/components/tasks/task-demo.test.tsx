import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunStart } from "@/lib/utils/deed-run-types";
import type { ClientTask } from "@/lib/tasks/types";
import { demoKeyOf } from "@/lib/tasks/demos";
import { LockDemo, lockDemoCopy } from "./lock-demo";
import { TaskDemo, taskDemoCopy, useTaskDemo } from "./task-demo";

afterEach(cleanup);

const PATTERN = "Pip fits the next shape: red, blue, red, blue, … red!";
const SORT = "Pip puts each shape where it belongs.";
const ASSEMBLE = "Aldo needs a beam 5 feet long. He fits a 2-foot piece and a 3-foot piece: 2 + 3 = 5. Now you try!";

const bench = (mode: "assemble" | "cut"): ClientTask => ({ kind: "measure", id: "m1", skillId: "s", prompt: "p", view: { mode, unit: "ft" } });
const choice: ClientTask = { kind: "choice", id: "q", skillId: "s", prompt: "p", view: { choices: ["a"] } };
const lock = (view: Extract<ClientTask, { kind: "lock" }>["view"]): ClientTask => ({ kind: "lock", id: `l-${view.puzzle}`, skillId: "logic-k1", prompt: "p", view });
const pattern = lock({ puzzle: "pattern", sequence: [{ shape: "circle", color: "red" }, null], tray: [{ shape: "circle", color: "red" }] });
const sort1 = lock({ puzzle: "sort1", items: [{ shape: "circle", color: "red" }], bins: ["Red", "Blue"] });
const sort2 = lock({ puzzle: "sort2", items: [{ shape: "circle", color: "red" }], rows: ["Circles", "Stars"], cols: ["Red", "Blue"] });
const balance = lock({ puzzle: "balance", weights: [1, 2], target: 3 });
const wordSort = lock({ puzzle: "sort", categories: ["Alive", "Not alive"], items: [{ id: "r", label: "rock" }] });

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
  });
});

describe("which demo a task has (demoKeyOf)", () => {
  it("Aldo for a bench task's mode; Pip for a pattern or a shape sort; none for the rest", () => {
    expect([bench("assemble"), bench("cut")].map(demoKeyOf)).toEqual(["assemble", "cut"]);
    expect([pattern, sort1, sort2].map(demoKeyOf)).toEqual(["pattern", "sort", "sort"]);
    expect([balance, wordSort, choice, undefined].map(demoKeyOf)).toEqual([null, null, null, null]);
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

  it("is off when the marked task has no demo", () => {
    expect(renderHook(() => useTaskDemo(run({ questions: [choice] }), 0)).result.current.demo).toBeNull();
    expect(renderHook(() => useTaskDemo(run({ questions: [balance] }), 0)).result.current.demo).toBeNull();
  });
});
