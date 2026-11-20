// @vitest-environment node
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXTURE_POOL_ID, fixtureSortPool } from "@/test/sort-pool-fixture";
import type { Resolution } from "./blind-pass";
import { poolsWithSheets } from "./blind-pass";
import {
  carrySortForward,
  compareSortSheet,
  extractSortSheet,
  formatSortReport,
  itemCode,
  loadSortPool,
  parseSortSheet,
  renderSortSheet,
  runSortPool,
  sortPoolsWithSheets,
  sortSheetPath,
} from "./sort-blind-pass";
import type { SortPool } from "./sort-pools";

const clone = (): SortPool => JSON.parse(JSON.stringify(fixtureSortPool())) as SortPool;

/** Answers a rendered sheet the way a careful reader would: each line gets the item's real category, via `choose`. */
function answerSheet(pool: SortPool, sheet: string, choose: (label: string, key: 0 | 1, setId: string) => string): string {
  const byCode = new Map<string, { label: string; key: 0 | 1; setId: string }>();
  for (const set of pool.sets) for (const item of set.items) byCode.set(itemCode(set, item), { label: item.label, key: item.category, setId: set.id });
  return sheet
    .split("\n")
    .map((line) => {
      const m = /^- `#([0-9a-f]+)` .* \| Answer:$/.exec(line);
      if (!m) return line;
      const hit = byCode.get(m[1])!;
      return `${line} ${choose(hit.label, hit.key, hit.setId)}`;
    })
    .join("\n");
}

const sheetOf = (pool: SortPool): string => renderSortSheet(extractSortSheet(pool));
const answeredRight = (pool: SortPool): string => answerSheet(pool, sheetOf(pool), (_l, key) => String(key));

describe("the sort sheet", () => {
  it("is key-free: no item id, no category per item, and a warning not to open the pool", () => {
    const pool = clone();
    const sheet = sheetOf(pool);
    expect(sheet).toContain(`Do not open \`src/content/sorts/${FIXTURE_POOL_ID}.json\``);
    for (const set of pool.sets) {
      for (const item of set.items) {
        expect(sheet, item.id).not.toContain(item.id);
        expect(sheet).toContain(item.label);
      }
      expect(sheet).toContain(set.categories[0]);
      expect(sheet).toContain(set.categories[1]);
    }
    // Every item line is blank for the reviewer.
    const blanks = sheet.split("\n").filter((l) => /\| Answer:$/.test(l));
    expect(blanks).toHaveLength(pool.sets.reduce((n, s) => n + s.items.length, 0));
  });

  it("lists items in an order that does not follow the key", () => {
    const pool = clone();
    const set = pool.sets[0];
    const order = extractSortSheet(pool).sets[0].items.map((i) => i.label);
    const key = new Map(set.items.map((i) => [i.label, i.category]));
    const cats = order.map((l) => key.get(l));
    // The pool lists 12 of category 0 then 12 of category 1; the sheet does not.
    expect(cats.join("")).not.toBe(set.items.map((i) => i.category).join(""));
    expect(order).toHaveLength(set.items.length);
    expect(new Set(order).size).toBe(order.length);
  });

  it("is byte-identical when cut twice, and does not change when a key is corrected", () => {
    const pool = clone();
    expect(sheetOf(pool)).toBe(sheetOf(clone()));
    const fixed = clone();
    fixed.sets[0].items[0].category = 1; // a corrected key
    expect(sheetOf(fixed)).toBe(sheetOf(pool));
  });

  it("changes an item's code when the item is reworded or its categories change, but not its key", () => {
    const pool = clone();
    const before = itemCode(pool.sets[0], pool.sets[0].items[0]);
    const flipped = clone();
    flipped.sets[0].items[0].category = 1;
    expect(itemCode(flipped.sets[0], flipped.sets[0].items[0])).toBe(before);
    const reworded = clone();
    reworded.sets[0].items[0].label = "puppy";
    expect(itemCode(reworded.sets[0], reworded.sets[0].items[0])).not.toBe(before);
    const recategorised = clone();
    recategorised.sets[0].categories = ["Alive", "Not alive"];
    expect(itemCode(recategorised.sets[0], recategorised.sets[0].items[0])).not.toBe(before);
  });
});

