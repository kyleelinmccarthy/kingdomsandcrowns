/**
 * THE FRAME AROUND THE 3D WORLD, as pure rules.
 *
 * Everything drawn over the canvas that is not per-frame — the gate, the clock's words, the
 * pause menu's stack, the interact prompt, the empty-page card, the controls list — decides
 * what it says here and nowhere else, so each rule is one function with a test beside it and
 * the components only render what these return.
 *
 * The rules that already existed for the flat Realm are CALLED, never copied: `gateCopy`
 * words the gate, `objectiveState` picks the objectives, the play clock's own hook counts the
 * minutes. What lives here is only what the 3D frame adds on top of them.
 */

import { gateCopy, type GateCopy } from "@/lib/realm/play-clock";
import type { AccessDenied, AccessResult } from "@/lib/utils/realm-access";
import type { InteractTarget } from "./hud-bus";

export type Viewer = "child" | "parent";
export type AccessSource = "off_hours" | "recess" | "earned" | "open";

/* ------------------------------------------------------------------ the gate */

export type EntryPhase =
  | { kind: "checking" }
  | { kind: "gated"; copy: GateCopy }
  | {
      kind: "open";
      /** The minutes the play clock starts from. Always 0 for a parent: a parent spends nothing. */
      minutes: number;
      /** For a parent only: the child's own gate, as information. "Emma has 40 minutes today." */
      visit: { minutes: number | null; closedBecause: string | null } | null;
      source: AccessSource | null;
    }
  | { kind: "closed"; body: string }
  | { kind: "unsupported" };

/**
 * What the Realm does with an access answer, exactly as `realm-shell.tsx` decides it: a child
 * whose gate is shut sees the gate; a child whose gate is open plays against the clock; a
 * parent always walks in and never spends a minute, and the child's gate becomes a line of
 * information instead of a wall. That last rule is the parent preview the owner asked for — "a
 * way to test the realm without having to complete quests as Emma or Noah" — and it is why a
 * parent is never gated here.
 */
export function entryPhase(result: AccessResult, isChildView: boolean): EntryPhase {
  const copy = gateCopy(result);
  if (!isChildView) {
    return {
      kind: "open",
      minutes: 0,
      visit: { minutes: result.allowed ? result.minutesRemaining : null, closedBecause: copy ? copy.title : null },
      source: null,
    };
  }
  if (copy) return { kind: "gated", copy };
  // `copy` is null exactly when access is allowed, but the type does not know that.
  if (!result.allowed) return { kind: "gated", copy: { title: "The Realm is out of reach right now.", body: "Try again in a moment." } };
  return { kind: "open", minutes: result.minutesRemaining, visit: null, source: result.source };
}

/** The closing card when a scheduled recess ends (`recess/copy.ts`'s RECESS_OVER, the words a run ends with too). */
export const RECESS_CLOSED = "Recess is over. Your gleams are kept.";

/** The clock ran out, or the gate shut mid-visit: the same words the flat Realm's closing card uses. */
export function closedPhase(reason: AccessDenied): EntryPhase {
  // Shut mid-visit because the recess block ended: recess is over — not "ask when recess is",
  // which is the gate's line for a child arriving outside it.
  if (reason === "outside_recess") return { kind: "closed", body: RECESS_CLOSED };
  return { kind: "closed", body: gateCopy({ allowed: false, reason })!.body };
}

/* ------------------------------------------------------------------ the castle */

/** The level `initializeCastle` refuses below, and the level the Castle page names. */
export const CASTLE_LEVEL = 50;

/**
 * Whether the child's own castle stands in their Realm. The rule the Castle page already uses:
 * a castle row exists (it was built), or the child has reached the level that lets them build
 * one. "Student castle shouldn't exist if they haven't unlocked that feature yet."
 */
export function castleUnlocked(level: number, hasCastle: boolean): boolean {
  return hasCastle || (Number.isFinite(level) && level >= CASTLE_LEVEL);
}

/* ------------------------------------------------------------------ the clock */

/**
 * The clock's words. "240 min left" is what the flat Realm's corner said and what the owner's
 * screenshot shows, so it stays word for word; the last minute says so louder, and a paused
 * clock says it is paused, because a child who opens the menu should see that it is not
 * eating their time.
 */
export function clockLine(minutes: number, opts: { paused?: boolean; recess?: boolean } = {}): string {
  const m = Math.max(0, Math.floor(minutes));
  const base = m <= 1 ? `${m} min left!` : `${m} min left`;
  const lead = opts.recess ? `Recess · ${base}` : base;
  return opts.paused ? `${lead} · paused` : lead;
}

/**
 * A parent's clock is not a clock: they spend nothing. It says what the CHILD has instead,
 * which is the one thing a grown-up testing the Realm wants to know about the clock.
 */
export function visitClockLine(heroName: string, visit: { minutes: number | null; closedBecause: string | null } | null): string {
  if (!visit) return "No clock for grown-ups";
  if (visit.closedBecause) return `Closed for ${heroName} now`;
  if (visit.minutes === null) return "No clock for grown-ups";
  return `${heroName} has ${Math.max(0, Math.floor(visit.minutes))} min today`;
}

/* ------------------------------------------------------------------ the overlays */

/**
 * Everything that can sit over the world and take the child's attention. Exactly one at a
 * time; null is "playing". The scene is paused whenever this is non-null — the frame writes
 * `bus.setPaused(overlay !== null)` and nothing else decides it.
 */
