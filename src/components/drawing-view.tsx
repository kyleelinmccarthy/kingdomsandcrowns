import {
  DRAWING_HEIGHT,
  DRAWING_PALETTE,
  DRAWING_PARCHMENT,
  DRAWING_WIDTH,
  DRAWING_WIDTHS,
  strokePathD,
  type Drawing,
} from "@/lib/utils/drawing";

/**
 * A drawing, read-only. It draws the strokes of a validated `Drawing` as SVG paths (the one
 * geometry is `strokePathD`) and never renders stored markup. Pass what `parseDrawing` returned.
 */
export function DrawingView({
  drawing,
  label = "A drawing",
  className,
}: {
  drawing: Drawing;
  label?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${DRAWING_WIDTH} ${DRAWING_HEIGHT}`}
      role="img"
      aria-label={label}
      className={className}
      style={{ background: DRAWING_PARCHMENT, aspectRatio: "4 / 3", borderRadius: 4, display: "block" }}
    >
      {drawing.strokes.map((s, i) => (
        <path
          key={i}
          d={strokePathD(s)}
          stroke={DRAWING_PALETTE[s.c]}
          strokeWidth={DRAWING_WIDTHS[s.w]}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
