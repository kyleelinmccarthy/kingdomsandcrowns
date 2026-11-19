import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, createEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DrawingPad } from "./drawing-pad";
import {
  DRAWING_MAX_STROKES,
  DRAWING_PALETTE,
  parseDrawing,
  type Drawing,
} from "@/lib/utils/drawing";

afterEach(cleanup);

/** The pad is 640x480 on screen, at the page's origin: one screen pixel is half a pad unit. */
const RECT = { left: 100, top: 50, width: 640, height: 480, right: 740, bottom: 530, x: 100, y: 50, toJSON: () => ({}) };

function pointer(el: Element, type: string, x: number, y: number, pointerId = 1) {
  const ev = createEvent[type as "pointerDown"](el, { bubbles: true });
  Object.defineProperty(ev, "clientX", { value: x });
  Object.defineProperty(ev, "clientY", { value: y });
  Object.defineProperty(ev, "pointerId", { value: pointerId });
  fireEvent(el, ev);
}

function setup(props: Partial<React.ComponentProps<typeof DrawingPad>> = {}) {
  const onChange = vi.fn();
  const utils = render(<DrawingPad value={null} onChange={onChange} {...props} />);
  const svg = screen.getByRole("img", { name: "Your drawing" });
  svg.getBoundingClientRect = () => RECT as DOMRect;
  return { onChange, svg, ...utils };
}

/** A stroke of `n` distinct points via the pad. */
function drag(svg: Element, pts: [number, number][]) {
  pointer(svg, "pointerDown", ...pts[0]);
  for (const p of pts.slice(1)) pointer(svg, "pointerMove", ...p);
  pointer(svg, "pointerUp", ...pts[pts.length - 1]);
}

/** Holds the value like the card does, so a sequence of strokes builds up. */
function Harness({ onChange }: { onChange: (d: Drawing | null) => void }) {
  const [value, setValue] = useState<Drawing | null>(null);
  return (
    <DrawingPad
      value={value}
      onChange={(d) => {
        setValue(d);
        onChange(d);
      }}
    />
  );
}