export type Overlay =
  | { kind: "pause" }
  /** How to play. `back` is true when it was opened from the pause menu, so Esc returns there. */
  | { kind: "howto"; back: boolean }
  | { kind: "interact"; target: InteractTarget }
  /** An empty spell page, clicked. */
  | { kind: "page"; slot: number }
  /** A child's first visit: what the Realm is for, how much to show, and the way into the tutorial. */
  | { kind: "welcome" }
  /** A crown waiting for its ceremony. */
  | { kind: "ceremony" }
  /** A hitching post's fast-travel sheet, from the post (a destination id) the child stands at. */
  | { kind: "travel"; from: string }
  /** The Ring's board at the arch: the child's record and a way to run it (a grown-up only looks). */
  | { kind: "ring" };

/**
 * Esc. With nothing open it opens the pause menu; with a panel open it closes it — back to the
 * pause menu if that is where the panel came from, straight back to the world otherwise. So
 * Esc never strands a child two menus deep, and two presses always reach the world.
 */
export function escapeFrom(overlay: Overlay | null): Overlay | null {
  if (overlay === null) return { kind: "pause" };
  if (overlay.kind === "howto" && overlay.back) return { kind: "pause" };
  return null;
}

/* ------------------------------------------------------------------ interact */

/**
 * What the E prompt says. A person is talked to; everything else is looked at. The label is
 * the scene's, already phrased for a sentence ("Old Bram", "the Chapel", "Cloudfoot").
 */
export function interactVerb(target: InteractTarget): string {
  if (target.verb) return `${target.verb} ${target.label}`;
  return target.kind === "villager" ? `Talk to ${target.label}` : `Look at ${target.label}`;
}

/* ------------------------------------------------------------------ controls */

export type ControlRow = { keys: string[]; what: string };

/**
 * THE control scheme, in one list. The pause menu's Controls panel, the how-to-play card and
 * the hint strip under the spell bar all read it, so no surface can describe a key the scene
 * does not bind. Fixed with the scene: WASD relative to the camera, A and D strafe, left-drag
 * orbits, right-drag orbits and turns the hero, the wheel zooms, Space jumps, E interacts,
 * 1–N casts, Esc pauses. Q and E no longer swing the camera.
 */
export function controlRows(slots: number, opts: { mount?: boolean } = {}): ControlRow[] {
  const n = Math.max(1, Math.min(9, Math.floor(slots)));
  const rows: ControlRow[] = [
    { keys: ["W", "A", "S", "D"], what: "Walk. A and D step sideways." },
    { keys: ["Space"], what: "Jump." },
    { keys: ["Left drag"], what: "Look around." },
    { keys: ["Right drag"], what: "Look around and turn to face that way." },
    { keys: ["Wheel"], what: "Zoom in and out." },
    { keys: ["E"], what: "Talk to someone, or look at something, when you are close." },
    { keys: [n > 1 ? `1–${n}` : "1"], what: "Cast a spell. You can click a spell too." },
    { keys: ["Esc"], what: "Pause, with Controls and Leave." },
  ];
  // Riding (`riding.ts`): for a child, always — with or without a mount, M says how it works.
  if (opts.mount !== undefined) {
    rows.splice(rows.length - 1, 0, {
      keys: ["M"],
      what: opts.mount ? "Get on or off your mount. On it, E at a hitching post rides you anywhere you've been." : "Ride your mount, once you've picked one in the Tavern.",
    });
  }
  return rows;
}

/** The strip under the spell bar: the five verbs a child needs first, in the fewest words. */
export function keyHints(slots: number, opts: { mount?: boolean } = {}): { key: string; what: string }[] {
  const n = Math.max(1, Math.min(9, Math.floor(slots)));
  const hints = [
    { key: "WASD", what: "walk" },
    { key: "Drag", what: "look" },
    { key: "Space", what: "jump" },
    { key: "E", what: "talk" },
    { key: n > 1 ? `1–${n}` : "1", what: "cast" },
    { key: "Esc", what: "menu" },
  ];
  // Only for a child who has a mount to ride: the strip stays five verbs for everyone else.
  if (opts.mount) hints.splice(hints.length - 1, 0, { key: "M", what: "ride" });
  return hints;
}

/* ------------------------------------------------------------------ empty pages */

/**
 * An empty page, clicked. It must say how a spell is EARNED and where to go to write one, in
 * words an eight-year-old can follow — "the other spells having a plus icon on them but not
 * being clickable feels wrong" and "it's not clear how to learn new spells".
 *
 * The truth of it: a spell is written in the Spellbook, by putting together an element and a
 * shape the child has unlocked, and quests, side quests and levels unlock more of both. More
 * pages open every ten levels.
 */
export function emptyPageCopy(slot: number, viewer: Viewer, heroName: string): { title: string; lines: string[]; cta: string } {
  if (viewer === "parent") {
    return {
      title: `Page ${slot} is empty`,
      lines: [
        `${heroName} writes spells in their Spellbook by joining an element and a shape they have unlocked.`,
        "Quests, side quests and levels unlock new ones. A new page opens every ten levels.",
      ],
      cta: `Open ${heroName}'s Spellbook`,
    };
  }
  return {
    title: `Page ${slot} is empty`,
    lines: [
      "Write a spell here in your Spellbook. Pick an element, like Ember, and a shape, like Bolt.",
      "Finish quests and side quests to unlock new elements and shapes.",
    ],
    cta: "Open my Spellbook",
  };
}

/** The Spellbook for this child. A parent's link keeps the child they were visiting. */
export function spellbookHref(viewer: Viewer, childId: string | null): string {
  return viewer === "parent" && childId ? `/spellbook?child=${encodeURIComponent(childId)}` : "/spellbook";
}
