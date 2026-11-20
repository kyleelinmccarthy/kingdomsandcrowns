import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/utils/drill-generators";
import { SKILLS } from "@/lib/utils/skills";
import {
  BALANCE, BALANCE_ALT, CAGE4, LOGIC3, NONO5, NONO5_MARKED, PATTERN, PATTERN_ALT, SHAPES3, SHAPES3_ALT, SORT, SORT1, SORT2, SORT_ALT,
} from "@/test/lock-stubs";
import { TASK_CODECS } from "./codecs";
import { TASK_DRAWERS } from "./draw";
import { HANDS_ON_KINDS } from "./kinds";
import { checkTask, lockKind } from "./lock";
import { LOCK_MISS_LINE } from "./lock-copy";
import { LOCKS, lockFor } from "./locks";
import { TASK_KINDS, isTaskCorrect, kindForSkill, toClientTask } from "./registry";
import type { LockResponse, LockTask, TaskKind } from "./types";

const STUBS: LockTask[] = [PATTERN, SORT1, SORT2, SHAPES3, BALANCE, CAGE4, NONO5, LOGIC3, SORT];
const codec = TASK_CODECS.lock;
const enc = (t: LockTask, cells: number[]) => codec.encode({ puzzle: t.puzzle, cells } as LockResponse);
const parse = (raw: unknown, t: LockTask) => lockKind.parseResponse(raw, t);
/** The stored solution with one cell changed to `v`. */
const withCell = (t: LockTask, i: number, v: number) => t.solution.cells.map((x, j) => (j === i ? v : x));

describe("lock: registered, and presenting only where a generator exists", () => {
  it("is a registered, hands-on kind with a codec and a drawer", () => {
    expect(TASK_KINDS.lock).toBe(lockKind);
    expect(HANDS_ON_KINDS).toEqual(["measure", "lock"]);
    expect(typeof TASK_DRAWERS.lock).toBe("function");
  });

  it("only the skills with a lock generator present as locks; every other skill draws as before (RF-a)", () => {
    const registered = Object.keys(LOCKS).sort();
    expect(registered).toEqual(expect.arrayContaining(["logic-g23", "logic-k1"]));
    for (const s of SKILLS) {
      const lock = registered.includes(s.id);
      expect(lockKind.presents(s.id), s.id).toBe(lock);
      if (lock) {
        expect(TASK_DRAWERS.lock(s, 2, seededRng(1))?.kind).toBe("lock");
        expect(kindForSkill("lock", s.id, new Set<TaskKind>(["lock", "measure"]))).toBe("lock");
      } else {
        expect(TASK_DRAWERS.lock(s, 2, seededRng(1))).toBeNull();
        expect(kindForSkill("lock", s.id, new Set<TaskKind>(["lock", "measure"]))).toBe("choice");
      }
    }
    expect(lockFor("toString")).toBeUndefined();
  });

  it("the definition delegates to the codec (no second copy)", () => {
    expect(lockKind.encode).toBe(codec.encode);
    expect(lockKind.decode).toBe(codec.decode);
    expect(lockKind.sameResponse).toBe(codec.sameResponse);
  });
});

