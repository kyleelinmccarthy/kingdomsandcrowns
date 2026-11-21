// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ANCHORS, ANCHOR_IDS } from "@/lib/realm/anchors";
import { cloneTrailPool } from "@/test/trail-pool-fixture";
import { poolsWithSheets, type Resolution } from "./blind-pass";
import { CONFUSABLE_ANCHORS } from "./trail-anchor-facts";
import {
  allTrailPoolIds,
  carryTrailForward,
  compareTrailSheet,
  extractTrailSheet,
  formatTrailReport,
  loadTrailPool,
  parseTrailSheet,
  readPlace,
  renderTrailSheet,
  runTrailPool,
  trailPoolsWithSheets,
  trailSheetPath,
  writeTrailSheet,
} from "./trail-blind-pass";
import { clueCode, type TrailPool } from "./trail-pools";

const sheetOf = (pool: TrailPool): string => renderTrailSheet(extractTrailSheet(pool));

/** The pool's real answer for each clue code, and the clue's own name. */
function keyOf(pool: TrailPool): Map<string, { ref: string; key: string; text: string }> {
  const byCode = new Map<string, { ref: string; key: string; text: string }>();
  for (const t of pool.trails) t.clues.forEach((c, i) => byCode.set(clueCode(pool.poolId, c), { ref: `${t.id}/${i + 1}`, key: c.answer, text: c.text }));
  return byCode;
}

/** Answers a rendered sheet the way a careful reader would: each line gets `choose(key, text)`. */
function answerSheet(pool: TrailPool, sheet: string, choose: (key: string, text: string) => string): string {
  const byCode = keyOf(pool);
  return sheet
    .split("\n")
    .map((line) => {
      const m = /^- `#([0-9a-f]+)` .* \| Answer:$/.exec(line);
      if (!m) return line;
      const hit = byCode.get(m[1])!;
      return `${line} ${choose(hit.key, hit.text)}`;
    })
    .join("\n");
}

const answeredRight = (pool: TrailPool): string => answerSheet(pool, sheetOf(pool), (key) => key);
const clueLines = (sheet: string): string[] => sheet.split("\n").filter((l) => /^- `#[0-9a-f]+` /.test(l));

describe("the trail sheet", () => {
  it("is key-free: no answer on a clue line, no trail id anywhere, and a warning not to open the pool", () => {
    const pool = cloneTrailPool("g45");
    const sheet = sheetOf(pool);
    expect(sheet).toContain("**Do not open `src/content/trails/trail-g45.json`**");
    for (const line of clueLines(sheet)) for (const id of ANCHOR_IDS) expect(line, id).not.toContain(id);
    for (const trail of pool.trails) expect(sheet, trail.id).not.toContain(trail.id);
    // Every clue is on the sheet, once, with a blank answer.
    const total = pool.trails.reduce((n, t) => n + t.clues.length, 0);
    expect(clueLines(sheet)).toHaveLength(total);
    expect(sheet.split("\n").filter((l) => /\| Answer:$/.test(l))).toHaveLength(total);
    for (const t of pool.trails) for (const c of t.clues) expect(sheet).toContain(c.text);
  });

  it("holds no redirect, why, parts or readAloud either", () => {
    const pool = cloneTrailPool("k1");
    const sheet = sheetOf(pool);
    for (const t of pool.trails) for (const c of t.clues) {
      expect(sheet).not.toContain(c.redirect);
      expect(sheet).not.toContain(c.readAloud!);
    }
  });

  it("names the places, with their facts and what is near, and the pairs a clue must tell apart", () => {
    const sheet = sheetOf(cloneTrailPool("g23"));
    for (const id of ANCHOR_IDS) {
      expect(sheet).toContain(`\`${id}\` — ${ANCHORS[id].label}.`);
    }
    expect(sheet).toContain("Near: `");
    expect(sheet).toContain("## Places a clue must tell apart");
    for (const pair of CONFUSABLE_ANCHORS) expect(sheet).toContain(`(\`${pair.anchors[0]}\`) and `);
    expect(sheet).toContain("`both`");
    expect(sheet).toContain("`?`");
  });

  it("shuffles clues across trails, in an order that does not follow the pool", () => {
    const pool = cloneTrailPool("g23");
    const inPoolOrder = pool.trails.flatMap((t) => t.clues.map((c) => clueCode(pool.poolId, c)));
    const onSheet = extractTrailSheet(pool).clues.map((c) => c.code);
    expect(onSheet).not.toEqual(inPoolOrder);
    expect([...onSheet].sort()).toEqual([...inPoolOrder].sort());
    // Neighbouring lines are rarely neighbours in a trail: not one trail's clues in a row.
    const trailOf = new Map(pool.trails.flatMap((t) => t.clues.map((c) => [clueCode(pool.poolId, c), t.id] as const)));
    const runs = onSheet.filter((code, i) => i > 0 && trailOf.get(code) === trailOf.get(onSheet[i - 1]));
    expect(runs.length).toBeLessThan(onSheet.length / 4);
  });

  it("is byte-identical when cut twice, and does not change when a key is corrected", () => {
    const pool = cloneTrailPool("g23");
    expect(sheetOf(pool)).toBe(sheetOf(cloneTrailPool("g23")));
    const fixed = cloneTrailPool("g23");
    fixed.trails[0].clues[0].answer = "landmark:market";
    fixed.trails[0].clues[0].redirect = "Another line entirely.";
    expect(sheetOf(fixed)).toBe(sheetOf(pool));
  });

  it("a code follows the text, not the place in the pool (F-2)", () => {
    const pool = cloneTrailPool("g23");
    const clue = pool.trails[0].clues[0];
    const code = clueCode(pool.poolId, clue);
    // Moved to another trail (the first clue of trail 2, which now has four, and the old trail one fewer).
    const moved = cloneTrailPool("g23");
    const [mover] = moved.trails[0].clues.splice(0, 1);
    moved.trails[1].clues.unshift(mover);
    expect(clueCode(moved.poolId, mover)).toBe(code);
    expect(extractTrailSheet(moved).clues.map((c) => c.code)).toContain(code);
    // Reworded: a new code.
    expect(clueCode(pool.poolId, { text: `${clue.text} Look closely.` })).not.toBe(code);
    // Its key and redirect are not part of it.
    expect(clueCode(pool.poolId, { ...clue, answer: "landmark:market", redirect: "x" } as typeof clue)).toBe(code);
  });
});

