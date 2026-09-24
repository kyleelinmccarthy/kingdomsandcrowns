import { describe, expect, it } from "vitest";
import {
  castleUnlocked,
  CASTLE_LEVEL,
  clockLine,
  closedPhase,
  controlRows,
  emptyPageCopy,
  entryPhase,
  escapeFrom,
  interactVerb,
  keyHints,
  spellbookHref,
  visitClockLine,
} from "./frame";

describe("the gate", () => {
  it("lets a child in against the minutes they have, and remembers why the gate is open", () => {
    expect(entryPhase({ allowed: true, minutesRemaining: 240, source: "earned" }, true)).toEqual({
      kind: "open",
      minutes: 240,
      visit: null,
      source: "earned",
    });
  });

  it("keeps a child out with the flat Realm's own words when the gate is shut", () => {
    const phase = entryPhase({ allowed: false, reason: "no_minutes" }, true);
    expect(phase).toEqual({ kind: "gated", copy: { title: "The Realm opens when you finish a quest.", body: "Every quest you complete banks minutes here." } });
  });

  it("never gates a parent, and spends none of the child's minutes on their visit", () => {
    const phase = entryPhase({ allowed: false, reason: "cap_reached" }, false);
    expect(phase.kind).toBe("open");
    if (phase.kind !== "open") return;
    expect(phase.minutes).toBe(0);
    expect(phase.source).toBeNull();
    expect(phase.visit).toEqual({ minutes: null, closedBecause: "You've played your minutes for today." });
  });

  it("tells a visiting parent how long the child has, when the child could play", () => {
    const phase = entryPhase({ allowed: true, minutesRemaining: 42, source: "open" }, false);
    expect(phase.kind === "open" && phase.visit).toEqual({ minutes: 42, closedBecause: null });
  });

  it("closes with the same closing line the flat Realm shows", () => {
    expect(closedPhase("no_minutes")).toEqual({ kind: "closed", body: "Every quest you complete banks minutes here." });
    expect(closedPhase("school_hours")).toEqual({ kind: "closed", body: "The Realm opens after your last class." });
  });

  it("closes a scheduled recess by saying recess is over, not 'ask when recess is'", () => {
    expect(closedPhase("outside_recess")).toEqual({ kind: "closed", body: "Recess is over. Your gleams are kept." });
  });
});

describe("the castle", () => {
  it("is not there until it is earned", () => {
    expect(castleUnlocked(1, false)).toBe(false);
    expect(castleUnlocked(CASTLE_LEVEL - 1, false)).toBe(false);
  });

  it("is there from the level that unlocks it, or once one has been built", () => {
    expect(castleUnlocked(CASTLE_LEVEL, false)).toBe(true);
    expect(castleUnlocked(3, true)).toBe(true);
  });

  it("is not unlocked by a level that is not a number", () => {
    expect(castleUnlocked(Number.NaN, false)).toBe(false);
  });
});

describe("the clock's words", () => {
  it("says what the flat Realm's corner said", () => {
    expect(clockLine(240)).toBe("240 min left");
  });

  it("says the last minute louder", () => {
    expect(clockLine(1)).toBe("1 min left!");
    expect(clockLine(0)).toBe("0 min left!");
  });

  it("says when it is paused, and when it is recess", () => {
    expect(clockLine(12, { paused: true })).toBe("12 min left · paused");
    expect(clockLine(12, { recess: true })).toBe("Recess · 12 min left");
  });

  it("never shows a fraction or a negative", () => {
    expect(clockLine(3.8)).toBe("3 min left");
    expect(clockLine(-4)).toBe("0 min left!");
  });

  it("tells a visiting parent about the child's clock instead of running one", () => {
    expect(visitClockLine("Emma", { minutes: 40, closedBecause: null })).toBe("Emma has 40 min today");
    expect(visitClockLine("Emma", { minutes: null, closedBecause: "It's school time." })).toBe("Closed for Emma now");
    expect(visitClockLine("Emma", null)).toBe("No clock for grown-ups");
  });
});

