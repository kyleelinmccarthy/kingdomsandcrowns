// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Resolution } from "./blind-pass";
import { answerSlots, carryForwardByCode, closingLines, findResolution, flagLines, readAnswer, unresolvedOf } from "./sheet-kit";

const settled = (over: Partial<Resolution> = {}): Resolution => ({
  itemId: "a",
  code: "0000abcd",
  keyAt: "k",
  verdict: "reviewer-was-wrong",
  note: "The key stands.",
  resolvedBy: "test",
  resolvedAt: "2026-11-21",
  ...over,
});

describe("readAnswer", () => {
  it("reads blank, both, neither and a value, whatever the case, spacing and trailing punctuation", () => {
    expect(readAnswer("")).toEqual({ kind: "blank" });
    expect(readAnswer("   ")).toEqual({ kind: "blank" });
    expect(readAnswer(" Both. ")).toEqual({ kind: "both", rest: "" });
    expect(readAnswer("either")).toEqual({ kind: "both", rest: "" });
    expect(readAnswer("both: A, B")).toEqual({ kind: "both", rest: "a, b" });
    expect(readAnswer("?")).toEqual({ kind: "refused" });
    expect(readAnswer("N/A")).toEqual({ kind: "refused" });
    expect(readAnswer("1.")).toEqual({ kind: "value", value: "1" });
    expect(readAnswer("Landmark:Mill)")).toEqual({ kind: "value", value: "landmark:mill" });
  });
});

describe("answerSlots and carryForwardByCode", () => {
  const sheet = ["# a sheet", "- `#0000aaaa` first | Answer:", "- `#0000bbbb` second | Answer: 1", "", "## Set 1. `s1`", "- `#0000aaaa` first | Answer:"].join("\n");

  it("lists every slot, filled or not", () => {
    expect(answerSlots(sheet)).toEqual([
      { code: "0000aaaa", raw: "" },
      { code: "0000bbbb", raw: " 1" },
      { code: "0000aaaa", raw: "" },
    ]);
  });

  it("fills only blank slots whose code is carried", () => {
    const next = carryForwardByCode(sheet, new Map([["0000aaaa", "x"], ["0000bbbb", "y"]]));
    expect(next.split("\n").filter((l) => l.includes("Answer:"))).toEqual([
      "- `#0000aaaa` first | Answer: x",
      "- `#0000bbbb` second | Answer: 1",
      "- `#0000aaaa` first | Answer: x",
    ]);
    expect(carryForwardByCode(sheet, new Map())).toBe(sheet);
  });

  it("keys by section when the sheet has sections, and fills nothing before the first heading", () => {
    const next = carryForwardByCode(sheet, new Map([["s1/0000aaaa", "z"]]), /^## Set \d+\. `([^`]+)`/);
    expect(next.split("\n").filter((l) => l.includes("Answer:"))).toEqual([
      "- `#0000aaaa` first | Answer:",
      "- `#0000bbbb` second | Answer: 1",
      "- `#0000aaaa` first | Answer: z",
    ]);
  });
});

describe("resolutions and the printed report", () => {
  it("finds a settlement only when the item, its code and its key all still match", () => {
    const r = settled();
    expect(findResolution([r], "a", "0000abcd", "k")).toBe(r);
    expect(findResolution([r], "b", "0000abcd", "k")).toBeUndefined();
    expect(findResolution([r], "a", "0000abce", "k")).toBeUndefined();
    expect(findResolution([r], "a", "0000abcd", "other")).toBeUndefined();
  });

  it("separates the flags nobody settled", () => {
    const flags = [{ id: 1, resolution: settled() }, { id: 2 }];
    expect(unresolvedOf(flags)).toEqual([{ id: 2 }]);
  });

  it("prints a flag's heading, its details and its settlement", () => {
    expect(flagLines({ kind: "ambiguity", itemId: "t/1" }, ["line one"])).toEqual(["  [ambiguity] t/1 — UNRESOLVED", "      line one"]);
    expect(flagLines({ kind: "disagreement", itemId: "t/1", resolution: settled() }, ["line one"])).toEqual([
      "  [disagreement] t/1 — resolved: reviewer-was-wrong",
      "      line one",
      "      The key stands. (test)",
    ]);
  });

  it("closes a report with what is outstanding and the verdict", () => {
    expect(closingLines({ missing: [], stale: [], unknown: [], ok: true })).toEqual(["  PASS"]);
    expect(closingLines({ missing: ["a", "b"], stale: ["#1"], unknown: ["x"], ok: false })).toEqual([
      "  unanswered: a, b",
      "  answered before the item changed: #1",
      "  not in the pool: x",
      "  FAIL",
    ]);
  });
});
