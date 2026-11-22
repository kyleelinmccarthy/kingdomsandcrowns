// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cloneRunePool } from "@/test/rune-pool-fixture";
import { poolsWithSheets, type Resolution } from "./blind-pass";
import { containsWord } from "./pool-validate";
import {
  RUNE_PICTURES,
  allRunePoolIds,
  carryRuneForward,
  compareRuneSheet,
  extractRuneSheet,
  formatRuneReport,
  parseRuneSheet,
  renderRuneSheet,
  runRunePool,
  runePoolsWithSheets,
  writeRuneSheet,
} from "./rune-blind-pass";
import { runeCode, type RunePool } from "./rune-pools";

const sheetOf = (pool: RunePool): string => renderRuneSheet(extractRuneSheet(pool));
const entryLines = (sheet: string): string[] => sheet.split("\n").filter((l) => /^- `#[0-9a-f]+` /.test(l));

/** Answers a rendered sheet: each entry line gets `choose(words)`, the entry's accepted words. */
function answerSheet(pool: RunePool, sheet: string, choose: (words: string[], id: string) => string): string {
  const byCode = new Map(pool.entries.map((e) => [runeCode(pool.poolId, e), e]));
  return sheet
    .split("\n")
    .map((line) => {
      const m = /^- `#([0-9a-f]+)` .* \| Answer:$/.exec(line);
      if (!m) return line;
      const entry = byCode.get(m[1])!;
      return `${line} ${choose(entry.words, entry.id)}`;
    })
    .join("\n");
}

const answeredRight = (pool: RunePool): string => answerSheet(pool, sheetOf(pool), (words) => words[0]);
const compare = (pool: RunePool, sheet: string, resolutions: Resolution[] = []) => compareRuneSheet(pool, parseRuneSheet(sheet).answers, resolutions);

