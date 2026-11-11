/**
 * The bench's arithmetic on what the child can see: the labels on the pieces and the length typed.
 * The bench is never sent a piece's value or the answer (`MeasureView`), so the running total and
 * the stepper read the labels and the typed text. Client-safe and pure.
 */
import { TASK_CODECS } from "./codecs";
import { bareLabel } from "./measure-copy";
import { formatRational, parseAnswer, type Rational } from "./parse-answer";
import type { MeasureView } from "./types";

const ZERO: Rational = { n: BigInt(0), d: BigInt(1) };
const add = (a: Rational, b: Rational): Rational => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const less = (a: Rational, b: Rational) => a.n * b.d < b.n * a.d;
const toNumber = (r: Rational) => Number(r.n) / Number(r.d);

/** A piece's length, read off its label ("3/4 foot" is 0.75); null when the label holds no length. */
export function labelValue(label: string): number | null {
  const r = parseAnswer(bareLabel(label));
  return r ? toNumber(r) : null;
}

/** What the picked pieces add up to, written the way their labels are ("3/4", "1.75", "9"); null when a label holds no length. */
export function sumOfLabels(labels: string[]): string | null {
  let sum = ZERO;
  for (const label of labels) {
    const r = parseAnswer(bareLabel(label));
    if (!r) return null;
    sum = add(sum, r);
  }
  return formatRational(sum, labels.some((l) => bareLabel(l).includes("/")) ? "fraction" : "decimal");
}

/** The stepper's sizes, coarse to fine: tens on a ruler of 100 or more, whole units, and the task's own step. */
export function stepSizes(view: Pick<MeasureView, "step" | "maxLength">): string[] {
  const max = view.maxLength ? parseAnswer(view.maxLength) : null;
  const step = view.step ? parseAnswer(view.step) : null;
  const sizes = max && !less(max, { n: BigInt(100), d: BigInt(1) }) ? ["10", "1"] : ["1"];
  if (view.step && step && !(step.n === step.d)) sizes.push(view.step);
  return sizes;
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
  let next = add(now, { n: by.n * BigInt(dir), d: by.d });
  if (less(next, ZERO)) next = ZERO;
  const end = max ? parseAnswer(max) : null;
  if (dir > 0 && end && less(end, next)) next = less(now, end) ? end : now;
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
