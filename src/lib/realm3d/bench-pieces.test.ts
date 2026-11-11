import { describe, expect, it } from "vitest";
import { BENCH_ELEVATION, benchBase, benchPieces, type BenchPiece } from "./bench-pieces";
import { SITE_STAGES } from "./site-stages";

const STAGES = Array.from({ length: SITE_STAGES }, (_, s) => s);
const SITES = [...STAGES.map((stage) => ({ stage, complete: false })), { stage: SITE_STAGES - 1, complete: true }];
const name = ({ stage, complete }: { stage: number; complete: boolean }) => (complete ? "a finished building" : `stage ${stage}`);

/** Where a piece bears: a box's underside, or a strut's lower end. */
function footing(p: BenchPiece): { y: number; from: number; to: number } {
  const s = p.shape;
  if (s.type === "box") return { y: s.y, from: s.x, to: s.x + s.w };
  const low = s.y1 <= s.y2 ? { x: s.x1, y: s.y1 } : { x: s.x2, y: s.y2 };
  return { y: low.y, from: low.x, to: low.x };
}

/** Whether `p` stands on the ground or on the top of a box laid before it. */
function rests(p: BenchPiece, before: BenchPiece[]): boolean {
  const f = footing(p);
  if (f.y === 0) return true;
  return before.some((b) => b.shape.type === "box" && Math.abs(b.shape.y + b.shape.h - f.y) < 1e-9 && f.from <= b.shape.x + b.shape.w && f.to >= b.shape.x);
}

describe("the bench's elevation of a site going up", () => {
  it.each(SITES)("every piece of stage $stage (finished: $complete) rests on the ground or on something laid before it", (site) => {
    const laid: BenchPiece[] = [];
    for (const p of [...benchBase(site.stage, site.complete), ...benchPieces(site.stage, site.complete)]) {
      expect(rests(p, laid), `${name(site)}: ${p.label} (${p.kind}) floats`).toBe(true);
      laid.push(p);
    }
  });

  it.each(SITES)("stage $stage (finished: $complete) has pieces to lay, each named and inside the drawing", (site) => {
    const pieces = benchPieces(site.stage, site.complete);
    expect(pieces.length).toBeGreaterThanOrEqual(4);
    for (const p of [...benchBase(site.stage, site.complete), ...pieces]) {
      expect(p.label).toMatch(/^(a|an|the) /);
      const s = p.shape;
      const xs = s.type === "box" ? [s.x, s.x + s.w] : [s.x1, s.x2];
      const ys = s.type === "box" ? [s.y, s.y + s.h] : [s.y1, s.y2];
      for (const x of xs) expect(x >= 0 && x <= BENCH_ELEVATION.width, `${p.label} x ${x}`).toBe(true);
      for (const y of ys) expect(y >= 0 && y <= BENCH_ELEVATION.height, `${p.label} y ${y}`).toBe(true);
    }
  });

  it("what a run lays is what the next stage stands on", () => {
    for (const s of STAGES.slice(0, -1)) {
      expect(benchBase(s + 1, false)).toEqual([...benchBase(s, false), ...benchPieces(s, false)]);
    }
  });

  it("goes up the way the world's site does: footing, then sills and posts, plates, the roof frame, then boards", () => {
    const kinds = (s: number) => new Set(benchPieces(s, false).map((p) => p.kind));
    expect(kinds(0)).toEqual(new Set(["stone"]));
    expect(kinds(1)).toEqual(new Set(["sill", "post"]));
    expect(kinds(2)).toContain("plate");
    expect(kinds(3)).toEqual(new Set(["post", "ridge", "rafter"]));
    expect(kinds(4)).toEqual(new Set(["board"]));
  });

  it("a finished building stands whole, no scaffold, and a run puts up a repair scaffold before mending it", () => {
    const base = benchBase(SITE_STAGES - 1, true);
    expect(base.some((p) => p.scaffold)).toBe(false);
    expect(base).toEqual([...benchBase(SITE_STAGES - 1, false), ...benchPieces(SITE_STAGES - 1, false)].filter((p) => !p.scaffold));
    const repair = benchPieces(SITE_STAGES - 1, true);
    const firstMend = repair.findIndex((p) => !p.scaffold);
    expect(firstMend).toBeGreaterThan(0);
    expect(repair.slice(0, firstMend).map((p) => p.kind)).toEqual(["post", "post", "board", "ladder"]);
    expect(repair.slice(firstMend).every((p) => !p.scaffold && p.label.startsWith("a new "))).toBe(true);
  });

  it("a stage out of range is read as the nearest one", () => {
    expect(benchPieces(-1, false)).toEqual(benchPieces(0, false));
    expect(benchPieces(9, false)).toEqual(benchPieces(SITE_STAGES - 1, false));
    expect(benchBase(9, false)).toEqual(benchBase(SITE_STAGES - 1, false));
  });

  it("the first stage stands on a bare pad", () => {
    expect(benchBase(0, false).map((p) => p.kind)).toEqual(["pad"]);
  });
});
