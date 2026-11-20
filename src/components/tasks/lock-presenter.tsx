"use client";

/**
 * The lock's face: the work surface for a lock task (slice 4), on the Realm's board and on the
 * Side Quests page. One surface per puzzle family, all tap-to-solve, never dragged (R-C2), so a
 * finger, a mouse, a keyboard and a screen reader all work it:
 *
 * - grids (`shapes3`, `cage4`, `cage5`): tap a square to cycle it; number keys set it, arrows move;
 * - the nonogram: tap to fill, mark (·) or clear;
 * - logic grids: tap a person × item square through ✓, ✗ and blank; the ✓s are the answer;
 * - patterns: tap a shape in the tray, then a gap (or the gap, then the shape);
 * - the balance: tap stones on and off the pan;
 * - sorts: tap an item, then a bin; tap a placed item to take it out again.
 *
 * "Check the lock" waits for a full board, so an unfinished one never spends a try. The rules are
 * marked (`checkLock`, from the visible puzzle alone: R-F3) only on a second chance, never before
 * the first check, so the face is no free solver; a sort marks nothing, since where an item belongs
 * is its answer (RF-c). A second chance opens on the first try, and the same board is not sent twice.
 * After a miss the solved board (`AttemptResult.reveal`, R-F2) is drawn read-only; its words ("Here
 * is one way it fits.") are the player's feedback line beside it, said once, never repeated here.
 *
 * The keys the face uses (digits, arrows, Enter, Space, Backspace, Delete) stay on it, so they never
 * cast or walk in the Realm; every other key bubbles, so Esc still closes the board. The numbers on a lock are the puzzle itself (cage targets, run clues, stone
 * weights), so `numerals` changes only what the face adds: the balance's pan totals, which give way
 * to which side is heavier. Shape grids and patterns carry no numbers at all.
 */
import { useEffect, useId, useRef, useState } from "react";
import { TASK_CODECS } from "@/lib/tasks/codecs";
import { checkLock, isSort, responseFits, type LockView } from "@/lib/tasks/lock-rules";
import { blankBoard, boardFromCells, boardIsFull, familyOf, markedLines, NO_MARKS, responseOf, type MarkedLines } from "@/lib/tasks/lock-board";
import type { FlowState } from "@/lib/utils/deed-run-flow";
import type { PresenterProps } from "./presenters";
import { GridSurface, LogicSurface, NonogramSurface } from "./lock-grids";
import { BalanceSurface, PatternSurface, SortSurface } from "./lock-pieces";
import "./lock.css";

export function LockPresenter(props: PresenterProps<"lock">) {
  // A fresh face for every task: nothing tapped carries over to the next one.
  return <Lock key={`${props.flow.index}:${props.task.id}`} {...props} />;
}

/** What every surface is handed: the puzzle, the board it draws, and how to change one place of it. */
export type SurfaceProps<V extends LockView = LockView> = {
  view: V;
  board: number[];
  set(i: number, value: number): void;
  /** Resolved, or the player is busy: drawn, never changed. */
  readOnly: boolean;
  marks: MarkedLines;
  numerals: boolean;
};

/** A stored response as a board for this puzzle, or null when it is not one (never trusted blindly). */
function boardOf(view: LockView, encoded: string | undefined): number[] | null {
  if (!encoded) return null;
  const r = TASK_CODECS.lock.decode(encoded);
  return r && responseFits(view, r) ? boardFromCells(view, r.cells) : null;
}

/** The keys the face answers to; only these are kept from the game. */
const FACE_KEYS = /^(?:[0-9]|Arrow(?:Up|Down|Left|Right)|Enter| |Spacebar|Backspace|Delete)$/;

/** A face opens blank, or on the first try when a run is picked back up on its second chance. */
const openingBoard = (view: LockView, flow: FlowState): number[] =>
  (flow.phase === "second-chance" ? boardOf(view, flow.ruledOut[0]) : null) ?? blankBoard(view);

function Lock({ task, flow, variant, numerals, calm, disabled, onRespond }: PresenterProps<"lock">) {
  const { view } = task;
  const [board, setBoard] = useState(() => openingBoard(view, flow));
  const titleId = useId();
  const face = useRef<HTMLDivElement>(null);
  const resolved = flow.phase === "resolved";
  // After a miss, the solved board stands in for the child's own.
  const reveal = resolved && flow.result && !flow.result.correct ? boardOf(view, flow.result.reveal) : null;

  const response = responseOf(view, board);
  const encoded = TASK_CODECS.lock.encode(response);
  const tried = flow.ruledOut.some((s) => {
    const r = TASK_CODECS.lock.decode(s);
    return r !== null && TASK_CODECS.lock.sameResponse(r, response);
  });
  const canCheck = boardIsFull(view, board) && !resolved && !disabled && !tried;
  const marks = flow.phase === "second-chance" && !isSort(view.puzzle) ? markedLines(checkLock(view, response).broken) : NO_MARKS;

  // Focus follows the question: the face's first open place takes it (again on a second chance),
  // never a given square.
  useEffect(() => {
    if (flow.phase === "resolved") return;
    face.current?.querySelector<HTMLButtonElement>("button:not(:disabled):not([tabindex='-1']):not([aria-disabled='true'])")?.focus();
  }, [flow.phase]);

  const surface: SurfaceProps = {
    view,
    board: reveal ?? board,
    readOnly: resolved || disabled,
    marks: reveal ? NO_MARKS : marks,
    numerals,
    set: (i, value) => {
      if (resolved || disabled) return;
      setBoard((b) => b.map((x, j) => (j === i ? value : x)));
    },
  };

  return (
    <section
      className={`lock lock--${variant}${calm ? "" : " lock--move"}`}
      aria-labelledby={titleId}
      data-solved={reveal ? true : undefined}
      // The face's own keys are the face's: they never reach the game. Esc and the rest bubble.
      onKeyDown={(e) => {
        if (FACE_KEYS.test(e.key)) e.stopPropagation();
      }}
    >
      <h3 id={titleId} className="lock-title">
        The lock
      </h3>
      <div ref={face} className="lock-face">
        <Surface {...surface} />
      </div>
      {!resolved && (
        <button type="button" className="lock-go" disabled={!canCheck} onClick={() => canCheck && onRespond(encoded)}>
          Check the lock
        </button>
      )}
    </section>
  );
}

function Surface(props: SurfaceProps) {
  const { view } = props;
  switch (familyOf(view.puzzle)) {
    case "grid": return <GridSurface {...(props as SurfaceProps<Extract<LockView, { puzzle: "shapes3" | "cage4" | "cage5" }>>)} />;
    case "nonogram": return <NonogramSurface {...(props as SurfaceProps<Extract<LockView, { puzzle: "nono5" }>>)} />;
    case "logic": return <LogicSurface {...(props as SurfaceProps<Extract<LockView, { puzzle: "logic3" | "logic4" }>>)} />;
    case "pattern": return <PatternSurface {...(props as SurfaceProps<Extract<LockView, { puzzle: "pattern" }>>)} />;
    case "balance": return <BalanceSurface {...(props as SurfaceProps<Extract<LockView, { puzzle: "balance" }>>)} />;
    case "sort": return <SortSurface {...(props as SurfaceProps<Extract<LockView, { puzzle: "sort1" | "sort2" | "sort" }>>)} />;
  }
}
