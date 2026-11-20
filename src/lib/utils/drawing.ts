/**
 * A hero's drawing: a strict stroke document, never markup.
 *
 * It is stored as JSON text and drawn only by our own SVG/canvas code (through `strokePathD`), so
 * nothing a client sends is ever rendered as HTML or SVG. `parseDrawing` is the only way a value
 * becomes a `Drawing`, and it rebuilds the value from validated parts rather than passing the
 * input through.
 */

export type DrawingStroke = {
  /** Palette index, 0-7. */
  c: number;
  /** Width index, 0-2, into `DRAWING_WIDTHS`. */
  w: number;
  /** Flat `[x, y, x, y, ...]`, whole numbers on the pad. */
  p: number[];
};

export type Drawing = { v: 1; strokes: DrawingStroke[] };

export const DRAWING_WIDTH = 320;
export const DRAWING_HEIGHT = 240;
export const DRAWING_MAX_STROKES = 40;
export const DRAWING_MAX_POINTS = 2000;
/** The cap on the serialized form: 32K characters (what `.length` counts), checked before any parse. */
export const DRAWING_MAX_CHARS = 32 * 1024;

/** The page a drawing is made on: the pad, the SVG view and the canvas painter all use this one colour (`drawing-pad.css` repeats it for its own canvas). */
export const DRAWING_PARCHMENT = "#f4e9cf";

/** Line widths (in pad units) the three width indexes stand for. */
export const DRAWING_WIDTHS = [2, 5, 10] as const;

/** Eight inks a child can choose from, each readable on parchment. Index 0 is black. */
export const DRAWING_PALETTE = [
  "#000000", // black
  "#6b3f1d", // brown
  "#b3261e", // red
  "#d9730d", // orange
  "#c9a30a", // gold
  "#2e7d32", // green
  "#1565c0", // blue
  "#7b1fa2", // purple
] as const;

function isInt(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
}

function hasOnlyKeys(o: object, keys: string[]): boolean {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
}

/**
 * Validate and rebuild a drawing from an object or a JSON string. The size cap is checked on the
 * raw input BEFORE any `JSON.parse`, so an oversized payload costs nothing to refuse. Returns a
 * fresh `Drawing`, or null for anything that is not exactly the format.
 */
export function parseDrawing(raw: unknown): Drawing | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > DRAWING_MAX_CHARS) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  } else if (raw !== null && typeof raw === "object") {
    let size: number;
    try {
      size = JSON.stringify(raw).length;
    } catch {
      return null;
    }
    if (size > DRAWING_MAX_CHARS) return null;
  } else {
    return null;
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const doc = value as Record<string, unknown>;
  if (!hasOnlyKeys(doc, ["v", "strokes"]) || doc.v !== 1) return null;
  if (!Array.isArray(doc.strokes) || doc.strokes.length > DRAWING_MAX_STROKES) return null;

  const strokes: DrawingStroke[] = [];
  let points = 0;
  for (const s of doc.strokes) {
    if (s === null || typeof s !== "object" || Array.isArray(s)) return null;
    const stroke = s as Record<string, unknown>;
    if (!hasOnlyKeys(stroke, ["c", "w", "p"])) return null;
    if (!isInt(stroke.c, 0, DRAWING_PALETTE.length - 1)) return null;
    if (!isInt(stroke.w, 0, DRAWING_WIDTHS.length - 1)) return null;
    const p = stroke.p;
    if (!Array.isArray(p) || p.length < 2 || p.length % 2 !== 0) return null;
    points += p.length / 2;
    if (points > DRAWING_MAX_POINTS) return null;
    const clean: number[] = [];
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i];
      const y = p[i + 1];
      if (!isInt(x, 0, DRAWING_WIDTH) || !isInt(y, 0, DRAWING_HEIGHT)) return null;
      clean.push(x, y);
    }
    strokes.push({ c: stroke.c, w: stroke.w, p: clean });
  }
  return { v: 1, strokes };
}

/**
 * The notes hint for the places that stay notes-only (the timer popup, "Start a Quest") when the
 * quest insists on Scribe's Notes: the drawing pad lives on the quest card.
 */
export const NOTES_OR_DRAW_FROM_CARD_HINT = "Write your Scribe's Notes, or draw it from the quest card.";

/** What a refused drawing says. Shared so every action that takes one says the same thing. */
export const DRAWING_REFUSED = "That drawing couldn't be saved.";

/**
 * What a drawing field means to a save: `undefined` is "not mentioned", `null` is "none", anything
 * else must be a valid drawing. Returns `undefined` / `null` unchanged, the parsed drawing, or
 * "invalid" so the caller can refuse before any write.
 */
export function readDrawingField(raw: unknown): Drawing | null | undefined | "invalid" {
  if (raw === undefined || raw === null) return raw;
  return parseDrawing(raw) ?? "invalid";
}

/** The text stored for a drawing, or null when there is nothing to keep. */
export function drawingToStore(d: Drawing | null | undefined): string | null {
  return hasDrawing(d) ? JSON.stringify(d) : null;
}

/** True when there is at least one stroke to look at. */
export function hasDrawing(d: Drawing | null | undefined): d is Drawing {
  return !!d && d.strokes.length > 0;
}

/** A stroke's flat list as `[x, y]` pairs. */
export function strokePoints(stroke: DrawingStroke): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < stroke.p.length; i += 2) out.push([stroke.p[i], stroke.p[i + 1]]);
  return out;
}

/**
 * An SVG path for one stroke ("M x y L x y ..."). A single point becomes a hair-long line, which a
 * round line cap draws as a dot. It expects a stroke that came from `parseDrawing`: it does not
 * re-check the numbers.
 */
export function strokePathD(stroke: DrawingStroke): string {
  const pts = strokePoints(stroke);
  if (pts.length === 0) return "";
  if (pts.length === 1) {
    const [x, y] = pts[0];
    return `M ${x} ${y} L ${x + 0.01} ${y}`;
  }
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}