describe("the rune sheet", () => {
  it("lists every entry once, with a blank answer, a warning not to open the pool, and the poolId", () => {
    const pool = cloneRunePool("g45");
    const sheet = sheetOf(pool);
    expect(sheet).toContain("**Do not open `src/content/runes/rune-g45.json`**");
    expect(entryLines(sheet)).toHaveLength(pool.entries.length);
    expect(sheet.split("\n").filter((l) => /\| Answer:$/.test(l))).toHaveLength(pool.entries.length);
    expect(parseRuneSheet(sheet).poolId).toBe("rune-g45");
  });

  it("shows each entry's picture, prompt and tiles sorted A-Z, joined by ·", () => {
    const pool = cloneRunePool("g23");
    const sheet = sheetOf(pool);
    for (const e of pool.entries) {
      const line = entryLines(sheet).find((l) => l.includes(`#${runeCode(pool.poolId, e)}`))!;
      expect(line).toContain(`(a picture of ${RUNE_PICTURES[e.effect]})`);
      expect(line).toContain(`Shown: "${e.prompt}"`);
      expect(line).toContain(`Heard: "${e.readAloud}"`);
      expect(line).toContain(`Tiles: ${[...e.tiles].sort().join(" · ")} | Answer:`);
    }
    expect(RUNE_PICTURES).toEqual({ mend: "something broken", light: "something dark", water: "something dry", open: "something stuck", grow: "something wilted" });
  });

  it("holds no key (RI-a / B4): no entry id, hint or why anywhere, at every band", () => {
    for (const band of ["k1", "g23", "g45", "g68", "g912"] as const) {
      const pool = cloneRunePool(band);
      const sheet = sheetOf(pool);
      for (const e of pool.entries) {
        expect(sheet, `${band} ${e.id}`).not.toContain(e.id);
        expect(sheet).not.toContain(e.hint);
        if (e.why) expect(sheet).not.toContain(e.why);
      }
    }
  });

  it("holds no word of a meaning pool anywhere, and leaves Heard out when there is no readAloud", () => {
    const pool = cloneRunePool("g45");
    const sheet = sheetOf(pool);
    for (const e of pool.entries) for (const w of e.words) {
      expect(sheet).not.toContain(w);
      expect(containsWord(sheet, w, { inflections: true })).toBe(false);
    }
    for (const line of entryLines(sheet)) expect(line).not.toMatch(/Heard:/);
  });

  it("shows a meaning's readAloud when it has one (it never holds the word)", () => {
    const pool = cloneRunePool("g68");
    pool.entries[0].readAloud = "Say it out loud, then build it.";
    expect(entryLines(sheetOf(pool)).find((l) => l.includes(`#${runeCode(pool.poolId, pool.entries[0])}`))).toContain('Heard: "Say it out loud, then build it."');
  });

  it("holds a dictation's word only inside its own Heard part", () => {
    const pool = cloneRunePool("k1");
    const sheet = sheetOf(pool);
    for (const e of pool.entries) {
      const word = e.words[0];
      const own = `#${runeCode(pool.poolId, e)}`;
      const lines = sheet.split("\n").filter((l) => containsWord(l, word) || l.includes(word));
      expect(lines, word).toHaveLength(1);
      expect(lines[0]).toContain(own);
      const outsideHeard = lines[0].replace(/Heard: "[^"]*"/, "");
      expect(outsideHeard).not.toContain(word);
    }
  });

  it("tells the reader what to do, for a dictation and for a meaning, and that a dictation cannot test ambiguity", () => {
    const k1 = sheetOf(cloneRunePool("k1"));
    expect(k1).toMatch(/heard/i);
    expect(k1).toMatch(/cannot test whether another word/i);
    const g45 = sheetOf(cloneRunePool("g45"));
    expect(g45).toMatch(/`both`/);
    expect(g45).toMatch(/`\?`/);
  });

  it("shuffles the entries in an order that does not follow the pool, and is byte-identical when cut twice", () => {
    const pool = cloneRunePool("g45");
    const codes = entryLines(sheetOf(pool)).map((l) => /#([0-9a-f]+)/.exec(l)![1]);
    expect(codes).not.toEqual(pool.entries.map((e) => runeCode(pool.poolId, e)));
    expect(sheetOf(pool)).toBe(sheetOf(cloneRunePool("g45")));
    // Correcting a key changes nothing on the sheet.
    const fixed = cloneRunePool("g45");
    fixed.entries[3].words = [...fixed.entries[3].words, "zyx"];
    expect(sheetOf(fixed)).toBe(sheetOf(pool));
  });

  it("a code follows what is shown (F-2): reordering the tiles keeps it, editing the prompt or a tile changes it", () => {
    const pool = cloneRunePool("g23");
    const e = pool.entries[5];
    const code = runeCode(pool.poolId, e);
    expect(runeCode(pool.poolId, { ...e, tiles: [...e.tiles].reverse() })).toBe(code);
    expect(runeCode(pool.poolId, { ...e, prompt: `${e.prompt} Now.` })).not.toBe(code);
    expect(runeCode(pool.poolId, { ...e, tiles: [...e.tiles.slice(0, -1), "oo"] })).not.toBe(code);
    expect(runeCode(pool.poolId, { ...e, readAloud: "zyx. Build zyx." })).not.toBe(code);
    expect(runeCode(pool.poolId, { ...e, effect: e.effect === "mend" ? "grow" : "mend" })).not.toBe(code);
    expect(runeCode("rune-g45", e)).not.toBe(code);
  });
});

describe("reading a sheet back", () => {
  const pool = cloneRunePool("g45");
  const first = (sheet: string) => parseRuneSheet(sheet).answers[0];
  const oneLine = (answer: string): string => `${sheetOf(pool).split("\n").find((l) => /\| Answer:$/.test(l))!} ${answer}`;

  it("reads one word, whatever its case, quotes or trailing punctuation", () => {
    for (const a of ["zyxwvt", "ZYXWVT", '"zyxwvt".', "`zyxwvt`"]) expect(first(oneLine(a)), a).toMatchObject({ word: "zyxwvt", refused: false, both: false });
  });

  it("reads `both` with the words after it, in whatever separators, and `?`", () => {
    expect(first(oneLine("both zyxwvt, qpnmlk"))).toMatchObject({ both: true, fits: ["zyxwvt", "qpnmlk"], word: null });
    expect(first(oneLine("either zyxwvt and qpnmlk"))).toMatchObject({ both: true, fits: ["zyxwvt", "qpnmlk"] });
    expect(first(oneLine("?"))).toMatchObject({ refused: true, word: null });
    expect(first(oneLine("none"))).toMatchObject({ refused: true });
  });

  it("treats something it cannot read as unanswerable, never as a word", () => {
    for (const a of ["two words", "zy-xw", "42"]) expect(first(oneLine(a)), a).toMatchObject({ refused: true, word: null });
  });

  it("leaves a blank line blank", () => {
    expect(first(sheetOf(pool))).toMatchObject({ word: null, refused: false, both: false });
  });
});

describe("the sheet round trip: extract, answer, compare", () => {
  it("passes when every entry is answered with an accepted word", () => {
    const pool = cloneRunePool("g45");
    const report = compare(pool, answeredRight(pool));
    expect(report).toMatchObject({ total: 80, checked: 80, agreed: 80, flags: [], missing: [], stale: [], ok: true });
    expect(formatRuneReport(report)).toMatch(/PASS/);
  });

  it("flags a buildable word that is not accepted as disagree, and a word the tiles cannot build as not-buildable", () => {
    const pool = cloneRunePool("g45");
    const [a, b] = pool.entries;
    const sheet = answerSheet(pool, sheetOf(pool), (words, id) => (id === a.id ? "zy" + "xw" : id === b.id ? "qqqq" : words[0]));
    // "zyxw" is built from the first two tiles of the first word's tray.
    const report = compare(pool, sheet);
    expect(report.ok).toBe(false);
    const kinds = Object.fromEntries(report.flags.map((f) => [f.itemId, f.kind]));
    expect(kinds).toEqual({ [a.id]: "disagree", [b.id]: "not-buildable" });
    expect(report.unresolved).toHaveLength(2);
    const text = formatRuneReport(report);
    expect(text).toContain("[disagree]");
    expect(text).toContain("[not-buildable]");
    expect(text).toMatch(/FAIL/);
  });

  it("passes a `both` of two accepted words, and flags a `both` naming another word as ambiguous", () => {
    const pool = cloneRunePool("g45");
    const e = pool.entries[0];
    e.words = [e.words[0], "qpnm"];
    e.tiles = [...e.tiles, "qp", "nm"];
    const two = compare(pool, answerSheet(pool, sheetOf(pool), (words) => (words.length === 2 ? `both ${words[0]} ${words[1]}` : words[0])));
    expect(two.ok).toBe(true);
    const other = compare(pool, answerSheet(pool, sheetOf(pool), (words) => (words.length === 2 ? `both ${words[0]} zyx` : words[0])));
    expect(other.flags.map((f) => [f.itemId, f.kind])).toEqual([[e.id, "ambiguous"]]);
    expect(other.flags[0].fits).toEqual([e.words[0], "zyx"]);
    const bare = compare(pool, answerSheet(pool, sheetOf(pool), (words, id) => (id === e.id ? "both" : words[0])));
    expect(bare.flags.map((f) => f.kind)).toEqual(["ambiguous"]);
  });

  it("flags `?` as unanswerable", () => {
    const pool = cloneRunePool("k1");
    const report = compare(pool, answerSheet(pool, sheetOf(pool), (words, id) => (id === pool.entries[2].id ? "?" : words[0])));
    expect(report.flags.map((f) => [f.itemId, f.kind])).toEqual([[pool.entries[2].id, "unanswerable"]]);
  });

  it("counts a blank as missing, never as agreement", () => {
    const pool = cloneRunePool("k1");
    const report = compare(pool, sheetOf(pool));
    expect(report.checked).toBe(0);
    expect(report.missing).toHaveLength(80);
    expect(report.ok).toBe(false);
    expect(formatRuneReport(report)).toMatch(/unanswered/);
  });

  it("reports a stale code when an entry is edited after it was answered", () => {
    const pool = cloneRunePool("g45");
    const sheet = answeredRight(pool);
    pool.entries[4].prompt = `${pool.entries[4].prompt} Again.`;
    const report = compare(pool, sheet);
    expect(report.stale).toHaveLength(1);
    expect(report.missing).toEqual([pool.entries[4].id]);
    expect(report.ok).toBe(false);
  });

  it("passes with a settlement on each flag, and the settlement stops applying when the key moves", () => {
    const pool = cloneRunePool("g45");
    const e = pool.entries[0];
    const sheet = answerSheet(pool, sheetOf(pool), (words, id) => (id === e.id ? "?" : words[0]));
    const settled: Resolution = { itemId: e.id, code: runeCode(pool.poolId, e), keyAt: e.words.join(","), verdict: "reviewer-was-wrong", note: "The meaning names it.", resolvedBy: "test", resolvedAt: "2026-11-21" };
    const report = compare(pool, sheet, [settled]);
    expect(report.flags).toHaveLength(1);
    expect(report.unresolved).toHaveLength(0);
    expect(report.ok).toBe(true);
    expect(formatRuneReport(report)).toContain("The meaning names it.");
    // A second accepted word moves the key but not the code (what is shown is unchanged).
    e.words = [...e.words, "zyxw"];
    expect(runeCode(pool.poolId, e)).toBe(settled.code);
    const moved = compare(pool, sheet, [settled]);
    expect(moved.unresolved).toHaveLength(1);
    expect(moved.ok).toBe(false);
  });
});

describe("re-extracting a sheet that has answers (F-2)", () => {
  it("keeps every unchanged answer and blanks an edited entry's", () => {
    const pool = cloneRunePool("g45");
    const answered = answerSheet(pool, sheetOf(pool), (words, id) => (id === pool.entries[1].id ? "both zyx qpn" : id === pool.entries[2].id ? "?" : words[0]));
    pool.entries[0].prompt = `${pool.entries[0].prompt} Again.`;
    const recut = carryRuneForward(sheetOf(pool), answered);
    const byCode = new Map(parseRuneSheet(recut).answers.map((a) => [a.code, a]));
    expect(byCode.get(runeCode(pool.poolId, pool.entries[0]))).toMatchObject({ word: null, refused: false, both: false });
    expect(byCode.get(runeCode(pool.poolId, pool.entries[1]))).toMatchObject({ both: true, fits: ["zyx", "qpn"] });
    expect(byCode.get(runeCode(pool.poolId, pool.entries[2]))).toMatchObject({ refused: true });
    expect(byCode.get(runeCode(pool.poolId, pool.entries[3]))).toMatchObject({ word: pool.entries[3].words[0] });
  });

  it("is the identity when nothing changed, and leaves an unanswered sheet untouched", () => {
    const pool = cloneRunePool("k1");
    const answered = answeredRight(pool);
    expect(carryRuneForward(sheetOf(pool), answered)).toBe(answered);
    expect(carryRuneForward(sheetOf(pool), sheetOf(pool))).toBe(sheetOf(pool));
  });
});

describe("cutting a sheet", () => {
  it("refuses a pool that does not validate, before writing anything", () => {
    const pool = cloneRunePool("k1");
    pool.entries[0].tiles = ["m", "e", "n"];
    expect(() => writeRuneSheet(pool)).toThrow(/does not validate/);
  });

  it("finds the rune sheets in a review folder, by prefix, and leaves resolutions and other sheets out", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rune-review-"));
    try {
      for (const f of ["rune-k1.blind.md", "rune-g45.blind.md", "rune-k1.resolved.json", "trail-k1.blind.md", "vocab-g45.blind.md"]) fs.writeFileSync(path.join(dir, f), "x");
      expect(runePoolsWithSheets(dir)).toEqual(["rune-g45", "rune-k1"]);
      expect(poolsWithSheets(dir)).toEqual(["vocab-g45"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("rune blind pass: the sheets on disk", () => {
  const ids = runePoolsWithSheets();

  it("names a pool that exists for every sheet", () => {
    for (const id of ids) expect(allRunePoolIds(), id).toContain(id);
  });

  // Vacuous until I6 cuts the sheets; then every flag on every sheet must be settled.
  it("compare passes every sheet on disk", () => {
    for (const id of ids) {
      const report = runRunePool(id);
      expect(report.ok, formatRuneReport(report)).toBe(true);
    }
  });

  it("is kept out of the drill gate: no rune sheet is read as a drill sheet", () => {
    for (const id of poolsWithSheets()) expect(id.startsWith("rune-"), id).toBe(false);
  });
});
