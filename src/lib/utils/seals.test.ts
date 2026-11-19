import { describe, it, expect } from "vitest";
import { SEAL_PHRASES, SEAL_NOTE_MAX, parseSealInput, parseSeal, sealText, sealToStore, buildSeal } from "./seals";

describe("SEAL_PHRASES", () => {
  it("has six short, warm phrases that never mention behind or ahead", () => {
    expect(SEAL_PHRASES).toHaveLength(6);
    for (const p of SEAL_PHRASES) {
      expect(p.length).toBeGreaterThan(0);
      expect(p.length).toBeLessThanOrEqual(30);
      expect(p).not.toMatch(/behind|ahead/i);
    }
  });
});

describe("parseSealInput", () => {
  it("accepts a phrase index 0-5", () => {
    for (let i = 0; i < 6; i++) expect(parseSealInput({ phrase: i })).toEqual({ phrase: i });
  });

  it("refuses a phrase index outside 0-5, or not a whole number", () => {
    for (const phrase of [-1, 6, 1.5, "1", NaN, null]) expect(parseSealInput({ phrase })).toBeNull();
  });

  it("refuses both or neither of phrase and note", () => {
    expect(parseSealInput({ phrase: 1, note: "Great" })).toBeNull();
    expect(parseSealInput({})).toBeNull();
    expect(parseSealInput({ phrase: undefined, note: undefined })).toBeNull();
  });

  it("accepts a trimmed note up to 60 characters, and refuses 61", () => {
    expect(parseSealInput({ note: "  Well done on the maps  " })).toEqual({ note: "Well done on the maps" });
    expect(parseSealInput({ note: "x".repeat(SEAL_NOTE_MAX) })).toEqual({ note: "x".repeat(60) });
    expect(parseSealInput({ note: "x".repeat(61) })).toBeNull();
  });

  it("refuses an empty or whitespace note, and a note with a newline", () => {
    expect(parseSealInput({ note: "" })).toBeNull();
    expect(parseSealInput({ note: "   " })).toBeNull();
    expect(parseSealInput({ note: "two\nlines" })).toBeNull();
    expect(parseSealInput({ note: "two\r\nlines" })).toBeNull();
  });

  it("sanitizes a note, and refuses what sanitizing empties", () => {
    expect(parseSealInput({ note: "Nice <b>work</b>!" })).toEqual({ note: "Nice work!" });
    expect(parseSealInput({ note: "<script></script>" })).toBeNull();
  });

  it("refuses non-objects, extra keys and a non-string note", () => {
    for (const raw of [null, undefined, 3, "x", [], { note: 4 }, { phrase: 0, by: "Mum" }, { note: "ok", x: 1 }]) {
      expect(parseSealInput(raw)).toBeNull();
    }
  });
});

describe("parseSeal", () => {
  it("reads a stored seal, as an object or a JSON string", () => {
    const stored = { phrase: 2, by: "Mum", at: 1_700_000_000 };
    expect(parseSeal(stored)).toEqual(stored);
    expect(parseSeal(JSON.stringify(stored))).toEqual(stored);
    expect(parseSeal(JSON.stringify({ note: "Lovely", by: "Dad", at: 5 }))).toEqual({ note: "Lovely", by: "Dad", at: 5 });
  });

  it("gives null for junk", () => {
    const junk: unknown[] = [
      null,
      undefined,
      "",
      "not json",
      "[]",
      42,
      {},
      { phrase: 9, by: "Mum", at: 1 },
      { phrase: 1, note: "both", by: "Mum", at: 1 },
      { phrase: 1, at: 1 },
      { phrase: 1, by: "Mum" },
      { phrase: 1, by: "", at: 1 },
      { note: "x".repeat(61), by: "Mum", at: 1 },
      { note: "line\nbreak", by: "Mum", at: 1 },
      { phrase: 1, by: "Mum", at: "soon" },
      JSON.stringify({ phrase: "1", by: "Mum", at: 1 }),
      "x".repeat(5000),
    ];
    for (const j of junk) expect(parseSeal(j)).toBeNull();
  });

  it("does not pass extra keys through", () => {
    expect(parseSeal({ phrase: 0, by: "Mum", at: 1, evil: "<script>" })).toEqual({ phrase: 0, by: "Mum", at: 1 });
  });
});

describe("sealText", () => {
  it("returns the phrase or the note", () => {
    expect(sealText({ phrase: 1, by: "Mum", at: 1 })).toBe(SEAL_PHRASES[1]);
    expect(sealText({ note: "Lovely", by: "Mum", at: 1 })).toBe("Lovely");
  });
});

describe("buildSeal / sealToStore", () => {
  it("adds who and when, and stores JSON that parses back", () => {
    const seal = buildSeal({ phrase: 3 }, "Mum", 1_700_000_000);
    expect(seal).toEqual({ phrase: 3, by: "Mum", at: 1_700_000_000 });
    expect(parseSeal(sealToStore(seal))).toEqual(seal);
  });
});
