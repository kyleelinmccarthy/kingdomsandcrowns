"use client";

/**
 * The lock's loose-piece surfaces (see `lock-presenter.tsx`): the pattern, the balance and the
 * sorts. Nothing is dragged: a piece is tapped to pick it, then its place is tapped.
 */
import { useState } from "react";
import { tokenName } from "@/lib/tasks/lock-shapes";
import type { LockShape, LockView } from "@/lib/tasks/lock-rules";
import type { SurfaceProps } from "./lock-presenter";
import { ShapeGlyph, ShapePicture } from "./lock-shape";

type PatternView = Extract<LockView, { puzzle: "pattern" }>;
type BalanceView = Extract<LockView, { puzzle: "balance" }>;
type SortView = Extract<LockView, { puzzle: "sort1" | "sort2" | "sort" }>;

/** The first gap still empty, other than `skip`; null when every gap is filled. */
function nextEmpty(board: number[], skip?: number): number | null {
  const k = board.findIndex((x, j) => x === 0 && j !== skip);
  return k === -1 ? null : k;
}

/**
 * `pattern`: the repeat with its gaps, and a tray of shapes. Tap a tray shape, then a gap (or the
 * gap, then the shape). The first empty gap starts picked, so with one gap a single tap fills it.
 * Tapping a filled gap empties it.
 */