describe("lock: what the browser is shown", () => {
  it.each(STUBS)("$puzzle: the client task never holds the solution, the fits or the explanation", (t) => {
    const withExplain = { ...t, explain: "Because it fits." } as LockTask;
    const client = toClientTask(withExplain);
    const json = JSON.stringify(client);
    for (const leak of ['"solution"', '"fits"', '"explain"', "Because it fits."]) expect(json).not.toContain(leak);
    expect(client).toMatchObject({ kind: "lock", id: t.id, skillId: t.skillId, prompt: t.prompt, view: { puzzle: t.puzzle } });
  });

  it("a subject sort's view names the bins and each item's id and label, and nothing about where an item goes", () => {
    const v = lockKind.toView(SORT);
    expect(v).toEqual({ puzzle: "sort", categories: ["Lives in water", "Lives on land"], items: SORT.items });
    if (v.puzzle !== "sort") throw new Error("not a sort");
    for (const item of v.items) expect(Object.keys(item).sort()).toEqual(["id", "label"]);
  });

  it("is built field by field: extra fields on a stored task never ride along", () => {
    const sneaky = { ...CAGE4, cages: CAGE4.cages.map((c) => ({ ...c, answer: 9 })), secret: "x", givens: Array(16).fill(0) } as unknown as LockTask;
    const json = JSON.stringify(lockKind.toView(sneaky));
    expect(json).not.toContain("secret");
    expect(json).not.toContain('"answer"');
    expect(lockKind.toView(PATTERN)).toEqual({ puzzle: "pattern", sequence: PATTERN.sequence, tray: PATTERN.tray });
    expect(lockKind.toView(BALANCE)).toEqual({ puzzle: "balance", weights: [1, 2, 3, 4, 6], target: 7, unit: "stones" });
    expect(lockKind.toView(LOGIC3)).toEqual({ puzzle: "logic3", rows: LOGIC3.rows, cols: LOGIC3.cols, clues: LOGIC3.clues });
  });

  it("the miss reveal in words is one short sentence, whatever the puzzle (R-F2)", () => {
    for (const t of STUBS) expect(lockKind.answerText(t)).toBe(LOCK_MISS_LINE);
    expect(LOCK_MISS_LINE).toBe("Here is one way it fits.");
  });
});

describe("lock: forged responses are refused (Review Focus 1)", () => {
  it.each(STUBS)("$puzzle: wrong length, out of range, non-integers, another puzzle, junk and 10 KB are all refused", (t) => {
    const n = t.solution.cells.length;
    const forged: unknown[] = [
      enc(t, t.solution.cells.slice(0, n - 1)),                       // a cell short
      enc(t, [...t.solution.cells, 0]),                                // a cell over (an item placed twice)
      enc(t, withCell(t, 0, 9)),                                       // out of range
      `${t.puzzle}:${[-1, ...t.solution.cells.slice(1)].join(",")}`,   // negative
      `${t.puzzle}:${["1.5", ...t.solution.cells.slice(1)].join(",")}`,// not a whole number
      `${t.puzzle}:${["01", ...t.solution.cells.slice(1)].join(",")}`, // not canonical
      `${t.puzzle}: ${t.solution.cells.join(",")}`,                    // a space
      ` ${enc(t, t.solution.cells)}`,                                  // not trimmed for it
      `${enc(t, t.solution.cells)},`,                                  // a trailing comma
      `${t.puzzle === "cage4" ? "cage5" : "cage4"}:${t.solution.cells.join(",")}`, // another puzzle
      `nope:${t.solution.cells.join(",")}`,
      t.solution.cells.join(","),                                      // no puzzle
      `${t.puzzle}:`,
      "",
      "x".repeat(10_000),
      `${t.puzzle}:${Array(5000).fill(0).join(",")}`,
      t.solution, t.solution.cells, 7, null, undefined, {}, true,
    ];
    for (const raw of forged) expect(parse(raw, t), JSON.stringify(raw)?.slice(0, 60)).toBeNull();
    expect(parse(enc(t, t.solution.cells), t)).toEqual(t.solution);
  });

  it("a sort refuses an item sent to a bin that does not exist, or placed twice", () => {
    expect(parse(enc(SORT, [1, 1, 2, 2, 3]), SORT)).toBeNull();
    expect(parse(enc(SORT1, [1, 2, 1, 2, 1]), SORT1)).toBeNull();
    expect(parse(enc(SORT2, [1, 4, 2, 5]), SORT2)).toBeNull();
    // The response is one bin per item, by position: a second placement is a sixth entry, refused.
    expect(parse(`sort:1,1,2,2,1,2`, SORT)).toBeNull();
    expect(parse(`sort:1,1,2,2,1;4:2`, SORT)).toBeNull();
  });

  it("a grid refuses a changed given, even when the board it makes is otherwise valid", () => {
    expect(parse(enc(SHAPES3, [2, 1, 3, 1, 3, 2, 3, 2, 1]), SHAPES3)).toBeNull();
    expect(parse(enc(SHAPES3, [0, 2, 3, 2, 3, 1, 3, 1, 2]), SHAPES3)).toBeNull();
  });

  it("a nonogram stored without five row clues and five column clues is refused, never passed (a missing line would read as empty)", () => {
    const malformed = [
      { ...NONO5, rows: NONO5.rows.slice(0, 4) },
      { ...NONO5, cols: NONO5.cols.slice(0, 4) },
      { ...NONO5, rows: [...NONO5.rows, []] },
      { ...NONO5, cols: [...NONO5.cols, [1]] },
      { ...NONO5, rows: [...NONO5.rows.slice(0, 4), "3"] },
      { ...NONO5, cols: undefined },
    ] as unknown as LockTask[];
    for (const t of malformed) {
      expect(parse(enc(t, NONO5.solution.cells), t)).toBeNull();
      expect(checkTask(t, NONO5.solution)).toMatchObject({ ok: false, broken: ["response"] });
    }
    expect(parse(enc(NONO5, NONO5.solution.cells), NONO5)).toEqual(NONO5.solution);
  });

  it("an unfinished board is well-formed (it is graded, not refused)", () => {
    expect(parse(enc(CAGE4, Array(16).fill(0)), CAGE4)).toEqual({ puzzle: "cage4", cells: Array(16).fill(0) });
    expect(parse(enc(SORT, [0, 0, 0, 0, 0]), SORT)).not.toBeNull();
  });
});