describe("Esc", () => {
  it("pauses a child who is playing", () => {
    expect(escapeFrom(null)).toEqual({ kind: "pause" });
  });

  it("resumes from the pause menu", () => {
    expect(escapeFrom({ kind: "pause" })).toBeNull();
  });

  it("goes back to the pause menu from a panel the pause menu opened", () => {
    expect(escapeFrom({ kind: "howto", back: true })).toEqual({ kind: "pause" });
  });

  it("goes straight back to the world from a panel the world opened", () => {
    expect(escapeFrom({ kind: "howto", back: false })).toBeNull();
    expect(escapeFrom({ kind: "page", slot: 2 })).toBeNull();
    expect(escapeFrom({ kind: "interact", target: { kind: "villager", id: "bram", label: "Old Bram" } })).toBeNull();
    // The first-visit card and the crown ceremony are skipped by Esc, never trapped behind it.
    expect(escapeFrom({ kind: "welcome" })).toBeNull();
    expect(escapeFrom({ kind: "ceremony" })).toBeNull();
  });

  it("always reaches the world in two presses at most", () => {
    const starts = [null, { kind: "pause" }, { kind: "howto", back: true }, { kind: "howto", back: false }, { kind: "page", slot: 1 }] as const;
    for (const s of starts) {
      const once = escapeFrom(s);
      const twice = once === null ? null : escapeFrom(once);
      expect([once, twice]).toContain(null);
    }
  });
});

describe("the E prompt", () => {
  it("talks to a person", () => {
    expect(interactVerb({ kind: "villager", id: "bram", label: "Old Bram" })).toBe("Talk to Old Bram");
  });

  it("looks at everything else", () => {
    expect(interactVerb({ kind: "site", id: "chapel", label: "the Chapel" })).toBe("Look at the Chapel");
    expect(interactVerb({ kind: "landmark", id: "summit-1", label: "Cloudfoot" })).toBe("Look at Cloudfoot");
    expect(interactVerb({ kind: "castle", id: "castle", label: "your Castle" })).toBe("Look at your Castle");
  });
});

describe("the controls", () => {
  it("names the fixed scheme: E interacts, drag looks, Esc pauses, and Q is gone", () => {
    const rows = controlRows(4);
    const keys = rows.flatMap((r) => r.keys);
    expect(keys).toEqual(expect.arrayContaining(["W", "A", "S", "D", "Space", "E", "Esc", "Left drag", "Right drag", "Wheel", "1–4"]));
    expect(keys).not.toContain("Q");
    expect(rows.find((r) => r.keys.includes("E"))!.what).toMatch(/talk/i);
  });

  it("counts the cast keys off the bar, and never past 9", () => {
    expect(controlRows(1).some((r) => r.keys.includes("1"))).toBe(true);
    expect(controlRows(12).some((r) => r.keys.includes("1–9"))).toBe(true);
    expect(keyHints(5).map((h) => h.key)).toContain("1–5");
  });

  it("puts E and Esc on the strip, where Q/E used to turn the camera", () => {
    const hints = keyHints(4);
    expect(hints.find((h) => h.key === "E")!.what).toBe("talk");
    expect(hints.find((h) => h.key === "Esc")!.what).toBe("menu");
    expect(hints.map((h) => h.key)).not.toContain("Q");
  });
});

describe("an empty spell page", () => {
  it("tells a child how a spell is earned and where to write one", () => {
    const copy = emptyPageCopy(2, "child", "Emma");
    expect(copy.title).toBe("Page 2 is empty");
    expect(copy.lines.join(" ")).toMatch(/Spellbook/);
    expect(copy.lines.join(" ")).toMatch(/quests/);
    expect(copy.cta).toBe("Open my Spellbook");
  });

  it("tells a visiting parent the same thing about the child", () => {
    const copy = emptyPageCopy(3, "parent", "Noah");
    expect(copy.lines[0]).toMatch(/^Noah writes spells/);
    expect(copy.cta).toBe("Open Noah's Spellbook");
  });

  it("links a parent to the child's own Spellbook", () => {
    expect(spellbookHref("parent", "demo-child-2")).toBe("/spellbook?child=demo-child-2");
    expect(spellbookHref("child", "demo-child-2")).toBe("/spellbook");
  });
});
