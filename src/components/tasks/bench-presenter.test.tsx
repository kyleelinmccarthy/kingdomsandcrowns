import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CUT_MAX_CHARS, TASK_CODECS } from "@/lib/tasks/codecs";
import type { ClientTask, Quantity } from "@/lib/tasks/types";
import { benchPieces } from "@/lib/realm3d/bench-pieces";
import { initialFlow, type FlowState } from "@/lib/utils/deed-run-flow";
import type { BenchSite } from "@/components/use-deed-flow";
import { TaskPresenter } from "./presenters";

afterEach(cleanup);

type Measure = Extract<ClientTask, { kind: "measure" }>;
const ASSEMBLE: Measure = {
  kind: "measure", id: "m-asm", skillId: "add-10", prompt: "Build a beam 9 blocks long.",
  view: { mode: "assemble", unit: "blocks", pieces: ["4 blocks", "6 blocks", "5 blocks", "8 blocks"], target: "9 blocks" },
};
const CUT: Measure = {
  kind: "measure", id: "m-cut", skillId: "frac-addsub", prompt: "Cut a board three quarters of a foot long.",
  view: { mode: "cut", unit: "feet", step: "1/4", maxLength: "2" },
};
const asking: FlowState = initialFlow({ questions: [{ id: "q1" }] as never, responses: [null], pending: null });
const secondChance = (first: string): FlowState => ({ ...asking, phase: "second-chance", ruledOut: [first], picked: first, result: { correct: false, secondChance: true } });
const resolved: FlowState = { ...asking, phase: "resolved", result: { correct: true, secondChance: false } };

type Over = { task?: Measure; flow?: FlowState; variant?: "board" | "page"; disabled?: boolean; calm?: boolean; site?: BenchSite };
function show(over: Over = {}) {
  const onRespond = vi.fn();
  const props = (o: Over) => ({
    task: o.task ?? ASSEMBLE, flow: o.flow ?? asking, variant: o.variant ?? ("board" as const), numerals: false,
    calm: o.calm ?? false, disabled: o.disabled ?? false, site: o.site, onRespond,
  });
  const view = render(<TaskPresenter {...props(over)} />);
  return { onRespond, rerender: (o: Over) => view.rerender(<TaskPresenter {...props({ ...over, ...o })} />) };
}

const piece = (label: string) => screen.getByRole("button", { name: label });
const fit = () => screen.getByRole("button", { name: "Fit it" });
const cutIt = () => screen.getByRole("button", { name: "Cut it" });
const length = () => screen.getByLabelText("Length in feet") as HTMLInputElement;

