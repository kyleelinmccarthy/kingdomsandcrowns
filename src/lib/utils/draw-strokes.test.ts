import { describe, it, expect } from "vitest";
import { drawStrokes, DRAWING_PARCHMENT } from "./draw-strokes";
import { DRAWING_PALETTE, DRAWING_WIDTHS, type Drawing } from "./drawing";

/** A canvas context that only records what it was told, in order. */
function fakeCtx() {
  const log: string[] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    fillRect: (x: number, y: number, w: number, h: number) => log.push(`fillRect ${ctx.fillStyle} ${x} ${y} ${w} ${h}`),
    beginPath: () => log.push("beginPath"),
    moveTo: (x: number, y: number) => log.push(`moveTo ${x} ${y}`),
    lineTo: (x: number, y: number) => log.push(`lineTo ${x} ${y}`),
    stroke: () => log.push(`stroke ${ctx.strokeStyle} ${ctx.lineWidth} ${ctx.lineCap} ${ctx.lineJoin}`),
  };
  return { ctx, log };
}

describe("drawStrokes", () => {
  it("paints the parchment over the whole canvas first", () => {
    const { ctx, log } = fakeCtx();
    drawStrokes(ctx, { v: 1, strokes: [] }, 256, 192);
    expect(log).toEqual([`fillRect ${DRAWING_PARCHMENT} 0 0 256 192`]);
  });

  it("scales the 320 by 240 pad to the canvas, and each stroke's width with it", () => {
    const { ctx, log } = fakeCtx();
    const d: Drawing = { v: 1, strokes: [{ c: 2, w: 1, p: [0, 0, 320, 240, 160, 120] }] };
    drawStrokes(ctx, d, 160, 120);
    expect(log.slice(1)).toEqual([
      "beginPath",
      "moveTo 0 0",
      "lineTo 160 120",
      "lineTo 80 60",
      `stroke ${DRAWING_PALETTE[2]} ${DRAWING_WIDTHS[1] * 0.5} round round`,
    ]);
  });

  it("uses each stroke's own palette colour and width", () => {
    const { ctx, log } = fakeCtx();
    const d: Drawing = {
      v: 1,
      strokes: [
        { c: 0, w: 0, p: [10, 10, 20, 20] },
        { c: 7, w: 2, p: [30, 30, 40, 40] },
      ],
    };
    drawStrokes(ctx, d, 320, 240);
    const strokes = log.filter((l) => l.startsWith("stroke"));
    expect(strokes).toEqual([
      `stroke ${DRAWING_PALETTE[0]} ${DRAWING_WIDTHS[0]} round round`,
      `stroke ${DRAWING_PALETTE[7]} ${DRAWING_WIDTHS[2]} round round`,
    ]);
  });

  it("draws a one-point stroke as a tiny line, so the round cap shows it as a dot", () => {
    const { ctx, log } = fakeCtx();
    drawStrokes(ctx, { v: 1, strokes: [{ c: 1, w: 2, p: [100, 50] }] }, 320, 240);
    expect(log.slice(1)).toEqual(["beginPath", "moveTo 100 50", "lineTo 100.01 50", `stroke ${DRAWING_PALETTE[1]} ${DRAWING_WIDTHS[2]} round round`]);
  });
});
