import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunStart } from "@/lib/utils/deed-run-types";
import { BenchDemo, demoCopy, useBenchDemo } from "./bench-demo";

afterEach(cleanup);

const ASSEMBLE = "Aldo needs a beam 5 feet long. He fits a 2-foot piece and a 3-foot piece: 2 + 3 = 5. Now you try!";
const CUT = "Aldo needs a board 3/4 of a foot long. He measures 3 quarters and cuts there. Now you try!";

describe("BenchDemo", () => {
  it("shows Aldo's worked beam, with a heading and a Got it button that has focus", () => {
    render(<BenchDemo mode="assemble" calm={false} onDone={() => {}} />);
    expect(screen.getByRole("heading", { name: "Watch Aldo" })).toBeInTheDocument();
    expect(screen.getByText(ASSEMBLE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toHaveFocus();
  });

  it("shows Aldo's measured board for a cut", () => {
    render(<BenchDemo mode="cut" calm onDone={() => {}} />);
    expect(screen.getByText(CUT)).toBeInTheDocument();
  });

  it("hands over on Got it", () => {
    const onDone = vi.fn();
    render(<BenchDemo mode="cut" calm onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("draws nothing that moves when calm", () => {
    const { container, rerender } = render(<BenchDemo mode="assemble" calm onDone={() => {}} />);
    expect(container.querySelector(".bench-demo-art--move")).toBeNull();
    rerender(<BenchDemo mode="assemble" calm={false} onDone={() => {}} />);
    expect(container.querySelector(".bench-demo-art--move")).not.toBeNull();
  });

  it("says the demo's words in demoCopy, for read-aloud", () => {
    expect(demoCopy("assemble")).toBe(ASSEMBLE);
    expect(demoCopy("cut")).toBe(CUT);
  });
});

describe("useBenchDemo", () => {
  const task = (mode: "assemble" | "cut") => ({ kind: "measure" as const, id: "m1", skillId: "s", prompt: "p", view: { mode, unit: "ft" } });
  const choice = { kind: "choice" as const, id: "q", skillId: "s", prompt: "p", view: { choices: ["a"] } };
  const run = (over: Partial<RunStart> = {}) => ({ questions: [task("cut")], demo: { at: 0 }, ...over }) as RunStart;

  it("shows the demo task's mode once: after Got it it stays done", () => {
    const { result, rerender } = renderHook(({ r }) => useBenchDemo(r, 0), { initialProps: { r: run() } });
    expect(result.current.mode).toBe("cut");
    act(() => result.current.finish());
    expect(result.current.mode).toBeNull();
    rerender({ r: run() });
    expect(result.current.mode).toBeNull();
  });

  it("shows on reaching the demo's index, not before, in that task's mode", () => {
    const mixed = run({ questions: [choice, choice, task("assemble")], demo: { at: 2 } });
    const { result, rerender } = renderHook(({ i }) => useBenchDemo(mixed, i), { initialProps: { i: 0 } });
    expect(result.current.mode).toBeNull();
    rerender({ i: 1 });
    expect(result.current.mode).toBeNull();
    rerender({ i: 2 });
    expect(result.current.mode).toBe("assemble");
  });

  it("is off for a run that was not marked", () => {
    expect(renderHook(() => useBenchDemo(run({ demo: undefined }), 0)).result.current.mode).toBeNull();
  });

  it("is off when the marked task is not a bench task", () => {
    expect(renderHook(() => useBenchDemo(run({ questions: [choice] }), 0)).result.current.mode).toBeNull();
  });
});