export function PatternSurface({ view, board, set, readOnly, marks }: SurfaceProps<PatternView>) {
  const [gap, setGap] = useState<number | null>(() => nextEmpty(board));
  const [tray, setTray] = useState<number | null>(null);
  const fill = (k: number, t: number) => {
    set(k, t + 1);
    setTray(null);
    setGap(nextEmpty(board, k));
  };
  let k = -1;
  return (
    <>
      <ol className="lock-seq">
        {view.sequence.map((s, i) => {
          if (s) return (
            <li key={i}>
              <ShapePicture shape={s} label={`Space ${i + 1}: ${tokenName(s)}`} className="lock-seq-shape" />
            </li>
          );
          const at = ++k;
          const v = board[at];
          const shape = v > 0 ? view.tray[v - 1] : undefined;
          const broken = marks.blanks.has(at);
          return (
            <li key={i}>
              <button
                type="button"
                className="lock-gap"
                aria-label={`Space ${i + 1}: ${shape ? tokenName(shape) : "empty"}${broken ? ", doesn't fit yet" : ""}`}
                aria-pressed={!readOnly && gap === at}
                data-broken={broken || undefined}
                disabled={readOnly}
                onClick={() => {
                  if (tray !== null) return fill(at, tray);
                  if (v > 0) set(at, 0);
                  setGap(at);
                }}
              >
                {shape ? <ShapeGlyph shape={shape} /> : <span className="lock-gap-mark" aria-hidden="true">?</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="lock-tray" role="group" aria-label="Shapes to choose from">
        {view.tray.map((s, t) => (
          <button
            key={t}
            type="button"
            className="lock-piece"
            aria-label={`Tray: ${tokenName(s)}`}
            aria-pressed={!readOnly && tray === t}
            disabled={readOnly}
            onClick={() => (gap !== null ? fill(gap, t) : setTray(tray === t ? null : t))}
          >
            <ShapeGlyph shape={s} />
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * `balance`: the weight to match on one pan, the stones to tap onto the other. With `numerals` both
 * pans show their totals; without, the beam's tilt and a line say which side is heavier.
 */
export function BalanceSurface({ view, board, set, readOnly, marks, numerals }: SurfaceProps<BalanceView>) {
  const total = board.reduce((a, x, i) => a + (x === 1 ? view.weights[i] : 0), 0);
  const tilt = total === view.target ? "level" : total < view.target ? "left" : "right";
  const unit = view.unit ? ` ${view.unit}` : "";
  const tiltLine = tilt === "level" ? "The pans are level." : tilt === "left" ? "The weight's side is heavier." : "Your side is heavier.";
  return (
    <>
      <div className={`lock-scale lock-scale--${tilt}`}>
        <div className="lock-beam" aria-hidden="true" />
        <div className="lock-pans">
          <div className="lock-pan lock-pan--target">
            <span className="lock-pan-name">The weight</span>
            <span className="lock-pan-weight">{`${view.target}${unit}`}</span>
          </div>
          <div className="lock-pan" data-broken={marks.sum || undefined}>
            <span className="lock-pan-name">Your pan</span>
            <span className="lock-pan-stones">
              {board.flatMap((x, i) => (x === 1 ? [<span key={i} className="lock-stone lock-stone--on" aria-hidden="true">{view.weights[i]}</span>] : []))}
            </span>
            {numerals && <span className="lock-pan-total">{`Your pan: ${total}`}</span>}
            {marks.sum && <span className="sr-only">{", doesn't fit yet"}</span>}
          </div>
        </div>
        {!numerals && <p className="lock-tilt" aria-live="polite">{tiltLine}</p>}
      </div>
      <div className="lock-tray" role="group" aria-label="Stones">
        {view.weights.map((w, i) => (
          <button key={i} type="button" className="lock-stone" aria-label={`Stone ${w}`} aria-pressed={board[i] === 1} disabled={readOnly} onClick={() => set(i, board[i] === 1 ? 0 : 1)}>
            {w}
          </button>
        ))}
      </div>
    </>
  );
}

type Item = { name: string; shape?: LockShape; word?: string };

function sortParts(view: SortView): { items: Item[]; bins: string[] } {
  const shapes = (xs: LockShape[]) => xs.map((s) => ({ name: tokenName(s), shape: s }));
  switch (view.puzzle) {
    case "sort1": return { items: shapes(view.items), bins: view.bins };
    // bin = 2 × row + col, so the four read row by row.
    case "sort2": return { items: shapes(view.items), bins: [0, 1, 2, 3].map((b) => `${view.rows[Math.floor(b / 2)]}, ${view.cols[b % 2]}`) };
    case "sort": return { items: view.items.map((x) => ({ name: x.label, word: x.label })), bins: view.categories };
  }
}

function ItemFace({ item }: { item: Item }) {
  return item.shape ? <ShapeGlyph shape={item.shape} /> : <span className="lock-word">{item.word}</span>;
}

/**
 * The sorts: tap an item, then a bin; tap a placed item to send it back. Bins are labelled (`sort2`
 * is a 2 × 2 of them, row by row); a subject sort's items are words. Nothing is ever marked on a
 * sort (RF-c).
 */
export function SortSurface({ view, board, set, readOnly }: SurfaceProps<SortView>) {
  const [picked, setPicked] = useState<number | null>(null);
  const { items, bins } = sortParts(view);
  const put = (bin: number) => {
    if (picked === null) return;
    set(picked, bin + 1);
    setPicked(null);
  };
  return (
    <>
      <div className="lock-tray lock-tray--sort" role="group" aria-label="To sort">
        {items.map((item, i) => board[i] === 0 && (
          <button
            key={i}
            type="button"
            className={`lock-piece${item.word ? " lock-piece--word" : ""}`}
            aria-label={item.name}
            aria-pressed={picked === i}
            disabled={readOnly}
            onClick={() => setPicked(picked === i ? null : i)}
          >
            <ItemFace item={item} />
          </button>
        ))}
      </div>
      <div className={`lock-bins${view.puzzle === "sort2" ? " lock-bins--grid" : ""}`}>
        {bins.map((bin, b) => (
          <div key={b} className="lock-bin" role="group" aria-label={bin}>
            <button type="button" className="lock-bin-lid" aria-label={`Put in ${bin}`} disabled={readOnly || picked === null} onClick={() => put(b)}>
              {bin}
            </button>
            <div className="lock-bin-items">
              {items.map((item, i) => board[i] === b + 1 && (
                <button
                  key={i}
                  type="button"
                  className={`lock-piece lock-piece--placed${item.word ? " lock-piece--word" : ""}`}
                  aria-label={`${item.name}, in ${bin}`}
                  disabled={readOnly}
                  onClick={() => set(i, 0)}
                >
                  <ItemFace item={item} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
