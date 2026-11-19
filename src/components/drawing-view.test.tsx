import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { DrawingView } from "./drawing-view";
import { DRAWING_PALETTE, DRAWING_WIDTHS, strokePathD, type Drawing } from "@/lib/utils/drawing";

afterEach(cleanup);

const drawing: Drawing = {
  v: 1,
  strokes: [
    { c: 2, w: 0, p: [10, 10, 50, 60, 100, 20] },
    { c: 6, w: 2, p: [200, 100] },
  ],
};

describe("DrawingView", () => {
  it("draws each stroke with its palette colour and width, through strokePathD", () => {
    const { container } = render(<DrawingView drawing={drawing} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("viewBox", "0 0 320 240");
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0]).toHaveAttribute("d", strokePathD(drawing.strokes[0]));
    expect(paths[0]).toHaveAttribute("stroke", DRAWING_PALETTE[2]);
    expect(paths[0]).toHaveAttribute("stroke-width", String(DRAWING_WIDTHS[0]));
    expect(paths[0]).toHaveAttribute("fill", "none");
    expect(paths[0]).toHaveAttribute("stroke-linecap", "round");
    expect(paths[1]).toHaveAttribute("stroke", DRAWING_PALETTE[6]);
    expect(paths[1]).toHaveAttribute("stroke-width", String(DRAWING_WIDTHS[2]));
  });

  it("is an image with a label, and takes a class", () => {
    const { container } = render(<DrawingView drawing={drawing} label="Ada's drawing" className="w-24" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "Ada's drawing");
    expect(svg.getAttribute("class")).toContain("w-24");
  });

  it("defaults the label", () => {
    const { container } = render(<DrawingView drawing={drawing} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-label", "A drawing");
  });
});