describe("DrawingPad", () => {
  it("is an image labelled 'Your drawing' on a 320x240 viewBox", () => {
    const { svg } = setup();
    expect(svg).toHaveAttribute("viewBox", "0 0 320 240");
    expect(svg.getAttribute("style")).toContain("touch-action");
  });

  it("turns a drag into one stroke with mapped, rounded points", () => {
    const { svg, onChange } = setup();
    // screen (100,50) is pad (0,0); each screen pixel is half a pad unit.
    drag(svg, [
      [100, 50],
      [301, 151], // -> (100.5, 50.5) -> rounds to 101 (Math.round half up), 51
      [740, 530], // -> (320, 240)
    ]);
    expect(onChange).toHaveBeenCalledTimes(1);
    const d = onChange.mock.calls[0][0] as Drawing;
    expect(d.strokes).toHaveLength(1);
    expect(d.strokes[0]).toEqual({ c: 0, w: 1, p: [0, 0, 101, 51, 320, 240] });
    expect(parseDrawing(d)).not.toBeNull();
  });

  it("clamps points that leave the page", () => {
    const { svg, onChange } = setup();
    drag(svg, [
      [0, 0], // left of and above the pad
      [5000, 5000],
    ]);
    const d = onChange.mock.calls[0][0] as Drawing;
    expect(d.strokes[0].p).toEqual([0, 0, 320, 240]);
    expect(parseDrawing(d)).not.toBeNull();
  });

  it("skips consecutive identical points", () => {
    const { svg, onChange } = setup();
    drag(svg, [
      [100, 50],
      [100, 50],
      [101, 51], // rounds to the same pad point as (100,50)? (0.5,0.5) -> 1,1: a new point
      [101, 51],
      [201, 151],
    ]);
    const d = onChange.mock.calls[0][0] as Drawing;
    expect(d.strokes[0].p).toEqual([0, 0, 1, 1, 51, 51]);
  });

  it("makes a one-point dot from a tap", () => {
    const { svg, onChange } = setup();
    pointer(svg, "pointerDown", 420, 290);
    pointer(svg, "pointerUp", 420, 290);
    const d = onChange.mock.calls[0][0] as Drawing;
    expect(d.strokes).toEqual([{ c: 0, w: 1, p: [160, 120] }]);
    expect(parseDrawing(d)).not.toBeNull();
  });

  it("ignores moves with no pointer down, and a cancelled pointer ends the stroke", () => {
    const { svg, onChange } = setup();
    pointer(svg, "pointerMove", 200, 200);
    expect(onChange).not.toHaveBeenCalled();
    pointer(svg, "pointerDown", 200, 200);
    pointer(svg, "pointerMove", 300, 300);
    pointer(svg, "pointerCancel", 300, 300);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("uses the chosen swatch and width for the next stroke", async () => {
    const user = userEvent.setup();
    const { svg, onChange } = setup();
    await user.click(screen.getByRole("button", { name: "Blue" }));
    await user.click(screen.getByRole("button", { name: "Thick" }));
    expect(screen.getByRole("button", { name: "Blue" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Black" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Thick" })).toHaveAttribute("aria-pressed", "true");
    drag(svg, [
      [100, 50],
      [200, 150],
    ]);
    const d = onChange.mock.calls[0][0] as Drawing;
    expect(d.strokes[0].c).toBe(DRAWING_PALETTE.indexOf("#1565c0"));
    expect(d.strokes[0].w).toBe(2);
  });

  it("offers eight named swatches and three widths", () => {
    setup();
    for (const name of ["Black", "Brown", "Red", "Orange", "Gold", "Green", "Blue", "Purple"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    for (const name of ["Thin", "Medium", "Thick"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("undoes the last stroke, and empties to null", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const svg = screen.getByRole("img", { name: "Your drawing" });
    svg.getBoundingClientRect = () => RECT as DOMRect;
    drag(svg, [[100, 50], [200, 150]]);
    drag(svg, [[300, 300], [400, 400]]);
    expect(onChange.mock.lastCall![0].strokes).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onChange.mock.lastCall![0].strokes).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onChange.mock.lastCall![0]).toBeNull();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("clears everything at once, asking nothing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const svg = screen.getByRole("img", { name: "Your drawing" });
    svg.getBoundingClientRect = () => RECT as DOMRect;
    drag(svg, [[100, 50], [200, 150]]);
    drag(svg, [[300, 300], [400, 400]]);
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange.mock.lastCall![0]).toBeNull();
    expect(svg.querySelectorAll("path")).toHaveLength(0);
  });

  it("stops at 40 strokes and says so", () => {
    const stroke = { c: 0, w: 1, p: [10, 10, 20, 20] };
    const full: Drawing = { v: 1, strokes: Array.from({ length: DRAWING_MAX_STROKES }, () => stroke) };
    const { svg, onChange } = setup({ value: full });
    expect(screen.getByText("The page is full. Undo or clear to draw more.")).toBeInTheDocument();
    drag(svg, [[100, 50], [200, 150]]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops at 2,000 points", () => {
    // 40 strokes would stop first, so use few long strokes: 4 strokes of 500 points
    const p: number[] = [];
    for (let i = 0; i < 500; i++) p.push(i % 321, i % 241);
    const full: Drawing = { v: 1, strokes: Array.from({ length: 4 }, () => ({ c: 0, w: 0, p })) };
    expect(parseDrawing(full)).not.toBeNull();
    const { svg, onChange } = setup({ value: full });
    expect(screen.getByText("The page is full. Undo or clear to draw more.")).toBeInTheDocument();
    drag(svg, [[100, 50], [200, 150]]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("never lets one long stroke run past 2,000 points", () => {
    const { svg, onChange } = setup();
    const pts: [number, number][] = [];
    for (let i = 0; i < 2500; i++) pts.push([100 + (i % 600), 50 + Math.floor(i / 600) * 100 + (i % 2)]);
    drag(svg, pts);
    const d = onChange.mock.calls[0][0] as Drawing;
    expect(d.strokes[0].p.length / 2).toBeLessThanOrEqual(2000);
    expect(parseDrawing(d)).not.toBeNull();
  });

  it("draws nothing and accepts no input when disabled", () => {
    const { svg, onChange } = setup({ disabled: true });
    drag(svg, [[100, 50], [200, 150]]);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Blue" })).toBeDisabled();
  });

  it("shows the strokes it was given", () => {
    const value: Drawing = { v: 1, strokes: [{ c: 2, w: 1, p: [10, 10, 40, 40] }] };
    const { svg } = setup({ value });
    expect(svg.querySelectorAll("path")).toHaveLength(1);
    expect(svg.querySelector("path")).toHaveAttribute("stroke", DRAWING_PALETTE[2]);
  });
});