describe("the bench: fitting pieces to a mark", () => {
  it.each(["board", "page"] as const)("is titled the bench and shows each piece as a toggle and the mark (%s)", (variant) => {
    show({ variant });
    expect(screen.getByRole("heading", { name: "The bench" })).toBeTruthy();
    for (const label of ASSEMBLE.view.pieces!) expect(piece(label).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("9 blocks")).toBeTruthy();
  });

  /** Everything the bench says in words, but the pieces' own labels and the mark. */
  const said = () => {
    const region = screen.getByRole("region", { name: "The bench" });
    const copy = region.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("button, .bench-mark").forEach((n) => n.remove());
    return copy.textContent ?? "";
  };

  it("never adds the picked pieces up for the child, whatever is picked (RC-k)", () => {
    show();
    const labels = ASSEMBLE.view.pieces!;
    // Every selection of the four pieces, one toggle at a time (a Gray code walks them all).
    for (let n = 1; n < 1 << labels.length; n++) {
      const flip = Math.log2(n & -n);
      fireEvent.click(piece(labels[flip]));
      expect(said()).not.toMatch(/=|so far|total|\b(9|10|11|12|13|14|15|17|18|19|23)\b/i);
    }
  });

  it("lists the picked pieces as a sum to work out, in the order offered, as they are picked", () => {
    show();
    const live = screen.getByText((_, el) => el?.getAttribute("aria-live") === "polite" && el.classList.contains("bench-picked"));
    expect(live.textContent).toBe("");
    fireEvent.click(piece("5 blocks"));
    fireEvent.click(piece("4 blocks"));
    expect(live.textContent).toBe("Your pieces: 4 + 5");
  });

  it("Fit it waits for a piece to be picked", () => {
    show();
    expect(fit()).toBeDisabled();
    fireEvent.click(piece("4 blocks"));
    expect(fit()).toBeEnabled();
  });

  it("picking pieces 2 then 0 sends them encoded", () => {
    const { onRespond } = show();
    fireEvent.click(piece("5 blocks"));
    fireEvent.click(piece("4 blocks"));
    expect(piece("5 blocks").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(fit());
    expect(onRespond).toHaveBeenCalledWith(TASK_CODECS.measure.encode([0, 2]));
    expect(onRespond).toHaveBeenCalledWith("a:0,2");
  });

  it("a second tap puts a piece back", () => {
    show();
    fireEvent.click(piece("6 blocks"));
    fireEvent.click(piece("6 blocks"));
    expect(piece("6 blocks").getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText(/Your pieces/)).toBeNull();
    expect(fit()).toBeDisabled();
  });

  it("on a second chance, says the first try back and will not send it again", () => {
    const { onRespond, rerender } = show();
    fireEvent.click(piece("4 blocks"));
    fireEvent.click(piece("6 blocks"));
    fireEvent.click(fit());
    rerender({ flow: secondChance("a:0,1") });
    expect(screen.getByText("Your first try: 4 blocks + 6 blocks")).toBeTruthy();
    expect(fit()).toBeDisabled();
    fireEvent.click(piece("6 blocks"));
    fireEvent.click(piece("5 blocks"));
    fireEvent.click(fit());
    expect(onRespond).toHaveBeenLastCalledWith("a:0,2");
  });

  it("once resolved, or while the caller is busy, nothing can be pressed", () => {
    show({ flow: resolved });
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
    cleanup();
    show({ disabled: true });
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
  });

  it("the first piece takes focus", () => {
    show();
    expect(document.activeElement).toBe(piece("4 blocks"));
  });
});

describe("the bench: cutting to a length", () => {
  it("asks for a length in the task's unit, typed first, and Cut it sends it encoded", () => {
    const { onRespond } = show({ task: CUT });
    expect(document.activeElement).toBe(length());
    expect(length().value).toBe("");
    expect(cutIt()).toBeDisabled();
    fireEvent.change(length(), { target: { value: "0.75" } });
    fireEvent.click(cutIt());
    expect(onRespond).toHaveBeenCalledWith(TASK_CODECS.measure.encode("0.75"));
    expect(onRespond).toHaveBeenCalledWith("c:3/4");
  });

  it("submitting the box cuts too", () => {
    const { onRespond } = show({ task: CUT });
    fireEvent.change(length(), { target: { value: "3/4" } });
    fireEvent.submit(length());
    expect(onRespond).toHaveBeenCalledWith("c:3/4");
  });

  it("Enter typed in the box cuts", async () => {
    const { onRespond } = show({ task: CUT });
    await userEvent.type(length(), "6/8{Enter}");
    expect(onRespond).toHaveBeenCalledWith("c:3/4");
  });

  it("holds no more than the bench reads, and says how to write a length it cannot read", () => {
    show({ task: CUT });
    expect(length().maxLength).toBe(CUT_MAX_CHARS);
    fireEvent.change(length(), { target: { value: "3/" } });
    expect(cutIt()).toBeDisabled();
    expect(screen.getByText(/like 3, 1\/2 or 0\.5/)).toBeTruthy();
  });

  it("steps by whole units and by the task's own step, from nothing as from 0, never below 0", () => {
    show({ task: CUT });
    expect(screen.queryByRole("button", { name: "+10" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+1/4" }));
    expect(length().value).toBe("1/4");
    fireEvent.click(screen.getByRole("button", { name: "+1" }));
    expect(length().value).toBe("1 1/4");
    fireEvent.click(screen.getByRole("button", { name: "−1" }));
    expect(length().value).toBe("1/4");
    fireEvent.click(screen.getByRole("button", { name: "−1/4" }));
    fireEvent.click(screen.getByRole("button", { name: "−1/4" }));
    expect(length().value).toBe("0");
  });

  it("never steps past the end of the ruler", () => {
    show({ task: CUT });
    fireEvent.change(length(), { target: { value: "1 3/4" } });
    fireEvent.click(screen.getByRole("button", { name: "+1" }));
    expect(length().value).toBe("2");
  });

  it("offers tens on a long ruler, and only whole steps when the step is one", () => {
    show({ task: { ...CUT, view: { mode: "cut", unit: "feet", step: "1", maxLength: "150" } } });
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["−10", "−1", "+1", "+10", "Cut it"]);
  });

  it("on a second chance, says the first try back, keeps it to trim, and will not send it again", () => {
    const { onRespond, rerender } = show({ task: CUT });
    fireEvent.change(length(), { target: { value: "1/2" } });
    fireEvent.click(cutIt());
    rerender({ flow: secondChance("c:1/2") });
    expect(screen.getByText("Your first try: 1/2")).toBeTruthy();
    expect(length().value).toBe("1/2");
    expect(cutIt()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "+1/4" }));
    fireEvent.click(cutIt());
    expect(onRespond).toHaveBeenLastCalledWith("c:3/4");
  });

  it("a run picked back up on a second chance starts from the first try, pieces or length", () => {
    show({ task: CUT, flow: secondChance("c:1/2") });
    expect(length().value).toBe("1/2");
    cleanup();
    show({ flow: secondChance("a:0,1") });
    expect(piece("6 blocks").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Your pieces: 4 + 6")).toBeTruthy();
  });

  it("a decimal cut picked back up on a second chance is said and seeded as the child wrote it, and steps in decimals", () => {
    const decimal: Measure = { ...CUT, view: { mode: "cut", unit: "feet", step: "0.01", maxLength: "20" } };
    show({ task: decimal, flow: secondChance("c:471/50") });
    expect(screen.getByText("Your first try: 9.42")).toBeTruthy();
    expect(length().value).toBe("9.42");
    fireEvent.click(screen.getByRole("button", { name: "+0.01" }));
    expect(length().value).toBe("9.43");
  });

  it("a mixed number picked back up is said and seeded as a mixed number", () => {
    show({ task: CUT, flow: secondChance("c:3/2") });
    expect(screen.getByText("Your first try: 1 1/2")).toBeTruthy();
    expect(length().value).toBe("1 1/2");
  });

  describe("names what a cut measures, not always a length", () => {
    const cutOf = (unit: string, quantity?: Quantity): Measure => ({
      ...CUT, view: { mode: "cut", unit, step: "1", maxLength: "40", ...(quantity ? { quantity } : {}) },
    });

    it("a length keeps its box, its hint, its ruler and Cut it (and a task with no quantity is a length)", () => {
      for (const task of [cutOf("feet", "length"), cutOf("feet")]) {
        show({ task });
        fireEvent.change(length(), { target: { value: "oops" } });
        expect(screen.getByText("Write a length like 3, 1/2 or 0.5.")).toBeTruthy();
        fireEvent.change(length(), { target: { value: "12" } });
        expect(cutIt()).toBeEnabled();
        expect(screen.getByRole("img", { name: "A ruler in feet, to 40, the board cut at 12" })).toBeTruthy();
        cleanup();
      }
    });

    it.each([
      ["square feet", "area", "Area in square feet", "Write an area like 3, 1/2 or 0.5."],
      ["cubic feet", "volume", "Volume in cubic feet", "Write a volume like 3, 1/2 or 0.5."],
      ["pounds", "weight", "Weight in pounds", "Write a weight like 3, 1/2 or 0.5."],
      ["stones", "count", "How many stones?", "Write a number like 3 or 12."],
      ["flagstones", "area", "Area in flagstones", "Write an area like 3, 1/2 or 0.5."],
    ] as const)("%s (%s): \"%s\", Set it, and a scale", (unit, quantity, label, hint) => {
      const { onRespond } = show({ task: cutOf(unit, quantity) });
      const box = screen.getByLabelText(label) as HTMLInputElement;
      expect(screen.queryByText(/Length/)).toBeNull();
      fireEvent.change(box, { target: { value: "oops" } });
      expect(screen.getByText(hint)).toBeTruthy();
      fireEvent.change(box, { target: { value: "12" } });
      expect(screen.queryByRole("button", { name: "Cut it" })).toBeNull();
      expect(screen.getByRole("img", { name: `A scale in ${unit}, to 40, set at 12` })).toBeTruthy();
      expect(screen.queryByRole("img", { name: /ruler|board/ })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Set it" }));
      expect(onRespond).toHaveBeenLastCalledWith("c:12");
    });

    it("a count with no unit still asks how many", () => {
      show({ task: cutOf("", "count") });
      expect(screen.getByLabelText("How many?")).toBeTruthy();
    });

    it("never tells the child they are behind or ahead", () => {
      for (const q of ["length", "area", "volume", "weight", "count"] as const) {
        show({ task: cutOf("stones", q) });
        expect(document.body.textContent).not.toMatch(/\b(behind|ahead)\b/i);
        cleanup();
      }
    });
  });

  it("a fraction length gets a keyboard with a slash on a phone; a decimal one, the number pad", () => {
    show({ task: CUT });
    expect(length().inputMode).toBe("text");
    cleanup();
    show({ task: { ...CUT, view: { mode: "cut", unit: "feet", step: "0.1", maxLength: "3" } } });
    expect(length().inputMode).toBe("decimal");
  });

  it("draws the typed length on a ruler", () => {
    show({ task: CUT });
    fireEvent.change(length(), { target: { value: "1" } });
    expect(screen.getByRole("img", { name: "A ruler in feet, to 2, the board cut at 1" })).toBeTruthy();
  });

  it("a quarter-foot ruler to 2 has 9 ticks, at quarters; a whole-number ruler to 100 about ten", () => {
    show({ task: CUT });
    const ticks = () => screen.getByRole("img", { name: /^A ruler/ }).querySelectorAll(".bench-ruler-tick");
    expect(ticks()).toHaveLength(9);
    cleanup();
    show({ task: { ...CUT, view: { mode: "cut", unit: "feet", step: "1", maxLength: "100" } } });
    expect(ticks().length).toBeGreaterThanOrEqual(9);
    expect(ticks().length).toBeLessThanOrEqual(12);
  });

  it("a key typed into the length never reaches the game, and Esc does not close the run (Review Focus 5)", () => {
    const game = vi.fn();
    window.addEventListener("keydown", game);
    try {
      const { onRespond } = show({ task: CUT });
      for (const [key, code] of [["w", "KeyW"], ["1", "Digit1"], ["Escape", "Escape"]]) fireEvent.keyDown(length(), { key, code });
      expect(game).not.toHaveBeenCalled();
      // The board's number keys answer a choice; the bench mounts none.
      fireEvent.keyDown(window, { key: "1", code: "Digit1" });
      expect(onRespond).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", game);
    }
  });
});

describe("the bench: the site going up beside it", () => {
  // Stage 1 lays the sills and posts: 8 pieces, paced here over a run with 4 bench tasks.
  const site = (solved: number, benchTasks = 4): BenchSite => ({ stage: 1, complete: false, solved, benchTasks });
  const stage = benchPieces(1, false);
  const drawing = () => screen.getByRole("img", { name: /^The site/ });
  const laid = () => drawing().querySelectorAll("[data-laid]").length;

  it("draws nothing for a run with no building", () => {
    show();
    expect(screen.queryByRole("img", { name: /^The site/ })).toBeNull();
  });

  it("before any right answer, promises only what is true: right answers raise the site", () => {
    show({ site: site(0) });
    expect(laid()).toBe(0);
    expect(screen.getByText("Right answers raise the next part of the site.")).toBeTruthy();
  });

  it("paces the stage over the run's bench tasks, and names the latest piece in (RC-l)", () => {
    show({ site: site(1) });
    expect(laid()).toBe(2);
    expect(drawing().getAttribute("aria-label")).toBe(`The site: 2 of ${stage.length} pieces laid`);
    expect(screen.getByText(`${stage[1].label[0].toUpperCase()}${stage[1].label.slice(1)} is in place.`)).toBeTruthy();
    cleanup();
    // A perfect run lays the whole stage.
    show({ site: site(4) });
    expect(laid()).toBe(stage.length);
  });

  it("never lays more pieces than the stage has", () => {
    show({ site: site(7) });
    expect(laid()).toBe(stage.length);
  });

  it("drops in what the latest right answer laid, and keeps it still in calm play", () => {
    show({ site: site(1) });
    expect(drawing().querySelectorAll(".bench-piece--drop")).toHaveLength(2);
    cleanup();
    show({ site: site(1), calm: true });
    expect(drawing().querySelectorAll(".bench-piece--drop")).toHaveLength(0);
  });

  it("a build run draws its plan going up instead of a building's site", () => {
    show({ site: { stage: 0, complete: false, solved: 1, benchTasks: 3, plan: { improvementId: "village-banners", level: 2 } } });
    expect(screen.queryByRole("img", { name: /^The site/ })).toBeNull();
    expect(screen.getByRole("img", { name: "The Banners, level 2, going up" })).toBeTruthy();
  });

  it("sits beside the work on the page too", () => {
    show({ variant: "page", task: CUT, site: site(1) });
    expect(within(screen.getByRole("region", { name: "The bench" })).getByRole("img", { name: /^The site/ })).toBeTruthy();
  });
});
