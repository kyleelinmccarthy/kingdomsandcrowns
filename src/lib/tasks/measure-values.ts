/**
 * The bench's arithmetic on what the child can see: the labels on the pieces and the length typed.
 * The bench is never sent a piece's value or the answer (`MeasureView`), so the stepper and the
 * ruler read the labels and the typed text. It never adds the picked pieces up for the child: that
 * sum is what an assemble task asks (ruling RC-k). Client-safe and pure.
 */
import { TASK_CODECS } from "./codecs";
import { bareLabel } from "./measure-copy";
import { addRational, formatRational, lessRational, parseAnswer, sameValue, type Rational } from "./parse-answer";
import type { MeasureView } from "./types";

const ZERO: Rational = { n: BigInt(0), d: BigInt(1) };
const whole = (n: number): Rational => ({ n: BigInt(n), d: BigInt(1) });
const toNumber = (r: Rational) => Number(r.n) / Number(r.d);

/** A piece's length, read off its label ("3/4 foot" is 0.75); null when the label holds no length. */
export function labelValue(label: string): number | null {
  const r = parseAnswer(bareLabel(label));
  return r ? toNumber(r) : null;
}

/** The picked pieces as a sum still to work out, in the order offered ("1/2 + 1/4"): never its total. */
export function piecesExpression(pieces: string[], picked: number[]): string {
  return [...picked].sort((a, b) => a - b).map((i) => bareLabel(pieces[i] ?? "")).join(" + ");
}

/** The stepper's sizes, coarse to fine, each once: tens on a ruler of 100 or more, whole units, and the task's own step. */
export function stepSizes(view: Pick<MeasureView, "step" | "maxLength">): string[] {
  const max = view.maxLength ? parseAnswer(view.maxLength) : null;
  const sizes = max && !lessRational(max, whole(100)) ? ["10", "1"] : ["1"];
  const step = view.step ? parseAnswer(view.step) : null;
  if (view.step && step && !sizes.some((s) => sameValue(parseAnswer(s)!, step))) sizes.push(view.step);
  return sizes;
}

/**
 * Where a ruler to `end` is ticked: at the task's step when that makes no more than 24 ticks (a
 * quarter-foot ruler to 2 is ticked in quarters), otherwise at the smallest round multiple of the
 * step (1, 2 or 5 times a power of ten) that gives about ten. Always 0 and the end.
 */
export function rulerTicks(end: number, step?: string): number[] {
  const parsed = step ? parseAnswer(step) : null;
  const unit = parsed && toNumber(parsed) > 0 ? toNumber(parsed) : null;
  let every: number;
  if (unit !== null && end / unit <= 24) every = unit;
  else {
    const base = unit ?? 10 ** Math.floor(Math.log10(end / 10));
    every = base;
    for (let k = 0; every < end / 10 - 1e-9; k++) every = base * [2, 5, 10][k % 3] * 10 ** Math.floor(k / 3);
  }
  const ticks: number[] = [];
  for (let i = 0; i * every < end - 1e-9; i++) ticks.push(Number((i * every).toFixed(9)));
  return [...ticks, end];
}

/**
 * The typed length, one step longer (`dir` 1) or shorter (-1). Nothing typed (or nothing a length)
 * steps from 0. Never below 0, and never stepped past the ruler's end (`max`); a length already
 * typed past it is left as it is. Written in fractions when the step or the text is one.
 */
export function stepLength(text: string, step: string, dir: 1 | -1, max?: string): string {
  const now = parseAnswer(text) ?? ZERO;
  const by = parseAnswer(step);
  if (!by) return text;
  let next = addRational(now, { n: by.n * BigInt(dir), d: by.d });
  if (lessRational(next, ZERO)) next = ZERO;
  const end = max ? parseAnswer(max) : null;
  if (dir > 0 && end && lessRational(end, next)) next = lessRational(now, end) ? end : now;
  return formatRational(next, step.includes("/") || text.includes("/") ? "mixed" : "decimal");
}

/**
 * A stored first try, said back in the child's terms: the pieces' labels, or the length as written.
 * The length box is labelled with its unit, so the length goes without it (and never "1 feet").
 */
export function firstTryText(view: Pick<MeasureView, "pieces">, encoded: string): string | null {
  const r = TASK_CODECS.measure.decode(encoded);
  if (r === null) return null;
  return Array.isArray(r) ? r.map((i) => view.pieces?.[i] ?? "?").join(" + ") : r;
}
