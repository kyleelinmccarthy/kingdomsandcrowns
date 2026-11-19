"use client";

/**
 * The bench: the work surface for a measure task. Assemble is pieces tapped on and off (each a
 * toggle) until they reach the mark, then "Fit it"; the picked pieces are listed as a sum to work
 * out, never totalled (the sum is what the task asks, RC-k), and laid to scale against the mark.
 * Cut is a length typed (or stepped with − and +) against a ruler ticked at the task's step, then
 * "Cut it". No dragging, so a mouse, a finger, a keyboard and a screen reader all work it (ruling
 * R-C2). Beside it, a side quest's run draws its building going up as bench tasks are solved
 * (`SiteElevation`), and a build run draws the plan going up (`PlanElevation`).
 *
 * The bench is shown labels, never values or the answer (`MeasureView`), and hands back the response
 * encoded by `TASK_CODECS.measure`. It ignores `numerals`: it cannot work without numbers (R-C10).
 * A key typed into the length stays in the box: it never moves the hero, casts, or closes the run.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { TASK_CODECS, CUT_MAX_CHARS } from "@/lib/tasks/codecs";
import { cutText, firstTryText, labelValue, piecesExpression, rulerTicks, stepLength, stepSizes } from "@/lib/tasks/measure-values";
import { cutWords, type CutWords } from "@/lib/tasks/measure-copy";
import { parseAnswer } from "@/lib/tasks/parse-answer";
import type { MeasureView } from "@/lib/tasks/types";
import type { FlowState } from "@/lib/utils/deed-run-flow";
import type { PresenterProps } from "./presenters";
import { PlanElevation } from "./plan-elevation";
import { SiteElevation } from "./site-elevation";
import "./bench.css";

export function BenchPresenter(props: PresenterProps<"measure">) {
  // A fresh bench for every task: nothing picked or typed carries over to the next one.
  return <Bench key={`${props.flow.index}:${props.task.id}`} {...props} />;
}

function Bench({ task, flow, variant, calm, disabled, site, onRespond }: PresenterProps<"measure">) {
  const { view } = task;
  const first = flow.phase !== "asking" ? flow.ruledOut[0] : undefined;
  const firstTry = first ? firstTryText(view, first) : null;
  const surface = { view, flow, disabled, onRespond };
  const titleId = useId();
  return (
    <section className={`bench bench--${variant}`} aria-labelledby={titleId}>
      <h3 id={titleId} className="bench-title">
        The bench
      </h3>
      <div className="bench-body">
        <div className="bench-work">
          {view.mode === "assemble" ? <Assemble {...surface} /> : <Cut {...surface} />}
          {firstTry && <p className="bench-first">Your first try: {firstTry}</p>}
        </div>
        {site && (site.plan ? <PlanElevation site={site} calm={calm} /> : <SiteElevation site={site} calm={calm} />)}
      </div>
    </section>
  );
}

type Surface = { view: MeasureView; flow: FlowState; disabled: boolean; onRespond(encoded: string): void };

/** Whether `encoded` is the first try already ruled out: the server would refuse it, so it is not offered. */
const ruledOut = (flow: FlowState, encoded: string) => flow.ruledOut.some((r) => TASK_CODECS.measure.sameResponse(r, encoded));

/** What a bench opens holding: nothing, or the first try when a run is picked back up on its second chance. */
const openingTry = (flow: FlowState) => (flow.phase === "second-chance" && flow.ruledOut[0] ? TASK_CODECS.measure.decode(flow.ruledOut[0]) : null);

function Assemble({ view, flow, disabled, onRespond }: Surface) {
  const pieces = view.pieces ?? [];
  const [picked, setPicked] = useState<number[]>(() => {
    const first = openingTry(flow);
    return Array.isArray(first) ? first : [];
  });
  const resolved = flow.phase === "resolved";
  const firstPiece = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (flow.phase !== "resolved") firstPiece.current?.focus();
  }, [flow.phase]);

  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  const encoded = TASK_CODECS.measure.encode(picked);
  // The pieces as a sum to work out, never its total: the sum is what the task asks (RC-k).
  const expression = piecesExpression(pieces, picked);
  const canFit = picked.length > 0 && !resolved && !disabled && !ruledOut(flow, encoded);

  return (
    <>
      <div className="bench-pieces">
        {pieces.map((label, i) => (
          <button
            key={i}
            ref={i === 0 ? firstPiece : undefined}
            type="button"
            className="bench-piece-button"
            aria-pressed={picked.includes(i)}
            disabled={resolved || disabled}
            onClick={() => toggle(i)}
          >
            {label}
          </button>
        ))}
      </div>
      <MarkTrack pieces={pieces} picked={picked} target={view.target} />
      <p className="bench-picked" aria-live="polite">
        {expression && `Your pieces: ${expression}`}
      </p>
      <button type="button" className="bench-go" disabled={!canFit} onClick={() => onRespond(encoded)}>
        Fit it
      </button>
    </>
  );
}