describe("reading a sheet back", () => {
  it("is forgiving about how the answer is written", () => {
    const pool = clone();
    const [first, second, third, fourth] = extractSortSheet(pool).sets[0].items;
    const marks = new Map([[first.code, "1."], [second.code, " 0 "], [third.code, "both"], [fourth.code, "?"]]);
    const filled = sheetOf(pool)
      .split("\n")
      .map((line) => {
        const m = /^- `#([0-9a-f]+)` .* \| Answer:$/.exec(line);
        return m && marks.has(m[1]) ? `${line} ${marks.get(m[1])}` : line;
      })
      .join("\n");
    const got = new Map(parseSortSheet(filled).answers.map((a) => [a.code, a]));
    expect(got.get(first.code)).toMatchObject({ choice: 1, refused: false, both: false });
    expect(got.get(second.code)).toMatchObject({ choice: 0, refused: false, both: false });
    expect(got.get(third.code)).toMatchObject({ choice: null, refused: false, both: true });
    expect(got.get(fourth.code)).toMatchObject({ choice: null, refused: true, both: false });
  });

  it("accepts the category's own name", () => {
    const pool = clone();
    const sheet = answerSheet(pool, sheetOf(pool), (_l, key, setId) => pool.sets.find((s) => s.id === setId)!.categories[key].toUpperCase());
    expect(compareSortSheet(pool, parseSortSheet(sheet).answers).ok).toBe(true);
  });

  it("names the pool and the set each answer belongs to", () => {
    const parsed = parseSortSheet(sheetOf(clone()));
    expect(parsed.poolId).toBe(FIXTURE_POOL_ID);
    expect(new Set(parsed.answers.map((a) => a.setId))).toEqual(new Set(["living", "state"]));
  });

  it("leaves a blank line blank", () => {
    const parsed = parseSortSheet(sheetOf(clone()));
    expect(parsed.answers.every((a) => a.choice === null && !a.refused && !a.both)).toBe(true);
  });
});

