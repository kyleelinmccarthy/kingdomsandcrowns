"use client";

import { useRef, useState } from "react";
import {
  DRAWING_HEIGHT,
  DRAWING_MAX_POINTS,
  DRAWING_MAX_STROKES,
  DRAWING_PALETTE,
  DRAWING_WIDTH,
  DRAWING_WIDTHS,
  hasDrawing,
  strokePathD,
  type Drawing,
  type DrawingStroke,
} from "@/lib/utils/drawing";
import "./drawing-pad.css";

/** Colour names for the eight palette inks, in `DRAWING_PALETTE` order. */
const SWATCH_NAMES = ["Black", "Brown", "Red", "Orange", "Gold", "Green", "Blue", "Purple"] as const;
const WIDTH_NAMES = ["Thin", "Medium", "Thick"] as const;

const FULL_LINE = "The page is full. Undo or clear to draw more.";

function pointCount(strokes: DrawingStroke[]): number {
  return strokes.reduce((n, s) => n + s.p.length / 2, 0);
}

/**
 * A touch-first drawing pad: a parchment page the hero draws on with a finger, a pen or a mouse.
 * It is controlled: `value` is what is on the page and `onChange` fires after each stroke ends (and
 * on Undo and Clear) with a drawing `parseDrawing` accepts, or null when the page is empty.
 */
export function DrawingPad({
  value,
  onChange,
  disabled = false,
}: {
  value: Drawing | null;
  onChange: (d: Drawing | null) => void;
  disabled?: boolean;
}) {
  const [color, setColor] = useState(0);
  const [width, setWidth] = useState(1);
  /** The stroke being drawn right now, so it shows under the finger before it is committed. */
  const [live, setLive] = useState<number[] | null>(null);
  const active = useRef<{ id: number; p: number[] } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const strokes = value?.strokes ?? [];
  const used = pointCount(strokes);
  const full = strokes.length >= DRAWING_MAX_STROKES || used >= DRAWING_MAX_POINTS;

  /** Client coordinates to whole numbers on the 320x240 page, kept on the page. */
  function toPad(clientX: number, clientY: number): [number, number] | null {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.round(((clientX - rect.left) / rect.width) * DRAWING_WIDTH);
    const y = Math.round(((clientY - rect.top) / rect.height) * DRAWING_HEIGHT);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [Math.min(DRAWING_WIDTH, Math.max(0, x)), Math.min(DRAWING_HEIGHT, Math.max(0, y))];
  }

  function handleDown(e: React.PointerEvent<SVGSVGElement>) {
    if (disabled || full || active.current) return;
    const pt = toPad(e.clientX, e.clientY);
    if (!pt) return;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Capture is a nicety; drawing still works without it.
    }
    e.preventDefault();
    active.current = { id: e.pointerId, p: [pt[0], pt[1]] };
    setLive([pt[0], pt[1]]);
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    const pt = toPad(e.clientX, e.clientY);
    if (!pt) return;
    const n = a.p.length;
    if (a.p[n - 2] === pt[0] && a.p[n - 1] === pt[1]) return;
    // One long scribble must not run past the point cap: stop adding, the stroke still ends cleanly.
    if (used + a.p.length / 2 >= DRAWING_MAX_POINTS) return;
    a.p.push(pt[0], pt[1]);
    setLive(a.p.slice());
  }

  function handleEnd(e: React.PointerEvent<SVGSVGElement>) {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    active.current = null;
    setLive(null);
    const stroke: DrawingStroke = { c: color, w: width, p: a.p };
    onChange({ v: 1, strokes: [...strokes, stroke] });
  }

  function undo() {
    const next = strokes.slice(0, -1);
    onChange(next.length > 0 ? { v: 1, strokes: next } : null);
  }

  const empty = !hasDrawing(value);

  return (
    <div className="drawing-pad">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${DRAWING_WIDTH} ${DRAWING_HEIGHT}`}
        role="img"
        aria-label="Your drawing"
        className="drawing-pad__canvas"
        data-disabled={disabled ? "true" : undefined}
        style={{ touchAction: "none" }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleEnd}
        onPointerCancel={handleEnd}
      >
        {strokes.map((s, i) => (
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
        {live && (
          <path
            d={strokePathD({ c: color, w: width, p: live })}
            stroke={DRAWING_PALETTE[color]}
            strokeWidth={DRAWING_WIDTHS[width]}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      <p className="drawing-pad__full" role="status" aria-live="polite">
        {full ? FULL_LINE : ""}
      </p>

      <div className="drawing-pad__row" role="group" aria-label="Ink colour">
        {DRAWING_PALETTE.map((hex, i) => (
          <button
            key={hex}
            type="button"
            className="drawing-pad__swatch"
            style={{ backgroundColor: hex }}
            aria-label={SWATCH_NAMES[i]}
            aria-pressed={color === i}
            disabled={disabled}
            onClick={() => setColor(i)}
          />
        ))}
      </div>

      <div className="drawing-pad__row">
        <div className="drawing-pad__row" role="group" aria-label="Line width">
          {WIDTH_NAMES.map((name, i) => (
            <button
              key={name}
              type="button"
              className="drawing-pad__tool"
              aria-label={name}
              aria-pressed={width === i}
              disabled={disabled}
              onClick={() => setWidth(i)}
            >
              <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">
                <line
                  x1="3"
                  y1="7"
                  x2="25"
                  y2="7"
                  stroke="currentColor"
                  strokeWidth={DRAWING_WIDTHS[i]}
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ))}
        </div>
        <button type="button" className="drawing-pad__tool" onClick={undo} disabled={disabled || empty}>
          Undo
        </button>
        <button type="button" className="drawing-pad__tool" onClick={() => onChange(null)} disabled={disabled || empty}>
          Clear
        </button>
      </div>
    </div>
  );
}