describe("lock: checked against the rules, never the stored solution (R-F1, Review Focus 2)", () => {
  it.each(STUBS)("$puzzle: the stored solution is right", (t) => {
    expect(lockKind.isCorrect(t, t.solution)).toBe(true);
    expect(isTaskCorrect(t, enc(t, t.solution.cells))).toBe(true);
    expect(lockKind.feedback(t, t.solution)).toBe("none");
  });

  it.each([
    ["pattern", PATTERN, PATTERN_ALT],
    ["shapes3", SHAPES3, SHAPES3_ALT],
    ["balance", BALANCE, BALANCE_ALT],
    ["balance (three weights)", BALANCE, { puzzle: "balance", cells: [1, 1, 0, 1, 0] }],
    ["sort", SORT, SORT_ALT],
    ["nono5 (blanks marked)", NONO5, NONO5_MARKED],
  ] as [string, LockTask, LockResponse][])("%s: another valid solution is right too", (_, t, alt) => {
    expect(codec.sameResponse(alt, t.solution)).toBe(false);
    expect(lockKind.isCorrect(t, alt)).toBe(true);
    expect(isTaskCorrect(t, codec.encode(alt))).toBe(true);
  });

  it.each([
    [PATTERN, [3, 1]],
    [SHAPES3, [1, 2, 3, 2, 3, 1, 3, 1, 3]],
    [CAGE4, [1, 2, 3, 4, 3, 4, 1, 2, 4, 3, 2, 1, 2, 1, 4, 3]],
    [NONO5, withCell(NONO5, 2, 1)],
    [LOGIC3, [1, 2, 3]],
    [BALANCE, [1, 1, 0, 0, 0]],
    [SORT, [2, 1, 2, 2, 1]],
    [SORT1, [2, 1, 1, 2]],
    [SORT2, [1, 4, 3, 2]],
  ] as [LockTask, number[]][])("%#: a full answer that breaks a rule is wrong, and says a rule is broken", (t, cells) => {
    const r = { puzzle: t.puzzle, cells } as LockResponse;
    expect(lockKind.isCorrect(t, r)).toBe(false);
    expect(lockKind.feedback(t, r)).toBe("rule_broken");
  });

  it.each(STUBS)("$puzzle: an answer with a gap is wrong, and says there are spaces left", (t) => {
    const r = { puzzle: t.puzzle, cells: t.puzzle === "nono5" ? Array(25).fill(0) : t.puzzle === "balance" ? [0, 0, 0, 0, 0] : withCell(t, t.puzzle === "shapes3" ? 1 : 0, 0) } as LockResponse;
    expect(lockKind.isCorrect(t, r)).toBe(false);
    expect(lockKind.feedback(t, r)).toBe("incomplete");
  });

  it("a gap outranks a broken rule: the child hears about the empty spaces first", () => {
    expect(lockKind.feedback(SHAPES3, { puzzle: "shapes3", cells: [1, 2, 2, 3, 0, 1, 0, 1, 0] })).toBe("incomplete");
  });

  it("a stored response that will not fit the task is wrong, never thrown on", () => {
    expect(isTaskCorrect(CAGE4, "pattern:1,1")).toBe(false);
    expect(isTaskCorrect(CAGE4, "cage4:1,2")).toBe(false);
    expect(isTaskCorrect(SHAPES3, enc(SHAPES3, [2, 1, 3, 1, 3, 2, 3, 2, 1]))).toBe(false);
    expect(isTaskCorrect(SORT, "sort:1,1,2,2,9")).toBe(false);
    expect(lockKind.feedback(CAGE4, { puzzle: "pattern", cells: [1, 1] })).toBe("rule_broken");
  });

  it("every lock allows a second chance", () => {
    for (const t of STUBS) expect(lockKind.allowsSecondChance(t)).toBe(true);
  });
});

