"use client";

/**
 * The lock's square surfaces (see `lock-presenter.tsx`): the number and shape grids, the nonogram
 * and the logic grid. Each square is a button named by its row, its column and what it holds. One
 * square at a time is in the tab order and the arrows move between them, so a keyboard crosses a
 * 5 × 5 board without 25 tab stops.
 */
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { tokenName } from "@/lib/tasks/lock-shapes";
import type { LockView } from "@/lib/tasks/lock-rules";
import { cageLayout, cageWords, cycleValue, gridSide, isGiven } from "@/lib/tasks/lock-board";
import type { SurfaceProps } from "./lock-presenter";
import { ShapeGlyph, ShapePicture } from "./lock-shape";

type GridView = Extract<LockView, { puzzle: "shapes3" | "cage4" | "cage5" }>;
type NonoView = Extract<LockView, { puzzle: "nono5" }>;
type LogicView = Extract<LockView, { puzzle: "logic3" | "logic4" }>;

/** Said on a square inside a marked rule, after its value. */
const NOT_YET = ", doesn't fit yet";

const ARROWS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

/**
 * A roving tab stop over a `rows` × `cols` board, starting on square `start` (a grid's first open
 * one): the arrows move it (and the focus), stopping at the edges. `keyed(i, e)` handles the arrows
 * and hands any other key to the surface.
 */
function useRoving(rows: number, cols: number, start = 0) {
  const [active, setActive] = useState(start);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const keyed = (i: number, e: KeyboardEvent, other: (key: string) => boolean) => {
    const step = ARROWS[e.key];
    if (step) {
      const r = Math.min(rows - 1, Math.max(0, Math.floor(i / cols) + step[0]));
      const c = Math.min(cols - 1, Math.max(0, (i % cols) + step[1]));
      const next = r * cols + c;
      setActive(next);
      refs.current[next]?.focus();
      e.preventDefault();
      return;
    }
    if (other(e.key)) e.preventDefault();
  };
  return {
    keyed,
    stop: (i: number) => ({
      ref: (el: HTMLButtonElement | null) => {
        refs.current[i] = el;
      },
      tabIndex: i === active ? 0 : -1,
      onFocus: () => setActive(i),
    }),
  };
}

/** A key that sets a square to a value 0..max: the digit itself, or 0 for Backspace and Delete. */
function keyValue(key: string, max: number): number | null {
  if (key === "Backspace" || key === "Delete" || key === "0") return 0;
  if (/^[1-9]$/.test(key) && Number(key) <= max) return Number(key);
  return null;
}

const sideStyle = (side: number) => ({ "--side": side }) as CSSProperties;

/** `shapes3`, `cage4`, `cage5`: tap to cycle blank → 1 → … → n → blank; givens stay. */
export function GridSurface({ view, board, set, readOnly, marks }: SurfaceProps<GridView>) {
  const side = gridSide(view);
  const max = view.puzzle === "shapes3" ? view.symbols.length : side;
  const roving = useRoving(side, side, Math.max(0, board.findIndex((_, i) => !isGiven(view, i))));
  const cages = view.puzzle === "shapes3" ? null : cageLayout(view.cages, side);
  const words = (v: number) => (v === 0 ? "empty" : view.puzzle === "shapes3" ? tokenName(view.symbols[v - 1]) : String(v));

  return (
    <>
      {view.puzzle === "shapes3" && (
        <div className="lock-legend">
          {/* Each shape with its key: 1 to 3 put it in the square that has focus. */}
          {view.symbols.map((s, k) => (
            <span key={k} className="lock-legend-item">
              <ShapePicture shape={s} label={`${tokenName(s)}, key ${k + 1}`} className="lock-legend-shape" />
              <span className="lock-legend-key" aria-hidden="true">{k + 1}</span>
            </span>
          ))}
        </div>
      )}
      <div className={`lock-grid${view.puzzle === "shapes3" ? " lock-grid--shapes" : ""}`} style={sideStyle(side)}>
        {board.map((v, i) => {
          const r = Math.floor(i / side);
          const c = i % side;
          const given = isGiven(view, i);
          const cage = cages?.[i];
          const broken = marks.rows.has(r) || marks.cols.has(c) || (cage !== undefined && marks.cages.has(cage.cage));
          const label = `Row ${r + 1}, column ${c + 1}: ${words(v)}${given ? ", given" : ""}${cage && cage.cage >= 0 && view.puzzle !== "shapes3" ? `, cage ${cageWords(view.cages[cage.cage])}` : ""}${broken ? NOT_YET : ""}`;
          const walls = cage ? `${cage.top ? " lock-wall-t" : ""}${cage.right ? " lock-wall-r" : ""}${cage.bottom ? " lock-wall-b" : ""}${cage.left ? " lock-wall-l" : ""}` : "";
          return (
            <button
              key={i}
              type="button"
              {...roving.stop(i)}
              className={`lock-cell${given ? " lock-cell--given" : ""}${walls}`}
              data-broken={broken || undefined}
              aria-label={label}
              aria-disabled={given || undefined}
              disabled={readOnly}
              onClick={() => !given && set(i, cycleValue(v, max))}
              onKeyDown={(e) => roving.keyed(i, e, (key) => {
                const next = keyValue(key, max);
                if (next === null) return false;
                if (!given) set(i, next);
                return true;
              })}
            >
              {cage?.label && <span className="lock-cage-label" aria-hidden="true">{cage.label}</span>}
              {v !== 0 && (view.puzzle === "shapes3"
                ? <ShapeGlyph shape={view.symbols[v - 1]} />
                : <span className="lock-cell-value" aria-hidden="true">{v}</span>)}
            </button>
          );
        })}
      </div>
    </>
  );
}