describe("the sheet round trip: extract, answer, compare", () => {
  it("passes when every item is answered as keyed", () => {
    const pool = clone();
    const report = compareSortSheet(pool, parseSortSheet(answeredRight(pool)).answers);
    expect(report).toMatchObject({ ok: true, total: 44, checked: 44, agreed: 44, flags: [], missing: [], stale: [], unknown: [] });
    expect(formatSortReport(report)).toContain("PASS");
  });

  it("flags a wrong answer as a disagreement, and fails", () => {
    const pool = clone();
    const rock = pool.sets[0].items.find((i) => i.label === "rock")!; // category 1, Non-living
    const sheet = answerSheet(pool, sheetOf(pool), (label, key) => (label === "rock" && key === 1 ? "0" : String(key)));
    const report = compareSortSheet(pool, parseSortSheet(sheet).answers);
    expect(report.ok).toBe(false);
    // "rock" is also in the state set (a solid, key 0): only the living-set one was changed.
    expect(report.unresolved).toHaveLength(1);
    expect(report.unresolved[0]).toMatchObject({ kind: "disagreement", itemId: rock.id, setId: "living", key: "Non-living", reviewerChoice: "Living" });
    const text = formatSortReport(report);
    expect(text).toContain("UNRESOLVED");
    expect(text).toContain("FAIL");
  });

  it("flags `both` as an ambiguity and `?` as unanswerable", () => {
    const pool = clone();
    const sheet = answerSheet(pool, sheetOf(pool), (label, key, setId) =>
      setId === "living" && label === "mushroom" ? "both" : setId === "living" && label === "moss" ? "?" : String(key),
    );
    const report = compareSortSheet(pool, parseSortSheet(sheet).answers);
    expect(report.flags.map((f) => [f.label, f.kind]).sort()).toEqual([["moss", "unanswerable"], ["mushroom", "ambiguity"]]);
    expect(report.ok).toBe(false);
  });

  it("counts a blank as missing, never as agreement", () => {
    const pool = clone();
    const sheet = answerSheet(pool, sheetOf(pool), (label, key, setId) => (setId === "state" && label === "ink" ? "" : String(key)));
    const report = compareSortSheet(pool, parseSortSheet(sheet).answers);
    expect(report.missing).toHaveLength(1);
    expect(report.ok).toBe(false);
  });

  it("passes with a settlement on each flag, and the settlement stops applying when the item changes", () => {
    const pool = clone();
    const sheet = answerSheet(pool, sheetOf(pool), (label, key, setId) => (setId === "living" && label === "mushroom" ? "1" : String(key)));
    const answers = parseSortSheet(sheet).answers;
    const mushroom = pool.sets[0].items.find((i) => i.label === "mushroom")!;
    const settled: Resolution = {
      itemId: mushroom.id,
      code: itemCode(pool.sets[0], mushroom),
      keyAt: "Living",
      verdict: "reviewer-was-wrong",
      note: "A mushroom is a fungus, and fungi are alive.",
      resolvedBy: "test",
      resolvedAt: "2026-11-20",
    };
    expect(compareSortSheet(pool, answers, [settled])).toMatchObject({ ok: true, unresolved: [] });
    expect(compareSortSheet(pool, answers, [settled]).flags[0].resolution?.verdict).toBe("reviewer-was-wrong");
    // The key moves: the settlement was about the old key, so the flag is back.
    const moved = clone();
    moved.sets[0].items.find((i) => i.id === mushroom.id)!.category = 1;
    const again = compareSortSheet(moved, answers, [settled]);
    expect(again.flags).toEqual([]); // the reviewer now agrees with the new key
    // A reworded item: the old answer is stale and the item is unanswered.
    const reworded = clone();
    reworded.sets[0].items.find((i) => i.id === mushroom.id)!.label = "toadstool";
    const stale = compareSortSheet(reworded, answers, [settled]);
    expect(stale.ok).toBe(false);
    expect(stale.stale).toHaveLength(1);
    expect(stale.missing).toEqual([mushroom.id]);
  });

  it("reports an answer for a set the pool does not have", () => {
    const pool = clone();
    const answers = parseSortSheet(answeredRight(pool)).answers;
    const smaller = clone();
    smaller.sets = [smaller.sets[0]];
    const report = compareSortSheet(smaller, answers);
    expect(report.unknown.length).toBe(20);
    expect(report.ok).toBe(false);
  });
});

describe("re-cutting a sheet that has answers", () => {
  it("keeps every answer whose item did not change, and blanks the one that did", () => {
    const pool = clone();
    const answered = answeredRight(pool);
    const edited = clone();
    edited.sets[0].items[0].label = "puppy";
    const next = carrySortForward(sheetOf(edited), answered);
    const report = compareSortSheet(edited, parseSortSheet(next).answers);
    expect(report.checked).toBe(43);
    expect(report.missing).toEqual([edited.sets[0].items[0].id]);
    expect(report.stale).toEqual([]);
  });
});

/**
 * The gate. It runs every sort sheet on disk and requires PASS, like the drill gate in
 * `blind-pass.test.ts`. With no sheets yet it passes vacuously; F8 adds the sheets, and from then on
 * a disagreement nobody settled fails the suite.
 */
describe("sort blind pass: the sheets on disk", () => {
  const poolIds = sortPoolsWithSheets();

  it("names a pool that exists for every sheet", () => {
    for (const poolId of poolIds) {
      expect(fs.existsSync(sortSheetPath(poolId)), `sheet for ${poolId}`).toBe(true);
      expect(() => loadSortPool(poolId), `pool for sheet ${poolId}`).not.toThrow();
    }
  });

  for (const poolId of poolIds) {
    it(`has every flag on ${poolId} settled`, () => {
      const report = runSortPool(poolId);
      expect(formatSortReport(report), formatSortReport(report)).toContain("PASS");
      expect(report.ok).toBe(true);
    });
  }

  it("is kept out of the drill gate: no sort sheet is read as a drill sheet", () => {
    expect(poolsWithSheets().filter((id) => id.startsWith("sort-"))).toEqual([]);
  });
});
