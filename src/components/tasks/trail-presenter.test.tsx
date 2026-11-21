import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientTask } from "@/lib/tasks/types";
import { ANCHOR_IDS, ANCHORS } from "@/lib/realm/anchors";
import { TRAIL_MAP_VIEW, trailMapPoint } from "@/lib/realm/trail-map";
import { initialFlow, type FlowState } from "@/lib/utils/deed-run-flow";
import { TaskPresenter } from "./presenters";

afterEach(cleanup);

const clue: Extract<ClientTask, { kind: "trail" }> = { kind: "trail", id: "read-g1:trail:0a1b2c3d", skillId: "read-g1", prompt: "Go where the big wheel turns.", view: {} };
const asking: FlowState = initialFlow({ questions: [clue], responses: [null], pending: null });
const LABELS = ANCHOR_IDS.map((id) => ANCHORS[id].label);

function show(over: { flow?: FlowState; variant?: "board" | "page"; disabled?: boolean; onWalk?: () => void } = {}) {
  const onRespond = vi.fn();
  render(
    <TaskPresenter task={clue} flow={over.flow ?? asking} variant={over.variant ?? "page"} numerals calm={false} disabled={over.disabled ?? false} onWalk={over.onWalk} onRespond={onRespond} />,
  );
  return onRespond;
}
const anchorButtons = () => LABELS.map((label) => screen.getByRole("button", { name: label }));

describe("Set off, on the Realm's board", () => {
  it("shows Set off and its line, and a click hands the run to the walk once", () => {
    const onWalk = vi.fn();
    show({ variant: "board", onWalk });
    expect(screen.getByText("Read the clue, then walk to the place it tells of and search there.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set off" }));
    expect(onWalk).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "the mill" })).toBeNull();
  });

  it("takes the focus, so Enter sets off", () => {
    show({ variant: "board", onWalk: () => {} });
    expect(screen.getByRole("button", { name: "Set off" })).toHaveFocus();
  });

  it("offers no Set off at a run's finish step, where nothing is left to search", () => {
    show({ variant: "board", onWalk: () => {}, flow: { ...asking, phase: "resolved" } });
    expect(screen.queryByRole("button", { name: "Set off" })).toBeNull();
  });
});

