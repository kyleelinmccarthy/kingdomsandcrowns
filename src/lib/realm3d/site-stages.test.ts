import { describe, expect, it } from "vitest";
import { buildSite, siteStage, SITE_STAGES, type Piece } from "./site-stages";

const W = 4.5;
const D = 4.5;
const WALL = 3.1;
const ROOF = 2.25;

const bottom = (p: Piece) => p.y - p.sy / 2;
const top = (p: Piece) => p.y + p.sy / 2;
const overlapsXZ = (a: Piece, b: Piece) =>
  Math.abs(a.x - b.x) < (a.sx + b.sx) / 2 - 1e-6 && Math.abs(a.z - b.z) < (a.sz + b.sz) / 2 - 1e-6;

describe("which stage a site is at", () => {
  it("steps up with every deed of five, and a finished count is the roof frame", () => {
    expect([0, 1, 2, 3, 4].map((d) => siteStage(d, 5))).toEqual([0, 1, 2, 3, 4]);
    expect(siteStage(5, 5)).toBe(SITE_STAGES - 1);
    expect(siteStage(1, 3)).toBeGreaterThanOrEqual(1);
    expect(siteStage(0, 0)).toBe(0);
  });
});

describe("a building going up", () => {
  const stages = [0, 1, 2, 3, 4].map((s) => buildSite(W, D, WALL, ROOF, s, 1).pieces);
  const count = (ps: Piece[], k: Piece["kind"]) => ps.filter((p) => p.kind === k).length;

  it("rests every square piece on the ground or on something under it — nothing floats", () => {
    for (let s = 0; s < stages.length; s++) {
      const ps = stages[s];
      const square = ps.filter((p) => p.rx === 0 && p.rz === 0);
      // String lines are tied between the stakes; they hang, they do not rest.
      for (const p of square.filter((q) => q.kind !== "line")) {
        const b = bottom(p);
        if (b < 0.001) continue; // on the ground
        const under = square.some((q) => q !== p && Math.abs(top(q) - b) < 0.02 && overlapsXZ(p, q));
        expect(under, `stage ${s}: a ${p.kind} at ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)} is floating`).toBe(true);
      }
    }
  });

  it("never goes below the ground, braces, rafters and the ladder included", () => {
    const halfHeight = (p: Piece) =>
      p.rz !== 0
        ? (Math.abs(p.sx * Math.sin(p.rz)) + Math.abs(p.sy * Math.cos(p.rz))) / 2
        : p.rx !== 0
          ? (Math.abs(p.sz * Math.sin(p.rx)) + Math.abs(p.sy * Math.cos(p.rx))) / 2
          : p.sy / 2;
    for (const ps of stages) for (const p of ps) expect(p.y - halfHeight(p), `${p.kind}`).toBeGreaterThan(-0.02);
  });

  it("shows a stage a child can see advance", () => {
    expect(count(stages[0], "stake")).toBe(4);
    expect(count(stages[0], "stone")).toBeGreaterThan(0); // the pile, waiting
    expect(count(stages[1], "stake")).toBe(0);
    expect(count(stages[1], "post")).toBe(0);
    expect(count(stages[2], "post")).toBeGreaterThanOrEqual(8);
    expect(count(stages[2], "plate")).toBe(0);
    expect(count(stages[3], "plate")).toBe(4);
    expect(count(stages[3], "brace")).toBe(4);
    expect(count(stages[3], "rafter")).toBe(0);
    expect(count(stages[4], "rafter")).toBeGreaterThanOrEqual(8);
    expect(count(stages[4], "ridge")).toBe(1);
    // ...and the frame gets taller as it goes (the stone pile waiting at stage 0 aside).
    const height = (ps: Piece[]) => Math.max(...ps.filter((p) => p.kind !== "stone").map(top));
    for (let s = 2; s < stages.length; s++) expect(height(stages[s])).toBeGreaterThanOrEqual(height(stages[s - 1]) - 1e-6);
    expect(height(stages[4])).toBeGreaterThan(WALL + ROOF * 0.6);
  });

  it("uses up the timber stack as the frame goes up", () => {
    const boards = stages.map((ps) => ps.filter((p) => p.kind === "board" && p.sz > 2).length);
    expect(boards[0]).toBeGreaterThan(boards[4]);
    for (let s = 1; s < boards.length; s++) expect(boards[s]).toBeLessThanOrEqual(boards[s - 1]);
  });

  it("leaves the doorway open on the front, where the villager stands", () => {
    for (const ps of stages.slice(1)) {
      const blocking = ps.filter(
        (p) => (p.kind === "stone" || p.kind === "post" || p.kind === "sill") && bottom(p) < 2.4 && Math.abs(p.z - (D / 2 - 0.25)) < 0.3 && Math.abs(p.x) < 0.6,
      );
      expect(blocking).toEqual([]);
    }
  });

  it("keeps the stack off the plot, on the side it is asked for", () => {
    const right = buildSite(W, D, WALL, ROOF, 0, 1).pieces.filter((p) => p.kind === "board");
    const left = buildSite(W, D, WALL, ROOF, 0, -1).pieces.filter((p) => p.kind === "board");
    for (const p of right) expect(p.x - p.sx / 2).toBeGreaterThan(W / 2);
    for (const p of left) expect(p.x + p.sx / 2).toBeLessThan(-W / 2);
  });

  it("pitches the rafters to meet at the ridge", () => {
    const ps = stages[4];
    const ridge = ps.find((p) => p.kind === "ridge")!;
    for (const r of ps.filter((p) => p.kind === "rafter")) {
      // The upper end of each rafter reaches the ridge line.
      const half = r.sx / 2;
      const upX = r.x + Math.cos(r.rz) * half * (r.x > 0 ? -1 : 1) * (r.x > 0 ? 1 : 1);
      const endY = r.y + Math.abs(Math.sin(r.rz)) * half;
      expect(Math.abs(endY - ridge.y)).toBeLessThan(0.5);
      expect(Math.abs(upX)).toBeLessThan(W / 2);
    }
  });
});
