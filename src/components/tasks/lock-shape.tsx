"use client";

/**
 * A lock's shape token (patterns, shape sorts, the shape grid), drawn as its outline AND filled with
 * its colour, so a hero who can't tell two colours apart still tells the shapes apart (the puzzles
 * never pair red with green: RF-d). Sizes are clearly apart, a big shape drawn 1.8 times a small one,
 * since a sort can turn on size alone. The drawing is hidden from screen readers: whatever holds it
 * carries the name ("big red circle", `tokenName`).
 */
import type { LockShape } from "@/lib/tasks/lock-rules";

/** The fill for each colour: strong and apart, with a dark outline that reads on light and dark. */
const FILL: Record<LockShape["color"], string> = {
  red: "#d93b3b",
  blue: "#2f6bd8",
  yellow: "#f6c62f",
  green: "#2f9e57",
  purple: "#8e5bd6",
  orange: "#f08a24",
};

/** Big, small, or no size given. Big / small = 1.8 (at least 1.6, for the size sorts). */
export const SHAPE_SCALE = { big: 1, small: 0.56, none: 0.82 } as const;

function starPoints(): string {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 18 : 7.5;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(20 + r * Math.cos(a)).toFixed(1)},${(21 + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}
const STAR = starPoints();
const HEART = "M20 35 C8 26 3 19 3 12.5 C3 7 7 3.5 12 3.5 C15.5 3.5 18.5 5.5 20 8.5 C21.5 5.5 24.5 3.5 28 3.5 C33 3.5 37 7 37 12.5 C37 19 32 26 20 35 Z";

function Outline({ shape }: { shape: LockShape["shape"] }) {
  switch (shape) {
    case "circle": return <circle cx={20} cy={20} r={17} />;
    case "square": return <rect x={4} y={4} width={32} height={32} rx={3} />;
    case "triangle": return <polygon points="20,3 37,35 3,35" />;
    case "star": return <polygon points={STAR} />;
    case "heart": return <path d={HEART} />;
    case "diamond": return <polygon points="20,2 37,20 20,38 3,20" />;
  }
}

/** The shape alone, for a button or a labelled picture to hold. */
export function ShapeGlyph({ shape }: { shape: LockShape }) {
  const size = shape.size ?? "none";
  const scale = SHAPE_SCALE[size];
  return (
    <svg className="lock-shape" viewBox="0 0 40 40" aria-hidden="true" focusable="false" data-size={size} data-scale={scale}>
      <g transform={`translate(20 20) scale(${scale}) translate(-20 -20)`} fill={FILL[shape.color]} stroke="#1d1208" strokeWidth={2.5 / scale} strokeLinejoin="round">
        <Outline shape={shape.shape} />
      </g>
    </svg>
  );
}

/** A shape shown, not pressed: a picture with its name. */
export function ShapePicture({ shape, label, className }: { shape: LockShape; label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} className={className}>
      <ShapeGlyph shape={shape} />
    </span>
  );
}