describe("the village map (the picture run, R-H15)", () => {
  it.each([["the board without a walk", "board"], ["the page", "page"]] as const)("%s shows the map with all 14 places, named by label", (_, variant) => {
    show({ variant });
    expect(anchorButtons()).toHaveLength(14);
    expect(screen.queryByRole("button", { name: "Set off" })).toBeNull();
    expect(screen.getByText("Tap the place the clue tells of, then Search here.")).toBeInTheDocument();
  });

  it("a tap selects, and Search here sends that place", () => {
    const onRespond = show();
    fireEvent.click(screen.getByRole("button", { name: "the mill" }));
    expect(screen.getByRole("button", { name: "the mill" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "the well" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("the mill", { selector: "p" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Search here" }));
    expect(onRespond).toHaveBeenCalledWith("landmark:mill");
  });

  it("Search here waits for a selection", () => {
    const onRespond = show();
    expect(screen.getByRole("button", { name: "Search here" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Search here" }));
    expect(onRespond).not.toHaveBeenCalled();
  });

  it("nothing can be picked or sent while the player is busy", () => {
    show({ disabled: true });
    for (const b of anchorButtons()) expect(b).toBeDisabled();
    expect(screen.getByRole("button", { name: "Search here" })).toBeDisabled();
  });

  it("a ruled-out place is disabled and reads Not here", () => {
    const flow: FlowState = { ...asking, phase: "second-chance", ruledOut: ["landmark:well"], picked: "landmark:well", result: { correct: false, secondChance: true, hint: "That is where water is drawn." } };
    show({ flow });
    const well = screen.getByRole("button", { name: "the well" });
    expect(well).toBeDisabled();
    expect(well).toHaveTextContent("Not here");
    expect(screen.getByRole("button", { name: "the mill" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "the mill" })).not.toHaveTextContent("Not here");
  });

  it("a selection that is then ruled out is no longer selected", () => {
    const { rerender } = render(<TaskPresenter task={clue} flow={asking} variant="page" numerals calm={false} disabled={false} onRespond={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "the well" }));
    const open: FlowState = { ...asking, phase: "second-chance", ruledOut: ["landmark:well"], picked: "landmark:well", result: { correct: false, secondChance: true } };
    rerender(<TaskPresenter task={clue} flow={open} variant="page" numerals calm={false} disabled={false} onRespond={() => {}} />);
    expect(screen.getByRole("button", { name: "the well" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Search here" })).toBeDisabled();
  });

  it("a resolved miss marks the answer It was here., on the mill only, and nothing can be sent", () => {
    const flow: FlowState = { ...asking, phase: "resolved", ruledOut: ["landmark:well"], picked: "landmark:garden", result: { correct: false, secondChance: false, answer: "It was the mill.", reveal: "landmark:mill" } };
    show({ flow });
    expect(screen.getAllByText("It was here.")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "the mill" })).toHaveTextContent("It was here.");
    expect(screen.getByRole("button", { name: "the mill" })).toHaveAttribute("data-tone", "answer");
    expect(screen.getByRole("button", { name: "the well" })).toHaveTextContent("Not here");
    expect(screen.queryByRole("button", { name: "Search here" })).toBeNull();
    for (const b of anchorButtons()) expect(b).toBeDisabled();
  });

  it("a reveal that is not an anchor marks nothing, and does not throw (F-17)", () => {
    for (const reveal of ["landmark:longwater", "toString", "__proto__", "", undefined]) {
      const flow: FlowState = { ...asking, phase: "resolved", picked: "landmark:garden", result: { correct: false, secondChance: false, answer: "It was somewhere else.", reveal } };
      show({ flow });
      expect(screen.queryByText("It was here.")).toBeNull();
      for (const b of anchorButtons()) expect(b).not.toHaveAttribute("data-tone", "answer");
      cleanup();
    }
  });

  it("a right search shows a check on the place picked", () => {
    const flow: FlowState = { ...asking, phase: "resolved", picked: "landmark:mill", result: { correct: true, secondChance: false, answer: "It was the mill." } };
    show({ flow });
    expect(screen.getByRole("button", { name: "the mill" })).toHaveAttribute("data-tone", "right");
    expect(screen.getByRole("button", { name: "the well" })).not.toHaveAttribute("data-tone");
  });

  it("before resolution no place is told apart from another: the client holds no answer (leak rule)", () => {
    show();
    const looks = anchorButtons().map((b) => ({
      className: b.className,
      disabled: (b as HTMLButtonElement).disabled,
      pressed: b.getAttribute("aria-pressed"),
      tone: b.getAttribute("data-tone"),
      text: b.textContent,
      attrs: [...b.attributes].map((a) => a.name).sort().join(","),
    }));
    for (const look of looks) expect(look).toEqual(looks[0]);
    expect(document.body.textContent).not.toMatch(/It was here|Not here/);
  });

  it("the map's buttons are HTML, over the picture (F-13)", () => {
    const { container } = render(<TaskPresenter task={clue} flow={asking} variant="page" numerals calm={false} disabled={false} onRespond={() => {}} />);
    const svg = container.querySelector("svg.trail-map-art");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("viewBox", `0 0 ${TRAIL_MAP_VIEW.w} ${TRAIL_MAP_VIEW.h}`);
    expect(svg!.querySelector("button")).toBeNull();
    const box = svg!.parentElement!;
    expect(box.style.aspectRatio).toBe(`${TRAIL_MAP_VIEW.w} / ${TRAIL_MAP_VIEW.h}`);
    for (const id of ANCHOR_IDS) {
      const b = screen.getByRole("button", { name: ANCHORS[id].label });
      expect(b.closest("svg")).toBeNull();
      const p = trailMapPoint(ANCHORS[id].x, ANCHORS[id].z);
      expect(b.style.left).toBe(`${(p.x / TRAIL_MAP_VIEW.w) * 100}%`);
      expect(b.style.top).toBe(`${(p.y / TRAIL_MAP_VIEW.h) * 100}%`);
    }
  });

  it("Tab moves through the 14 places in catalog order, and Space selects", async () => {
    const user = userEvent.setup();
    show();
    // The first place takes the focus as the clue is asked, as a choice's first answer does.
    expect(screen.getByRole("button", { name: LABELS[0] })).toHaveFocus();
    for (const label of LABELS.slice(1)) {
      await user.tab();
      expect(screen.getByRole("button", { name: label })).toHaveFocus();
    }
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: LABELS[13] })).toHaveAttribute("aria-pressed", "true");
  });

  it("Enter and Space on the map never reach the game; Esc does", () => {
    const heard = vi.fn();
    window.addEventListener("keydown", heard);
    try {
      show({ variant: "board" });
      const mill = screen.getByRole("button", { name: "the mill" });
      fireEvent.keyDown(mill, { key: "Enter" });
      fireEvent.keyDown(mill, { key: " " });
      expect(heard).not.toHaveBeenCalled();
      fireEvent.keyDown(mill, { key: "Escape" });
      expect(heard).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", heard);
    }
  });

  it("fits a 390 px phone: the box scales to its width and every place stays a 40 px target, nothing dragged", () => {
    show();
    for (const b of anchorButtons()) expect(b.className).toMatch(/\btrail-spot\b/);
    const css = readFileSync(resolve(__dirname, "trail.css"), "utf8");
    const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, "\\.")} \\{([^}]*)\\}`))?.[1] ?? "";
    // The box is the map's own width, never wider than its column.
    expect(rule(".trail-map-box")).toMatch(/width: 100%/);
    // A place is 40 px square at least, and grows with the map (40 of its 360 units) above that.
    expect(rule(".trail-spot")).toMatch(/width: max\(40px, calc\(40 \/ 360 \* 100%\)\)/);
    expect(rule(".trail-spot")).toMatch(/aspect-ratio: 1/);
    expect(rule(".trail-spot")).toMatch(/translate\(-50%, -50%\)/);
    expect(css).not.toMatch(/draggable|touch-action: none/);
  });

  it("a fresh map for the next clue: nothing selected carries over", () => {
    const { rerender } = render(<TaskPresenter task={clue} flow={asking} variant="page" numerals calm={false} disabled={false} onRespond={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "the mill" }));
    const next = { ...clue, id: "read-g1:trail:11111111" };
    rerender(<TaskPresenter task={next} flow={{ ...asking, index: 1 }} variant="page" numerals calm={false} disabled={false} onRespond={() => {}} />);
    expect(screen.getByRole("button", { name: "the mill" })).toHaveAttribute("aria-pressed", "false");
  });
});