describe("reading a sheet back", () => {
  const sheet = sheetOf(cloneTrailPool("g23"));
  const firstCode = clueLines(sheet)[0].match(/#([0-9a-f]+)/)![1];
  const fill = (answer: string): string => sheet.replace(new RegExp(`(#${firstCode}\`.*\\| Answer:)$`, "m"), `$1 ${answer}`);
  const first = (answer: string) => parseTrailSheet(fill(answer)).answers.find((a) => a.code === firstCode)!;

  it("is forgiving about how a place is written", () => {
    for (const written of ["landmark:mill", "Landmark:Mill", "`landmark:mill`", "landmark:mill.", "mill", "the mill", "The Mill", "the mill)"]) {
      expect(first(written), written).toMatchObject({ choice: "landmark:mill", refused: false, both: false });
    }
    expect(first("notice board").choice).toBe("object:notice-board");
    expect(first("object:notice-board").choice).toBe("object:notice-board");
    expect(first("the Puzzle Tower").choice).toBe("landmark:puzzle-tower");
  });

  it("reads `both` with the ids that also fit, in whatever separators, and `?`", () => {
    expect(first("both landmark:well object:water-trough")).toMatchObject({ both: true, choice: null, fits: ["landmark:well", "object:water-trough"] });
    expect(first("both: landmark:well, the water trough")).toMatchObject({ both: true, fits: ["landmark:well", "object:water-trough"] });
    expect(first("both")).toMatchObject({ both: true, fits: [] });
    expect(first("either well and mill").fits).toEqual(["landmark:well", "landmark:mill"]);
    expect(first("?")).toMatchObject({ refused: true, both: false, choice: null });
    expect(first("none")).toMatchObject({ refused: true });
  });

  it("treats something it cannot read as unanswerable, and never as a place (even toString)", () => {
    for (const written of ["the moon", "toString", "__proto__", "constructor", "landmark:longwater"]) {
      expect(first(written), written).toMatchObject({ refused: true, choice: null });
    }
    expect(readPlace("toString")).toBeNull();
    expect(readPlace("__proto__")).toBeNull();
  });

  it("leaves a blank line blank, and names the pool the sheet was cut from", () => {
    const parsed = parseTrailSheet(sheet);
    expect(parsed.poolId).toBe("trail-g23");
    expect(parsed.answers.every((a) => a.choice === null && !a.refused && !a.both)).toBe(true);
    expect(parsed.answers).toHaveLength(clueLines(sheet).length);
  });
});

describe("the sheet round trip: extract, answer, compare", () => {
  it("passes when every clue is answered as keyed", () => {
    const pool = cloneTrailPool("g23");
    const total = pool.trails.reduce((n, t) => n + t.clues.length, 0);
    const report = compareTrailSheet(pool, parseTrailSheet(answeredRight(pool)).answers);
    expect(report).toMatchObject({ ok: true, total, checked: total, agreed: total, flags: [], missing: [], stale: [] });
    expect(formatTrailReport(report)).toContain("PASS");
  });

  it("flags a wrong place as a disagreement, and fails", () => {
    const pool = cloneTrailPool("g23");
    const target = pool.trails[3].clues[1];
    const sheet = answerSheet(pool, sheetOf(pool), (key, text) => (text === target.text ? "landmark:market" : key));
    const report = compareTrailSheet(pool, parseTrailSheet(sheet).answers);
    expect(report.ok).toBe(false);
    expect(report.unresolved).toEqual([expect.objectContaining({ kind: "disagreement", itemId: `${pool.trails[3].id}/2`, key: target.answer, reviewerChoice: "landmark:market" })]);
    const text = formatTrailReport(report);
    expect(text).toContain("UNRESOLVED");
    expect(text).toContain("FAIL");
  });

  it("flags `both` with the ids that fit, and `?`", () => {
    const pool = cloneTrailPool("g23");
    const [a, b] = [pool.trails[0].clues[0], pool.trails[1].clues[0]];
    const sheet = answerSheet(pool, sheetOf(pool), (key, text) => (text === a.text ? "both landmark:well object:hay-cart" : text === b.text ? "?" : key));
    const report = compareTrailSheet(pool, parseTrailSheet(sheet).answers);
    expect(report.flags.map((f) => [f.itemId, f.kind]).sort()).toEqual([[`${pool.trails[0].id}/1`, "ambiguity"], [`${pool.trails[1].id}/1`, "unanswerable"]]);
    expect(report.flags.find((f) => f.kind === "ambiguity")!.fits).toEqual(["landmark:well", "object:hay-cart"]);
    expect(report.ok).toBe(false);
    const text = formatTrailReport(report);
    expect(text).toContain("more than one place fits (also: landmark:well, object:hay-cart)");
    expect(text).toContain("no place fits");
  });

  it("counts a blank as missing, never as agreement", () => {
    const pool = cloneTrailPool("g23");
    const target = pool.trails[2].clues[0];
    const sheet = answerSheet(pool, sheetOf(pool), (key, text) => (text === target.text ? "" : key));
    const report = compareTrailSheet(pool, parseTrailSheet(sheet).answers);
    expect(report.missing).toEqual([`${pool.trails[2].id}/1`]);
    expect(report.ok).toBe(false);
    expect(formatTrailReport(report)).toContain("unanswered:");
  });

  it("reports a stale code when a clue is edited after it was answered", () => {
    const pool = cloneTrailPool("g23");
    const answers = parseTrailSheet(answeredRight(pool)).answers;
    const edited = cloneTrailPool("g23");
    edited.trails[0].clues[0].text += " Look closely.";
    const report = compareTrailSheet(edited, answers);
    expect(report.ok).toBe(false);
    expect(report.stale).toEqual([`#${clueCode(pool.poolId, pool.trails[0].clues[0])}`]);
    expect(report.missing).toEqual([`${edited.trails[0].id}/1`]);
    expect(formatTrailReport(report)).toContain("answered before the item changed");
  });

  it("passes with a settlement on each flag, and the settlement stops applying when the key moves", () => {
    const pool = cloneTrailPool("g23");
    const clue = pool.trails[0].clues[0];
    const sheet = answerSheet(pool, sheetOf(pool), (key, text) => (text === clue.text ? "both landmark:well" : key));
    const answers = parseTrailSheet(sheet).answers;
    const settled: Resolution = {
      itemId: `${pool.trails[0].id}/1`,
      code: clueCode(pool.poolId, clue),
      keyAt: clue.answer,
      verdict: "ambiguity-accepted",
      note: "The well is a different place: the rope and the dark below name it, not this.",
      resolvedBy: "test",
      resolvedAt: "2026-11-21",
    };
    expect(compareTrailSheet(pool, answers, [settled])).toMatchObject({ ok: true, unresolved: [] });
    expect(compareTrailSheet(pool, answers, [settled]).flags[0].resolution?.verdict).toBe("ambiguity-accepted");
    expect(formatTrailReport(compareTrailSheet(pool, answers, [settled]))).toContain("resolved: ambiguity-accepted");
    // The key moves: the settlement was about the old key, so the flag is back.
    const moved = cloneTrailPool("g23");
    moved.trails[0].clues[0].answer = "landmark:market";
    const again = compareTrailSheet(moved, answers, [settled]);
    expect(again.flags).toHaveLength(1);
    expect(again.flags[0].resolution).toBeUndefined();
    expect(again.ok).toBe(false);
  });
});

describe("re-extracting a sheet that has answers (F-2)", () => {
  it("keeps every unchanged answer and blanks an edited clue's", () => {
    const pool = cloneTrailPool("g23");
    const target = pool.trails[0].clues[0];
    const answered = answerSheet(pool, sheetOf(pool), (key, text) => (text === pool.trails[1].clues[0].text ? "?" : text === pool.trails[2].clues[0].text ? "both landmark:well" : key));
    const edited = cloneTrailPool("g23");
    edited.trails[0].clues[0].text = `${target.text} Look closely.`;
    const next = carryTrailForward(sheetOf(edited), answered);
    const parsed = parseTrailSheet(next).answers;
    const byCode = new Map(parsed.map((a) => [a.code, a]));
    // The edited clue's answer is empty.
    expect(byCode.get(clueCode(edited.poolId, edited.trails[0].clues[0]))).toMatchObject({ choice: null, refused: false, both: false });
    // Every other clue kept its answer: a place, a `?` and a `both` with its ids.
    expect(byCode.get(clueCode(pool.poolId, pool.trails[1].clues[0]))).toMatchObject({ refused: true });
    expect(byCode.get(clueCode(pool.poolId, pool.trails[2].clues[0]))).toMatchObject({ both: true, fits: ["landmark:well"] });
    const report = compareTrailSheet(edited, parsed);
    expect(report.stale).toEqual([]);
    expect(report.missing).toEqual([`${edited.trails[0].id}/1`]);
    expect(report.checked).toBe(report.total - 1);
  });

  it("returns the fresh sheet untouched when nothing was answered", () => {
    const pool = cloneTrailPool("g23");
    expect(carryTrailForward(sheetOf(pool), sheetOf(pool))).toBe(sheetOf(pool));
  });

  it("is the identity when nothing changed", () => {
    const pool = cloneTrailPool("g45");
    expect(carryTrailForward(sheetOf(pool), answeredRight(pool))).toBe(answeredRight(pool));
  });
});

describe("cutting a sheet", () => {
  it("refuses a pool that does not validate, before writing anything", () => {
    const bad = cloneTrailPool("g23");
    bad.trails[0].clues[0].answer = "landmark:nowhere";
    const before = fs.existsSync(trailSheetPath("trail-g23")) ? fs.readFileSync(trailSheetPath("trail-g23"), "utf8") : null;
    expect(() => writeTrailSheet(bad)).toThrow(/does not validate/);
    expect(fs.existsSync(trailSheetPath("trail-g23")) ? fs.readFileSync(trailSheetPath("trail-g23"), "utf8") : null).toBe(before);
  });

  it("finds the trail sheets in a review folder, by prefix, and leaves resolutions and drill sheets out", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-"));
    try {
      for (const f of ["trail-k1.blind.md", "trail-g45.blind.md", "trail-k1.resolved.json", "vocab-g45.blind.md", "sort-science-k1.blind.md"]) fs.writeFileSync(path.join(dir, f), "x");
      expect(trailPoolsWithSheets(dir)).toEqual(["trail-g45", "trail-k1"]);
      expect(poolsWithSheets(dir)).toEqual(["vocab-g45"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * The gate. It runs every trail sheet on disk and requires PASS, like the drill and sort gates. With
 * no pools yet it passes vacuously; H6 adds the sheets, and from then on a disagreement nobody
 * settled fails the suite.
 */
describe("trail blind pass: the sheets on disk", () => {
  const poolIds = trailPoolsWithSheets();

  it("names a pool that exists for every sheet", () => {
    for (const poolId of poolIds) {
      expect(allTrailPoolIds(), `pool for sheet ${poolId}`).toContain(poolId);
      expect(() => loadTrailPool(poolId), `pool for sheet ${poolId}`).not.toThrow();
    }
  });

  for (const poolId of poolIds) {
    it(`has every flag on ${poolId} settled`, () => {
      const report = runTrailPool(poolId);
      expect(formatTrailReport(report), formatTrailReport(report)).toContain("PASS");
      expect(report.ok).toBe(true);
    });
  }

  it("is kept out of the drill gate: no trail sheet is read as a drill sheet", () => {
    expect(poolsWithSheets().filter((id) => id.startsWith("trail-"))).toEqual([]);
  });
});
