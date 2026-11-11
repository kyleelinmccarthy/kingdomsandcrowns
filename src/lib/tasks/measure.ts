/**
 * The bench: assemble pieces to a mark, or cut a board to a length. Server-only, like the registry
 * (`presents` reads the bench generators). The response codec is client-safe and lives in
 * `codecs.ts`; this definition delegates to it.
 *
 * Values are exact rationals (`parse-answer`), so "3/4", "0.75" and "6/8" are one length, and any
 * set of pieces that sums to the mark is right, not only the stored `solution`.
 */
import { benchFor } from "./bench";
import { MAX_RESPONSE_CHARS } from "./choice";
import { CUT_MAX_CHARS, TASK_CODECS, cutBody, readPicks } from "./codecs";
import { assembleReveal, bareLabel } from "./measure-copy";
import { addRational, lessRational, parseAnswer, sameValue, type Rational } from "./parse-answer";
import type { MeasureResponse, MeasureTask, MeasureView, TaskKindDef } from "./types";

const ZERO: Rational = { n: BigInt(0), d: BigInt(1) };

/** A stored value as a rational; null for anything but a well-formed length string. */
const valueOf = (v: unknown): Rational | null => (typeof v === "string" ? parseAnswer(v) : null);

/** Picks that are a non-empty set of in-range piece indices, sorted; null otherwise. */
function validPicks(xs: readonly unknown[], t: MeasureTask): number[] | null {
  const n = Array.isArray(t.pieces) ? t.pieces.length : 0;
  if (xs.length === 0 || xs.length > n) return null;
  if (!xs.every((x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x < n)) return null;
  if (new Set(xs).size !== xs.length) return null;
  return [...(xs as number[])].sort((a, b) => a - b);
}

/** What the response measures: the chosen pieces' sum, or the cut. Null when it cannot be measured. */
function measured(t: MeasureTask, r: MeasureResponse): Rational | null {
  if (t.mode === "assemble") {
    if (!Array.isArray(r) || !Array.isArray(t.pieces) || validPicks(r, t) === null) return null;
    let sum = ZERO;
    for (const i of r) {
      const v = valueOf(t.pieces[i]?.value);
      if (!v) return null;
      sum = addRational(sum, v);
    }
    return sum;
  }
  if (t.mode === "cut") return typeof r === "string" ? parseAnswer(cutBody(r)) : null;
  return null;
}

/** The mark the response is measured against. */
function markOf(t: MeasureTask): Rational | null {
  if (t.mode === "assemble") return valueOf(t.target?.value);
  if (t.mode === "cut") return valueOf(t.answer);
  return null;
}

/** Assemble is exact; a cut may carry a tolerance (an unreadable one is read as exact). */
const toleranceOf = (t: MeasureTask): Rational | undefined =>
  t.mode === "cut" ? valueOf(t.tolerance ?? "0") ?? undefined : undefined;

function isCorrect(t: MeasureTask, r: MeasureResponse): boolean {
  const v = measured(t, r);
  const mark = markOf(t);
  return v !== null && mark !== null && sameValue(v, mark, toleranceOf(t));
}

/**
 * The sum the child actually built, in the order the pieces were offered ("4 + 5 = 9"), since any
 * subset that hits the mark is right, not only the stored `solution`. A cut keeps the task's own.
 */
function bridgeOf(t: MeasureTask, r: MeasureResponse): string {
  if (t.mode !== "assemble" || !t.target || !Array.isArray(t.pieces) || !Array.isArray(r)) return t.bridge;
  const picks = validPicks(r, t);
  if (!picks) return t.bridge;
  return `${picks.map((i) => bareLabel(t.pieces![i].label)).join(" + ")} = ${bareLabel(t.target.label)}`;
}

export const measureKind: TaskKindDef<"measure"> = {
  // Built field by field, so a value, the answer, the solution or the bridge can never ride along.
  toView: (t) => {
    const view: MeasureView = { mode: t.mode, unit: t.unit };
    if (t.pieces) view.pieces = t.pieces.map((p) => p.label);
    if (t.target) view.target = t.target.label;
    if (t.step !== undefined) view.step = t.step;
    if (t.maxLength !== undefined) view.maxLength = t.maxLength;
    return view;
  },
  // The presenter sends the encoded string ("a:…" / "c:…"); a list or the length as typed is taken too.
  parseResponse: (raw, t) => {
    if (t.mode === "assemble") {
      if (Array.isArray(raw)) return validPicks(raw, t);
      if (typeof raw !== "string" || raw.length > MAX_RESPONSE_CHARS) return null;
      const picks = readPicks(raw.trim());
      return picks && validPicks(picks, t);
    }
    if (t.mode === "cut") {
      if (typeof raw !== "string" || raw.length > MAX_RESPONSE_CHARS) return null;
      const body = cutBody(raw);
      if (body.length === 0 || body.length > CUT_MAX_CHARS) return null;
      return parseAnswer(body) ? body : null;
    }
    return null;
  },
  encode: TASK_CODECS.measure.encode,
  decode: TASK_CODECS.measure.decode,
  isCorrect,
  allowsSecondChance: () => true,
  sameResponse: TASK_CODECS.measure.sameResponse,
  // An assemble miss names the mark and one way to make it (the stored sum); a cut shows its worked line.
  answerText: (t) => (t.mode === "assemble" && t.target ? assembleReveal(t.target.label, t.bridge) : t.bridge),
  feedback: (t, r) => {
    const v = measured(t, r);
    const mark = markOf(t);
    if (v === null || mark === null || isCorrect(t, r)) return "none";
    return lessRational(mark, v) ? "too_long" : "too_short";
  },
  presents: (skillId) => benchFor(skillId) !== undefined,
  bridge: bridgeOf,
};
