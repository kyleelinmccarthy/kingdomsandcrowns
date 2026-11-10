import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientTask } from "@/lib/tasks/types";
import { initialFlow, type FlowState } from "@/lib/utils/deed-run-flow";
import { TaskPresenter } from "./presenters";

afterEach(cleanup);

const task: ClientTask = { kind: "choice", id: "q1", skillId: "math-add", view: { prompt: "What is 2 + 4?", choices: ["5", "6", "7", "8"] } };
const asking: FlowState = initialFlow({ questions: [{ id: "q1" }] as never, responses: [null], pending: null });

function show(over: { flow?: FlowState; variant?: "board" | "page"; disabled?: boolean } = {}) {
  const onRespond = vi.fn();
  render(<TaskPresenter task={task} flow={over.flow ?? asking} variant={over.variant ?? "board"} numerals calm={false} disabled={over.disabled ?? false} onRespond={onRespond} />);
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