const NONO_WORDS = ["empty", "filled", "marked empty"];

/** A line's run clue, as shown and as said: "2 1" / "2, 1"; an empty line is 0. */
const clueText = (clue: number[], sep: string) => (clue.length ? clue.join(sep) : "0");

/** `nono5`: tap to cycle empty → filled → marked (·) → empty; 1 fills, 2 marks, 0 clears. */
export function NonogramSurface({ view, board, set, readOnly, marks }: SurfaceProps<NonoView>) {
  const side = 5;
  const roving = useRoving(side, side);
  // A clue is said in visually hidden words ("Row 2 clue: 2, 1, doesn't fit yet"); the numbers drawn are for the eye.
  const clue = (kind: "row" | "col", k: number, lines: number[][], broken: boolean): ReactNode => (
    <span key={`${kind}${k}`} className={`lock-clue-${kind}`} data-broken={broken || undefined}>
      <span className="sr-only">{`${kind === "row" ? "Row" : "Column"} ${k + 1} clue: ${clueText(lines[k] ?? [], ", ")}`}</span>
      {(lines[k]?.length ? lines[k] : [0]).map((n, j) => (
        <span key={j} aria-hidden="true">{n}</span>
      ))}
      {broken && <span className="sr-only">{NOT_YET}</span>}
    </span>
  );
  return (
    <div className="lock-nono" style={sideStyle(side)}>
      <span className="lock-nono-corner" aria-hidden="true" />
      {view.cols.map((_, k) => clue("col", k, view.cols, marks.cols.has(k)))}
      {Array.from({ length: side }, (_, r) => [
        clue("row", r, view.rows, marks.rows.has(r)),
        ...Array.from({ length: side }, (_, c) => {
          const i = r * side + c;
          const v = board[i];
          const broken = marks.rows.has(r) || marks.cols.has(c);
          return (
            <button
              key={i}
              type="button"
              {...roving.stop(i)}
              className={`lock-cell lock-cell--nono lock-cell--nono-${v}`}
              data-broken={broken || undefined}
              aria-label={`Row ${r + 1}, column ${c + 1}: ${NONO_WORDS[v] ?? "empty"}${broken ? NOT_YET : ""}`}
              disabled={readOnly}
              onClick={() => set(i, cycleValue(v, 2))}
              onKeyDown={(e) => roving.keyed(i, e, (key) => {
                const next = keyValue(key, 2);
                if (next === null) return false;
                set(i, next);
                return true;
              })}
            >
              {v === 2 && <span aria-hidden="true">·</span>}
            </button>
          );
        }),
      ])}
    </div>
  );
}

const LOGIC_WORDS = ["empty", "yes", "no"];
const LOGIC_MARK = ["", "✓", "✗"];

/**
 * `logic3`, `logic4`: the clues above a person × item table. Tap a square through ✓, ✗ and blank
 * (1 ticks, 2 crosses, 0 clears). The ✓s are the answer, one per person (`lock-board`).
 */
export function LogicSurface({ view, board, set, readOnly, marks }: SurfaceProps<LogicView>) {
  const n = view.rows.length;
  const roving = useRoving(n, n);
  return (
    <>
      <ol className="lock-clues">
        {view.clues.map((c, k) => (
          <li key={k} data-broken={marks.clues.has(k) || undefined}>
            {c.text}
            {marks.clues.has(k) && <span className="sr-only">{NOT_YET}</span>}
          </li>
        ))}
      </ol>
      <table className="lock-logic" style={sideStyle(n)}>
        <thead>
          <tr>
            <td />
            {view.cols.map((col, c) => (
              <th key={c} scope="col" data-broken={marks.cols.has(c) || undefined}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row, r) => (
            <tr key={r}>
              <th scope="row">{row}</th>
              {view.cols.map((col, c) => {
                const i = r * n + c;
                const v = board[i];
                const broken = marks.cols.has(c);
                return (
                  <td key={c}>
                    <button
                      type="button"
                      {...roving.stop(i)}
                      className={`lock-cell lock-cell--logic lock-cell--logic-${v}`}
                      data-broken={broken || undefined}
                      aria-label={`${row}, ${col}: ${LOGIC_WORDS[v] ?? "empty"}${broken ? NOT_YET : ""}`}
                      disabled={readOnly}
                      onClick={() => set(i, cycleValue(v, 2))}
                      onKeyDown={(e) => roving.keyed(i, e, (key) => {
                        const next = keyValue(key, 2);
                        if (next === null) return false;
                        set(i, next);
                        return true;
                      })}
                    >
                      <span aria-hidden="true">{LOGIC_MARK[v]}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
