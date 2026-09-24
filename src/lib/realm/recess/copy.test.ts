import { describe, expect, it } from "vitest";
import {
  archPrompt,
  boardRows,
  formatLap,
  formatLapSpeech,
  gleamLine,
  jarCaption,
  lapLine,
  lastRunLabel,
  nextMarkLine,
  parentArchLine,
  recessTavernLine,
  ringHelp,
  startLine,
  RECESS_OVER,
  VOIDED,
} from "./copy";
import { emptyRecessRecord, type RecessRecord } from "./record";

const C = "island-ring-1";
const empty = emptyRecessRecord(C);
const rec = (o: Partial<RecessRecord>): RecessRecord => ({ ...empty, ...o });
const DIGIT = /\d/;

describe("starting a run", () => {
  it("says the spec's words for a run at the arch, at each depth and record", () => {
    expect(startLine({ kind: "arch", depth: "simple", record: null, mounted: false })).toEqual({
      title: "The Ring",
      text: "Collect gleams. Follow the lit posts.",
      speech: "The Ring. Collect gleams and follow the lit posts.",
    });
    expect(startLine({ kind: "arch", depth: "full", record: empty, mounted: false })).toEqual({
      title: "The Ring",
      text: "Collect gleams. Follow the lit posts. Eight posts, then back through the arch.",
      speech: "The Ring. Collect gleams and follow the lit posts. Run all the way round and back through the arch.",
    });
    expect(startLine({ kind: "arch", depth: "full", record: rec({ bestLapMs: 38400 }), mounted: false }).text).toBe("Collect gleams. Follow the lit posts. Your best lap is 38.4 s.");
    expect(startLine({ kind: "arch", depth: "full", record: rec({ bestLapMs: 38400 }), mounted: false }).speech).toBe(
      "The Ring. Collect gleams and follow the lit posts. Your best lap is 38.4 seconds.",
    );
    expect(startLine({ kind: "arch", depth: "full", record: rec({ bestLapMs: 38400, bestMountedLapMs: 24100 }), mounted: true }).text).toBe(
      "Collect gleams. Follow the lit posts. Your best ride is 24.1 s.",
    );
  });

  it("opens recess with Recess! and how to start, from wherever the child is", () => {
    expect(startLine({ kind: "recess", depth: "simple", record: rec({ bestLapMs: 38400 }), mounted: false })).toEqual({
      title: "Recess!",
      text: "Collect gleams, then run through the arch and follow the lit posts.",
      speech: "Recess! Collect gleams, then run through the arch and follow the lit posts.",
    });
    expect(startLine({ kind: "recess", depth: "full", record: rec({ bestLapMs: 38400 }), mounted: false }).text).toBe(
      "Collect gleams, then run through the arch and follow the lit posts. Your best lap is 38.4 s.",
    );
  });
});

describe("while running", () => {
  it("counts gleams at full depth only", () => {
    expect(gleamLine(12, "simple")).toEqual({ text: "A gleam!", speech: "You found a gleam." });
    expect(gleamLine(12, "full")).toEqual({ text: "A gleam! 12 so far.", speech: "You found a gleam. 12 so far." });
  });

  it("names the lit mark", () => {
    const posts = [{ name: "the west track" }, { name: "the Ringstones" }];
    expect(nextMarkLine({ started: false, nextPost: 0, posts })).toBe("Run through the arch to start");
    expect(nextMarkLine({ started: true, nextPost: 1, posts })).toBe("Next: the Ringstones");
    expect(nextMarkLine({ started: true, nextPost: 2, posts })).toBe("Home through the arch");
  });
});

describe("finishing a lap: every branch, both depths", () => {
  const foot = rec({ bestLapMs: 38400 });
  const ride = rec({ bestMountedLapMs: 24100 });
  const cases: [string, Parameters<typeof lapLine>, string][] = [
    ["first foot, simple", [{ first: true, best: true, record: rec({ bestLapMs: 44800 }) }, 44800, false, "simple"], "Your first lap! That's the one to beat."],
    ["first foot, full", [{ first: true, best: true, record: rec({ bestLapMs: 44800 }) }, 44800, false, "full"], "Your first lap — 44.8 s. That's the one to beat."],
    ["best foot, simple", [{ first: false, best: true, record: foot }, 38400, false, "simple"], "A new best!"],
    ["best foot, full", [{ first: false, best: true, record: foot }, 38400, false, "full"], "New best lap — 38.4 s!"],
    ["done foot, simple", [{ first: false, best: false, record: foot }, 41200, false, "simple"], "Lap done!"],
    ["done foot, full", [{ first: false, best: false, record: foot }, 41200, false, "full"], "Lap done — 41.2 s. Your best is 38.4 s."],
    ["first ride, simple", [{ first: true, best: true, record: rec({ bestMountedLapMs: 26000 }) }, 26000, true, "simple"], "Your first ride! That's the one to beat."],
    ["first ride, full", [{ first: true, best: true, record: rec({ bestMountedLapMs: 26000 }) }, 26000, true, "full"], "Your first ride — 26.0 s. That's the one to beat."],
    ["best ride, simple", [{ first: false, best: true, record: ride }, 24100, true, "simple"], "A new best ride!"],
    ["best ride, full", [{ first: false, best: true, record: ride }, 24100, true, "full"], "New best ride — 24.1 s!"],
    ["done ride, simple", [{ first: false, best: false, record: ride }, 26000, true, "simple"], "Ride done!"],
    ["done ride, full", [{ first: false, best: false, record: ride }, 26000, true, "full"], "Ride done — 26.0 s. Your best ride is 24.1 s."],
  ];
  it.each(cases)("%s", (_, args, text) => {
    const line = lapLine(...args);
    expect(line.text).toBe(text);
    expect(line.title).toBe("The Ring");
    if (args[3] === "simple") {
      expect(line.text).not.toMatch(DIGIT);
      expect(line.speech).not.toMatch(DIGIT);
    }
  });

  it("reads the time for the ear", () => {
    expect(lapLine({ first: false, best: true, record: ride }, 24100, true, "full").speech).toBe("New best ride. 24.1 seconds.");
    expect(formatLap(40340)).toBe("40.3");
    expect(formatLapSpeech(40340)).toBe("40.3 seconds");
  });
});