describe("lock: a sort with no key is never passed", () => {
  const wrong = (t: Extract<LockTask, { puzzle: "sort1" | "sort2" | "sort" }>, bins: number): LockResponse =>
    ({ puzzle: t.puzzle, cells: t.solution.cells.map((c) => (c % bins) + 1) }) as LockResponse;
  const keyless = (t: LockTask, over: Record<string, unknown> = {}) => {
    const copy: Record<string, unknown> = { ...t, ...over };
    if (!("fits" in over)) delete copy.fits;
    return copy as unknown as LockTask;
  };

  it("a sort whose fits is missing, not a list, short, or holds a non-list is never ok, even when every item is misplaced", () => {
    for (const [t, bins] of [[SORT1, 2], [SORT2, 4], [SORT, 2]] as const) {
      const miss = wrong(t, bins);
      expect(checkTask(t, miss).ok).toBe(false);
      for (const bad of [keyless(t), keyless(t, { fits: "nope" }), keyless(t, { fits: t.fits.slice(1) }), keyless(t, { fits: t.fits.map(() => 0) }), keyless(t, { fits: [...t.fits, [0]] })]) {
        const c = checkTask(bad, miss);
        expect(c.ok, `${t.puzzle} ${JSON.stringify((bad as { fits?: unknown }).fits)}`).toBe(false);
        expect(c.broken).toContain("fits");
        // And not even the stored solution passes a sort with no key: nothing can be vouched for.
        expect(checkTask(bad, t.solution).ok).toBe(false);
        expect(lockKind.isCorrect(bad, t.solution)).toBe(false);
      }
    }
  });
});

describe("lock codec", () => {
  it.each(STUBS)("$puzzle: round-trips the solution, canonically, and never as the give-up marker", (t) => {
    const s = codec.encode(t.solution);
    expect(s).not.toBe("");
    expect(s.length).toBeLessThanOrEqual(200);
    expect(s).toBe(`${t.puzzle}:${t.solution.cells.join(",")}`);
    expect(codec.decode(s)).toEqual(t.solution);
    expect(codec.encode(codec.decode(s)!)).toBe(s);
    expect(codec.sameResponse(t.solution, codec.decode(s)!)).toBe(true);
  });

  it("reads only the canonical form, so one response has exactly one string", () => {
    for (const s of ["cage4:01", "cage4:1,,2", "cage4: 1", "cage4:1 ", "Cage4:1", "cage4:+1", "cage4:1e1", "cage4:100", "lock:1", "toString:1", "pattern", ":1"]) {
      expect(codec.decode(s), s).toBeNull();
    }
    expect(codec.decode(`balance:${Array(26).fill(0).join(",")}`)).toBeNull();
    expect(codec.decode(`balance:${Array(25).fill(0).join(",")}`)).not.toBeNull();
  });

  it("compares responses by their canonical form", () => {
    expect(codec.sameResponse({ puzzle: "pattern", cells: [1, 1] }, { puzzle: "pattern", cells: [1, 1] })).toBe(true);
    expect(codec.sameResponse({ puzzle: "pattern", cells: [1, 1] }, { puzzle: "pattern", cells: [1, 2] })).toBe(false);
    expect(codec.sameResponse({ puzzle: "logic3", cells: [1, 2, 3] }, { puzzle: "shapes3", cells: [1, 2, 3] })).toBe(false);
  });
});
