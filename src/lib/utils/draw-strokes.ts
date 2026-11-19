import { DRAWING_HEIGHT, DRAWING_PALETTE, DRAWING_WIDTH, DRAWING_WIDTHS, strokePoints, type Drawing } from "./drawing";

/** The page a drawing is made on: the same parchment the drawing view shows it on. */
export const DRAWING_PARCHMENT = "#f4e9cf";

/** The slice of a 2D canvas context `drawStrokes` uses, so a test can pass a recording fake. */
export type StrokeContext = Pick<
  CanvasRenderingContext2D,
  "fillStyle" | "fillRect" | "strokeStyle" | "lineWidth" | "lineCap" | "lineJoin" | "beginPath" | "moveTo" | "lineTo" | "stroke"
>;

/**
 * Paint a drawing onto a `w` by `h` canvas: parchment first, then every stroke in its palette
 * colour and width (round caps and joins), the 320 by 240 pad scaled to fit. It reads points
 * through `strokePoints`, as the SVG renderer does (one geometry), and takes a drawing that came
 * from `parseDrawing`. A one-point stroke is a hair-long line, which the round cap shows as a dot.
 */
export function drawStrokes(ctx: StrokeContext, d: Drawing, w: number, h: number): void {
  const sx = w / DRAWING_WIDTH;
  const sy = h / DRAWING_HEIGHT;
  ctx.fillStyle = DRAWING_PARCHMENT;
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of d.strokes) {
    const pts = strokePoints(stroke);
    if (pts.length === 0) continue;
    ctx.strokeStyle = DRAWING_PALETTE[stroke.c];
    ctx.lineWidth = DRAWING_WIDTHS[stroke.w] * Math.min(sx, sy);
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * sx, pts[0][1] * sy);
    if (pts.length === 1) ctx.lineTo(pts[0][0] * sx + 0.01, pts[0][1] * sy);
    else for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * sx, pts[i][1] * sy);
    ctx.stroke();
  }
}
