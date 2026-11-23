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
  QUIET_WALK,
  spellbookHref,
  visitClockLine,
} from "./frame";
import { bind, defaultKeymap, WALK_ACTIONS, type ActionId, type Keymap } from "./keymap";

const K = defaultKeymap();
function rebound(action: ActionId, code: string, k: Keymap = defaultKeymap()): Keymap {
  const r = bind(k, action, 0, code);
  if (!r.ok) throw new Error("not bindable");
  return r.keymap;
}

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
    expect(phase).toEqual({ kind: "gated", copy: { title: "The Realm is resting for now.", body: "Side quests earn play time, and you get free minutes every day." } });
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

  it("stops a child at 0 minutes at the quiet gate, not inside a clock that is already out", () => {
    expect(entryPhase({ allowed: true, minutesRemaining: 0, source: "quiet" }, true)).toEqual({ kind: "quiet-gate" });
  });

  it("never puts a parent in the quiet world: a grown-up has no clock and walks in", () => {
    expect(entryPhase({ allowed: true, minutesRemaining: 0, source: "quiet" }, false)).toEqual({
      kind: "open",
      minutes: 0,
      visit: { minutes: 0, closedBecause: null },
      source: null,
    });
  });

  it("walks a child into the quiet world from the gate with nothing to spend", () => {
    expect(QUIET_WALK).toEqual({ kind: "open", minutes: 0, visit: null, source: "quiet" });
  });

  it("closes with the same closing line the flat Realm shows", () => {
    expect(closedPhase("no_minutes")).toEqual({ kind: "closed", body: "Side quests earn play time, and you get free minutes every day." });
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
    expect(escapeFrom({ kind: "wardrobe" })).toEqual({ kind: "pause" });
  });

  it("goes straight back to the world from a panel the world opened", () => {
    expect(escapeFrom({ kind: "howto", back: false })).toBeNull();
    expect(escapeFrom({ kind: "page", slot: 2 })).toBeNull();
    expect(escapeFrom({ kind: "interact", target: { kind: "villager", id: "bram", label: "Old Bram" } })).toBeNull();
    // The first-visit card and the crown ceremony are skipped by Esc, never trapped behind it.
    expect(escapeFrom({ kind: "welcome" })).toBeNull();
    expect(escapeFrom({ kind: "ceremony" })).toBeNull();
  });

  it("closes the big map straight back to the world", () => {
    expect(escapeFrom({ kind: "map" })).toBeNull();
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
  it("names the scheme the scene binds: a click catches the mouse, a left drag swings round, P and Esc pause, and Q is gone", () => {
    const rows = controlRows(K, 4);
    const keys = rows.flatMap((r) => r.keys);
    expect(keys).toEqual(expect.arrayContaining(["W", "A", "S", "D", "Space", "E", "Click", "Left drag", "Right drag", "Wheel", "P", "Esc", "1–4"]));
    expect(keys).not.toContain("Q");
    expect(rows.find((r) => r.keys.includes("Click"))!.what).toBe("Look around with the mouse. Esc lets the mouse go.");
    expect(rows.find((r) => r.keys.includes("Left drag"))!.what).toBe("Swing the camera round to see your hero's face.");
    expect(rows.find((r) => r.keys.includes("E"))!.what).toMatch(/talk/i);
  });

  it("lists the rows in one order: walk, jump, the mouse, E, the spells, the map, the mount, the pet, then pause", () => {
    const rows = controlRows(K, 4, { mount: true, pet: "Fox" });
    expect(rows.map((r) => r.keys.join(" "))).toEqual(["W A S D", "Space", "Click", "Left drag", "Right drag", "Wheel", "E", "1–4", "M", "Z", "F", "P Esc"]);
    expect(rows[0].what).toBe("Walk. A and D step sideways, S backs up.");
  });

  it("never says \"— again to stop\" or \"— at a hitching post\" for a key taken away", () => {
    const k = { ...defaultKeymap(), interact: [], follow: [] };
    const rows = controlRows(k, 4, { mount: true, pet: "Fox" });
    const what = rows.map((r) => r.what).join(" ");
    expect(what).not.toContain("—");
    expect(what).toContain("Get on or off your mount. On it, a hitching post rides you anywhere you've been.");
    expect(what).toContain("Ask your Fox to show you the way: to whoever is waiting, or somewhere you haven't found yet.");
  });

  it("says which actions each keyboard row covers, and none for the mouse", () => {
    const rows = controlRows(K, 4, { mount: true, pet: "Fox" });
    const by = (key: string) => rows.find((r) => r.keys.includes(key))!;
    expect(by("W").actions).toEqual([...WALK_ACTIONS]);
    expect(by("Space").actions).toEqual(["jump"]);
    expect(by("E").actions).toEqual(["interact"]);
    expect(by("1–4").actions).toEqual(["cast1", "cast2", "cast3", "cast4"]);
    // Changing keys, the cast row opens out to all nine, so a key swapped onto a spell past the
    // bar is still on the list to see and take back.
    expect(by("1–4").editActions).toEqual(["cast1", "cast2", "cast3", "cast4", "cast5", "cast6", "cast7", "cast8", "cast9"]);
    expect(by("W").editActions).toBeUndefined();
    expect(by("M").actions).toEqual(["map"]);
    expect(by("Z").actions).toEqual(["mount"]);
    expect(by("F").actions).toEqual(["follow"]);
    expect(by("P").actions).toEqual(["pause"]);
    for (const mouse of ["Click", "Left drag", "Right drag", "Wheel"]) expect(by(mouse).actions).toBeUndefined();
  });

  it("names the key the child bound, not the one the game shipped with", () => {
    const rows = controlRows(rebound("jump", "KeyJ"), 4);
    expect(rows.find((r) => r.actions?.includes("jump"))!.keys).toEqual(["J"]);
    const walk = rebound("strafeRight", "KeyL", rebound("strafeLeft", "KeyJ", rebound("walkBack", "KeyK", rebound("walkForward", "KeyI"))));
    const row = controlRows(walk, 4)[0];
    expect(row.keys).toEqual(["I", "J", "K", "L"]);
    expect(row.what).toBe("Walk. J and L step sideways, K backs up.");
    const pet = controlRows(rebound("follow", "KeyG"), 4, { pet: "Fox" }).find((r) => r.actions?.includes("follow"))!;
    expect(pet.keys).toEqual(["G"]);
    expect(pet.what).toMatch(/G again to stop\.$/);
    const saddle = controlRows(rebound("interact", "KeyR"), 4, { mount: true }).find((r) => r.actions?.includes("mount"))!;
    expect(saddle.what).toMatch(/On it, R at a hitching post/);
    expect(controlRows(rebound("pause", "KeyO"), 4).at(-1)!.keys).toEqual(["O", "Esc"]);
  });

  it("shows a visitor the map, the mount and the pet, saying what each does for the hero", () => {
    const rows = controlRows(K, 4);
    const by = (a: ActionId) => rows.find((r) => r.actions?.includes(a));
    expect(by("map")).toMatchObject({ keys: ["M"], what: "Open the map of the island." });
    expect(by("mount")).toMatchObject({ keys: ["Z"], what: "Your hero gets on or off their mount." });
    expect(by("follow")).toMatchObject({ keys: ["F"], what: "Your hero's companion shows the way." });
  });

  it("counts the cast keys off the bar, and never past 9", () => {
    expect(controlRows(K, 1).some((r) => r.keys.includes("1"))).toBe(true);
    expect(controlRows(K, 12).some((r) => r.keys.includes("1–9"))).toBe(true);
    expect(keyHints(K, 5).map((h) => h.key)).toContain("1–5");
  });

  it("lists each cast key when they are not a run of digits", () => {
    const k = rebound("cast2", "KeyQ");
    expect(controlRows(k, 3).find((r) => r.actions?.includes("cast1"))!.keys).toEqual(["1", "Q", "3"]);
    expect(keyHints(k, 3).find((h) => h.what === "cast")!.key).toBe("1 Q 3");
    // Digits still, but out of order: listed, not a range.
    const swapped = rebound("cast1", "Digit2");
    expect(controlRows(swapped, 2).find((r) => r.actions?.includes("cast1"))!.keys).toEqual(["2", "1"]);
  });

  it("puts the look, E, the map and P on the strip", () => {
    const hints = keyHints(K, 4);
    expect(hints.find((h) => h.key === "WASD")!.what).toBe("walk");
    expect(hints.find((h) => h.key === "Click")!.what).toBe("look");
    expect(hints.find((h) => h.key === "E")!.what).toBe("talk");
    expect(hints.find((h) => h.key === "P")!.what).toBe("pause");
    expect(hints.map((h) => h.key)).not.toContain("Q");
  });

  it("always shows the map on the strip, the mount only with one to ride, the pet only with one to follow", () => {
    const hints = keyHints(defaultKeymap(), 3, {});
    expect(hints).toContainEqual({ key: "M", what: "map" });
    expect(hints.map((h) => h.key)).not.toContain("Z");
    expect(hints.map((h) => h.key)).not.toContain("F");
    const both = keyHints(K, 3, { mount: true, pet: true });
    expect(both).toContainEqual({ key: "Z", what: "ride" });
    expect(both).toContainEqual({ key: "F", what: "follow" });
    expect(both.at(-1)).toEqual({ key: "P", what: "pause" });
  });

  it("names the bound keys on the strip", () => {
    const hints = keyHints(rebound("map", "KeyN", rebound("jump", "KeyJ")), 3, {});
    expect(hints).toContainEqual({ key: "J", what: "jump" });
    expect(hints).toContainEqual({ key: "N", what: "map" });
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
