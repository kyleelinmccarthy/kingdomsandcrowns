import { formatRational, parseAnswer } from "./parse-answer";
import type { MeasureResponse, ResponseByKind, TaskKind } from "./types";

/**
 * How a response is written down, read back and compared, per kind. Client-safe: the presenters
 * encode with it and the server's definitions delegate to it, so the two cannot drift. Beyond types
 * it imports only the pure `parse-answer`, so it never pulls the server-only registry, drawing or
 * bench code into the browser bundle (`client-boundary.test.ts` guards that).
 */
export type TaskCodec<K extends TaskKind> = {
  /** The response as stored in the database and sent from the client. */
  encode(r: ResponseByKind[K]): string;
  decode(s: string): ResponseByKind[K] | null;
  sameResponse(a: ResponseByKind[K], b: ResponseByKind[K]): boolean;
};

/** The longest length a child may type at the bench; anything longer is refused. */
export const CUT_MAX_CHARS = 20;

/** Assemble picks as written ("a:0,2,3"), in the order given and duplicates kept; null when malformed. */
export function readPicks(s: string): number[] | null {
  const m = /^a:(\d{1,4}(?:,\d{1,4})*)?$/.exec(s);
  if (!m) return null;
  return m[1] ? m[1].split(",").map(Number) : [];
}

const uniqueSorted = (xs: readonly number[]) => [...new Set(xs)].sort((a, b) => a - b);

/** A cut's length without its "c:" mark, trimmed. */
export function cutBody(s: string): string {
  const t = s.trim();
  return (t.startsWith("c:") ? t.slice(2) : t).trim();
}

/**
 * Measure: assemble picks as "a:" and the sorted unique indices; a cut as "c:" and the length in
 * lowest terms, so "0.75", "6/8" and "3/4" are written alike. Never "" (that is a give-up). A string
 * already encoded reads back as what it encodes, so encoding is idempotent.
 */
function encodeMeasure(r: MeasureResponse): string {
  if (Array.isArray(r)) return `a:${uniqueSorted(r).join(",")}`;
  const picks = r.trim().startsWith("a:") ? readPicks(r.trim()) : null;
  if (picks) return encodeMeasure(picks);
  const body = cutBody(r);
  const value = parseAnswer(body);
  return `c:${value ? formatRational(value, "fraction") : body}`;
}

function decodeMeasure(s: string): MeasureResponse | null {
  if (s.startsWith("a:")) {
    const picks = readPicks(s);
    return picks && uniqueSorted(picks);
  }
  if (s.startsWith("c:")) {
    const body = cutBody(s);
    return parseAnswer(body) ? body : null;
  }
  return null;
}

export const TASK_CODECS: { [K in TaskKind]: TaskCodec<K> } = {
  // Responses are the trimmed choice text, so rows stored before kinds existed keep grading
  // exactly as trimmed equality does.
  choice: {
    encode: (r) => r.trim(),
    decode: (s) => s.trim(),
    sameResponse: (a, b) => a.trim() === b.trim(),
  },
  measure: {
    encode: encodeMeasure,
    decode: decodeMeasure,
    sameResponse: (a, b) => encodeMeasure(a) === encodeMeasure(b),
  },
};
