import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientTask } from "@/lib/tasks/types";
import { initialFlow, type FlowState } from "@/lib/utils/deed-run-flow";
import { TaskPresenter } from "./presenters";

afterEach(cleanup);

const task: ClientTask = { kind: "choice", id: "q1", skillId: "math-add", prompt: "What is 2 + 4?", view: { choices: ["5", "6", "7", "8"] } };
const asking: FlowState = initialFlow({ questions: [{ id: "q1" }] as never, responses: [null], pending: null });

function show(over: { flow?: FlowState; variant?: "board" | "page"; disabled?: boolean; nudge?: { line: string; hint: string } | null } = {}) {
  const onRespond = vi.fn();
  render(<TaskPresenter task={task} flow={over.flow ?? asking} variant={over.variant ?? "board"} numerals calm={false} disabled={over.disabled ?? false} nudge={over.nudge} onRespond={onRespond} />);
  return onRespond;
}

describe("TaskPresenter (choice)", () => {
  it.each(["board", "page"] as const)("renders one button per choice in the %s variant, and a click responds", (variant) => {
    const onRespond = show({ variant });
    expect(screen.getAllByRole("button")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /6/ }));
    expect(onRespond).toHaveBeenCalledWith("6");
  });

  it("disables a ruled-out choice", () => {
    const flow: FlowState = { ...asking, phase: "second-chance", ruledOut: ["5"], picked: "5" };
    show({ flow });
    expect(screen.getByRole("button", { name: /5/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /6/ })).toBeEnabled();
  });

  it("disables everything while the caller says so", () => {
    show({ disabled: true });
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
  });

  it("answers to the number keys on the board, and not on the page", () => {
    const board = show({ variant: "board" });
    fireEvent.keyDown(window, { code: "Digit3" });
    expect(board).toHaveBeenCalledWith("7");
    cleanup();
    const page = show({ variant: "page" });
    fireEvent.keyDown(window, { code: "Digit3" });
    expect(page).not.toHaveBeenCalled();
  });

  it("ignores modified keys, repeats and numbers past the last choice", () => {
    const onRespond = show();
    fireEvent.keyDown(window, { code: "Digit1", ctrlKey: true });
    fireEvent.keyDown(window, { code: "Digit1", repeat: true });
    fireEvent.keyDown(window, { code: "Digit9" });
    expect(onRespond).not.toHaveBeenCalled();
  });
});

describe("TaskPresenter nudge", () => {
  it.each(["board", "page"] as const)("shows the squire's line and the clue above the choices in the %s variant, as a status", (variant) => {
    show({ variant, nudge: { line: "Slow down, friend.", hint: "Count up." } });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Slow down, friend.");
    expect(status).toHaveTextContent("Count up.");
    const firstChoice = screen.getAllByRole("button")[0];
    expect(status.compareDocumentPosition(firstChoice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows nothing without a nudge", () => {
    show();
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    show({ nudge: null });
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("TaskPresenter (measure, until the bench lands)", () => {
  it("shows a note rather than failing", () => {
    const measure: ClientTask = { kind: "measure", id: "m1", skillId: "frac-addsub", prompt: "Cut it", view: { mode: "cut", unit: "ft", step: "1/4", maxLength: "2" } };
    render(<TaskPresenter task={measure} flow={asking} variant="board" numerals calm={false} disabled={false} onRespond={vi.fn()} />);
    expect(screen.getByText("Coming soon")).toBeTruthy();
  });
});