/** The mark, and the picked pieces laid end to end against it, to scale. */
function MarkTrack({ pieces, picked, target }: { pieces: string[]; picked: number[]; target?: string }) {
  const mark = target ? labelValue(target) : null;
  const lengths = [...picked].sort((a, b) => a - b).map((i) => labelValue(pieces[i]) ?? 0);
  const total = lengths.reduce((a, b) => a + b, 0);
  const scale = Math.max(mark ?? 0, total) || 1;
  return (
    <div className="bench-mark">
      <span className="bench-mark-label">
        Mark: <strong>{target}</strong>
      </span>
      {mark !== null && (
        <div className="bench-track" aria-hidden="true">
          {lengths.map((v, i) => (
            <span key={i} className="bench-track-piece" style={{ width: `${(v / scale) * 100}%` }} />
          ))}
          <span className="bench-track-mark" style={{ left: `${(mark / scale) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

function Cut({ view, flow, disabled, onRespond }: Surface) {
  const [text, setText] = useState(() => {
    const first = openingTry(flow);
    // Stored in lowest terms; put back in the box as the child wrote it ("9.42", not "471/50").
    return typeof first === "string" ? (cutText(view, first) ?? first) : "";
  });
  const resolved = flow.phase === "resolved";
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  // The typed length is the main way in, so it takes focus first (and again on a second chance).
  useEffect(() => {
    if (flow.phase !== "resolved") input.current?.focus();
  }, [flow.phase]);

  // What the number is called: a length is cut against a ruler; an area, a volume, a weight or a count is set on a scale.
  const words = cutWords(view.quantity, view.unit);
  const readable = parseAnswer(text) !== null;
  const encoded = TASK_CODECS.measure.encode(text);
  const canCut = readable && !resolved && !disabled && !ruledOut(flow, encoded);
  const sizes = stepSizes(view);
  const step = (size: string, dir: 1 | -1) => setText((t) => stepLength(t, size, dir, view.maxLength));
  const stepper = (dir: 1 | -1) => (dir < 0 ? sizes : [...sizes].reverse()).map((size) => (
    <button key={`${dir}${size}`} type="button" className="bench-step" disabled={resolved || disabled} onClick={() => step(size, dir)}>
      {dir < 0 ? "−" : "+"}
      {size}
    </button>
  ));

  return (
    <form
      className="bench-cut"
      onSubmit={(e) => {
        e.preventDefault();
        if (canCut) onRespond(encoded);
      }}
    >
      <label htmlFor={id} className="bench-length-label">
        {words.label}
      </label>
      <input
        ref={input}
        id={id}
        className="bench-length"
        type="text"
        // A phone's number pad has no slash: a length in fractions gets the keyboard.
        inputMode={view.step?.includes("/") ? "text" : "decimal"}
        autoComplete="off"
        spellCheck={false}
        maxLength={CUT_MAX_CHARS}
        value={text}
        disabled={resolved}
        readOnly={disabled}
        aria-describedby={text && !readable ? `${id}-how` : undefined}
        // Every key typed here is the box's: the game's keys (W to walk, 1 to cast, Esc to leave) stay out.
        onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
        onChange={(e) => setText(e.target.value)}
      />
      {text && !readable && (
        <p id={`${id}-how`} className="bench-how">
          {words.hint}
        </p>
      )}
      <div className="bench-stepper">
        {stepper(-1)}
        {stepper(1)}
      </div>
      <Ruler text={text} max={view.maxLength} step={view.step} name={words.gauge} />
      <button type="submit" className="bench-go" disabled={!canCut}>
        {words.verb}
      </button>
    </form>
  );
}

/**
 * A ruler to the task's length, with the board drawn to the length typed (stopped at the ruler's
 * end). `name` is what it is called aloud: a ruler for a length, a scale for anything else.
 */
function Ruler({ text, max, step, name }: { text: string; max?: string; step?: string; name: CutWords["gauge"] }) {
  const end = max ? labelValue(max) : null;
  if (!end || end <= 0) return null;
  const typed = parseAnswer(text) ? labelValue(text) : null;
  const value = typed === null ? null : Math.max(0, Math.min(end, typed));
  const W = 200;
  const ticks = rulerTicks(end, step);
  const label = name(max!, typed === null ? undefined : text.trim());
  return (
    <svg className="bench-ruler" viewBox={`0 0 ${W + 8} 34`} role="img" aria-label={label}>
      {value !== null && <rect className="bench-ruler-board" x={4} y={4} width={(value / end) * W} height={12} rx={2} />}
      <line className="bench-ruler-edge" x1={4} y1={20} x2={W + 4} y2={20} />
      {ticks.map((t) => (
        <line key={t} className="bench-ruler-tick" x1={4 + (t / end) * W} y1={20} x2={4 + (t / end) * W} y2={t === 0 || t === end ? 30 : 26} />
      ))}
      <text className="bench-ruler-num" x={4} y={33} textAnchor="start">0</text>
      <text className="bench-ruler-num" x={W + 4} y={33} textAnchor="end">{max}</text>
    </svg>
  );
}