describe("the lines that end things", () => {
  it("says them verbatim", () => {
    expect(VOIDED.text).toBe("You took the fast road, so this lap doesn't count. Start again at the arch.");
    expect(RECESS_OVER.text).toBe("Recess is over. Your gleams are kept.");
  });
});

describe("the arch", () => {
  it("offers a child the Ring, and shows a grown-up the child's laps", () => {
    expect(archPrompt({ viewer: "child", heroName: "Emma" })).toEqual({ verb: "Run", label: "the Ring" });
    expect(archPrompt({ viewer: "parent", heroName: "Emma" })).toEqual({ verb: "See", label: "Emma's laps" });
    expect(parentArchLine("Emma")).toBe("Emma runs the Ring here.");
    expect(ringHelp("keyboard")).toBe("At the arch in the village, press E to run the Ring.");
    expect(ringHelp("touch")).toBe("At the arch in the village, tap to run the Ring.");
    expect(ringHelp("keyboard")).not.toMatch(/\bRide\b/);
  });
});

describe("the board", () => {
  const now = new Date(2026, 8, 24, 15);
  const full = rec({ totalGleams: 147, laps: 9, bestLapMs: 38400, bestMountedLapMs: 24100, lastLapAt: new Date(2026, 8, 23, 10) });

  it("reads a null record exactly as an empty one", () => {
    expect(boardRows(null, "full", false, { now })).toEqual(boardRows(empty, "full", false, { now }));
    expect(boardRows(null, "full", false, { now }).map((r) => r.value)).toEqual(["0", "No lap yet", "None yet", "No ride yet", "—"]);
  });

  it("shows five rows at full depth and two under fewer choices", () => {
    expect(boardRows(full, "full", false, { now }).map((r) => [r.label, r.value])).toEqual([
      ["Gleams collected", "147"],
      ["Best lap on foot", "38.4 s"],
      ["Laps run", "9"],
      ["Best lap riding", "24.1 s"],
      ["Last run", "Yesterday"],
    ]);
    expect(boardRows(full, "full", true, { now }).map((r) => r.label)).toEqual(["Gleams collected", "Best lap on foot"]);
    expect(boardRows(rec({ bestMountedLapMs: 20000 }), "full", true, { now, mounted: true }).map((r) => r.label)).toEqual(["Gleams collected", "Best lap riding"]);
  });

  it("draws instead of counting at simple depth: a jar, ribbons and pips, no digits but the date", () => {
    const rows = boardRows(rec({ ...full, laps: 14 }), "simple", false, { now: new Date(2026, 9, 30) });
    expect(rows[0]).toMatchObject({ value: null, jar: 0.147 });
    expect(rows[1]).toMatchObject({ value: null, ribbon: true });
    expect(rows[2]).toMatchObject({ value: null, pips: 10, more: true });
    expect(rows[3]).toMatchObject({ value: null, ribbon: true });
    for (const r of rows.slice(0, 4)) if (r.value) expect(r.value).not.toMatch(DIGIT);
  });

  it("names the last run like a calendar", () => {
    expect(lastRunLabel(null, now)).toBe("—");
    expect(lastRunLabel(new Date(2026, 8, 24, 9), now)).toBe("Today");
    expect(lastRunLabel(new Date(2026, 8, 23, 23), now)).toBe("Yesterday");
    expect(lastRunLabel(new Date(2026, 2, 3), now)).toBe("3 March");
  });

  it("captions the jar, and gives a family line only to a hero with a lap", () => {
    expect(jarCaption(10)).toBe("Gleam jar");
    expect(jarCaption(1000)).toBe("The jar is full.");
    expect(recessTavernLine("Emma", empty)).toBeNull();
    expect(recessTavernLine("Emma", rec({ bestLapMs: 38400 }))).toBe("Emma ran the Ring in 38.4 s.");
    expect(recessTavernLine("Emma", rec({ bestMountedLapMs: 24100 }))).toBe("Emma ran the Ring riding in 24.1 s.");
  });
});
