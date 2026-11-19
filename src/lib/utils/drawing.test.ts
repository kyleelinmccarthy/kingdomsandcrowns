import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DRAWING_PALETTE,
  DRAWING_WIDTHS,
  hasDrawing,
  parseDrawing,
  strokePathD,
  strokePoints,
  type Drawing,
} from "./drawing";

const good: Drawing = {
  v: 1,
  strokes: [
    { c: 0, w: 1, p: [0, 0, 10, 10, 320, 240] },
    { c: 7, w: 2, p: [5, 5] },
  ],
};

const one = (p: unknown[], extra: Record<string, unknown> = {}) => ({ v: 1, strokes: [{ c: 0, w: 0, p, ...extra }] });

afterEach(() => vi.restoreAllMocks());

describe("parseDrawing", () => {
  it("round-trips a valid drawing as a fresh copy", () => {
    const out = parseDrawing(good);
    expect(out).toEqual(good);
    expect(out).not.toBe(good);
    expect(out!.strokes[0]).not.toBe(good.strokes[0]);
    expect(JSON.parse(JSON.stringify(out))).toEqual(good);
  });

  it("accepts a JSON string", () => {
    expect(parseDrawing(JSON.stringify(good))).toEqual(good);
  });

  it("accepts an empty drawing", () => {
    expect(parseDrawing({ v: 1, strokes: [] })).toEqual({ v: 1, strokes: [] });
  });

  it("refuses non-drawings", () => {
    for (const bad of [null, undefined, 5, true, "", "nope", "[]", [], {}, { v: 2, strokes: [] }, { v: 1 }, { strokes: [] }, { v: 1, strokes: {} }]) {
      expect(parseDrawing(bad)).toBeNull();
    }
  });

  it("allows 40 strokes and 2000 points but not one more", () => {
    const stroke = (n: number) => ({ c: 0, w: 0, p: Array.from({ length: n * 2 }, (_, i) => i % 200) });
    expect(parseDrawing({ v: 1, strokes: Array.from({ length: 40 }, () => stroke(1)) })).not.toBeNull();
    expect(parseDrawing({ v: 1, strokes: Array.from({ length: 41 }, () => stroke(1)) })).toBeNull();
    // 2,000 points across 40 strokes of 50, and 2,001 (one stroke has 51)
    const fifty = Array.from({ length: 40 }, () => stroke(50));
    expect(parseDrawing({ v: 1, strokes: fifty })).not.toBeNull();
    fifty[0] = stroke(51);
    expect(parseDrawing({ v: 1, strokes: fifty })).toBeNull();
  });

  it("refuses coordinates outside the pad or not whole numbers", () => {
    expect(parseDrawing(one([1.5, 2]))).toBeNull();
    expect(parseDrawing(one([321, 2]))).toBeNull();
    expect(parseDrawing(one([2, -1]))).toBeNull();
    expect(parseDrawing(one([2, 241]))).toBeNull();
    expect(parseDrawing(one([Number.NaN, 2]))).toBeNull();
    expect(parseDrawing(one(["1", 2]))).toBeNull();
    expect(parseDrawing(one([320, 240]))).not.toBeNull();
    expect(parseDrawing(one([0, 0]))).not.toBeNull();
  });

  it("refuses an odd-length or empty point list", () => {
    expect(parseDrawing(one([1, 2, 3]))).toBeNull();
    expect(parseDrawing(one([]))).toBeNull();
  });

  it("refuses colour and width indexes out of range", () => {
    for (const c of [8, 9, -1, 1.5, "1"]) expect(parseDrawing({ v: 1, strokes: [{ c, w: 0, p: [1, 1] }] })).toBeNull();
    for (const w of [3, -1, 0.5, "1"]) expect(parseDrawing({ v: 1, strokes: [{ c: 0, w, p: [1, 1] }] })).toBeNull();
    expect(parseDrawing({ v: 1, strokes: [{ c: 7, w: 2, p: [1, 1] }] })).not.toBeNull();
  });

  it("refuses extra keys at the top level and in a stroke", () => {
    expect(parseDrawing({ ...good, svg: "<svg/>" })).toBeNull();
    expect(parseDrawing(one([1, 1], { html: "<b>" }))).toBeNull();
  });

  it("refuses a missing key in a stroke", () => {
    expect(parseDrawing({ v: 1, strokes: [{ c: 0, p: [1, 1] }] })).toBeNull();
  });

  it("refuses a 40 KB string without parsing it", () => {
    const big = JSON.stringify({ v: 1, strokes: [], pad: "x".repeat(40 * 1024) });
    const parse = vi.spyOn(JSON, "parse");
    expect(parseDrawing(big)).toBeNull();
    expect(parse).not.toHaveBeenCalled();
  });

  it("refuses an oversized object", () => {
    expect(parseDrawing({ v: 1, strokes: [], pad: "x".repeat(40 * 1024) })).toBeNull();
  });

  it("refuses malformed JSON strings", () => {
    expect(parseDrawing("{not json")).toBeNull();
  });
});

describe("hasDrawing", () => {
  it("is true only with at least one stroke", () => {
    expect(hasDrawing(good)).toBe(true);
    expect(hasDrawing({ v: 1, strokes: [] })).toBe(false);
    expect(hasDrawing(null)).toBe(false);
    expect(hasDrawing(undefined)).toBe(false);
  });
});

describe("palette and paths", () => {
  it("has 8 hex colours including black, and three widths", () => {
    expect(DRAWING_PALETTE).toHaveLength(8);
    for (const c of DRAWING_PALETTE) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DRAWING_PALETTE.map((c) => c.toLowerCase())).toContain("#000000");
    expect(new Set(DRAWING_PALETTE).size).toBe(8);
    expect([...DRAWING_WIDTHS]).toEqual([2, 5, 10]);
  });

  it("pairs a stroke's points", () => {
    expect(strokePoints({ c: 0, w: 0, p: [1, 2, 3, 4] })).toEqual([[1, 2], [3, 4]]);
  });

  it("draws several points as a polyline path", () => {
    expect(strokePathD({ c: 0, w: 0, p: [1, 2, 3, 4, 5, 6] })).toBe("M 1 2 L 3 4 L 5 6");
  });

  it("draws one point as a short dot", () => {
    expect(strokePathD({ c: 0, w: 0, p: [10, 20] })).toBe("M 10 20 L 10.01 20");
  });
});
