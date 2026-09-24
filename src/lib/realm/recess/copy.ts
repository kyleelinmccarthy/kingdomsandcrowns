/**
 * Every word recess says, to a child and to a grown-up, and the rules that choose between them.
 *
 * The spec's (§3.3) strings, moved from the flat village to the island: the arch is "the arch in
 * the village", not "on the Market Plaza", because the island has no Market Plaza. "Recess" stays
 * the grown-up's word for the scheduled break (and the clock's "Recess · 12 min left"); the thing a
 * child runs is **the Ring** (D12.14), so the two meanings never collide.
 *
 * Depth is never a word on screen (§6.1). At simple depth nothing here carries a digit: the jar is
 * the gleam count, the pips are the laps, the ribbon is the best — substitutions, never removals.
 * `copy.test.ts` asserts the strings verbatim and that no simple string has a numeral in it.
 */

import type { MergeOutcome, RecessRecord } from "./record";

export type RecessDepth = "simple" | "full";
/** What is shown, and what read-aloud says (written for the ear, no em dashes, "seconds" not "s"). */
export type RecessLine = { text: string; speech: string };
export type RecessBoardLine = { title: string; text: string; speech: string };

export const RING = "The Ring";

/** "40.3". */
export function formatLap(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1);
}
/** "40.3 seconds". */
export function formatLapSpeech(ms: number): string {
  return `${formatLap(ms)} seconds`;
}

/* ------------------------------------------------------------------ starting */

/**
 * The board as a run begins. Recess (the grown-up's scheduled break) opens with "Recess!" and says
 * how to start, because the child may be anywhere; a run asked for at the arch is already there.
 */
export function startLine(o: { kind: "recess" | "arch"; depth: RecessDepth; record: RecessRecord | null; mounted: boolean }): RecessBoardLine {
  const best = o.mounted ? o.record?.bestMountedLapMs ?? null : o.record?.bestLapMs ?? null;
  const bestText = o.depth === "full" && best !== null ? ` ${o.mounted ? "Your best ride is" : "Your best lap is"} ${formatLap(best)} s.` : "";
  const bestSpeech = o.depth === "full" && best !== null ? ` ${o.mounted ? "Your best ride is" : "Your best lap is"} ${formatLapSpeech(best)}.` : "";
  if (o.kind === "recess") {
    const how = "Collect gleams, then run through the arch and follow the lit posts.";
    return { title: "Recess!", text: `${how}${bestText}`, speech: `Recess! ${how}${bestSpeech}` };
  }
  const how = "Collect gleams. Follow the lit posts.";
  if (o.depth === "simple") return { title: RING, text: how, speech: `The Ring. Collect gleams and follow the lit posts.${bestSpeech}` };
  if (best === null)
    return {
      title: RING,
      text: `${how} Eight posts, then back through the arch.`,
      speech: "The Ring. Collect gleams and follow the lit posts. Run all the way round and back through the arch.",
    };
  return { title: RING, text: `${how}${bestText}`, speech: `The Ring. Collect gleams and follow the lit posts.${bestSpeech}` };
}

/* ------------------------------------------------------------------ running */

export function gleamLine(count: number, depth: RecessDepth): RecessLine {
  if (depth === "simple") return { text: "A gleam!", speech: "You found a gleam." };
  return { text: `A gleam! ${count} so far.`, speech: `You found a gleam. ${count} so far.` };
}

export const OFF_COURSE: RecessLine = { text: "Follow the lit posts.", speech: "Follow the lit posts. The next one is glowing." };

/** Where the lit mark is, for the run strip. */
export function nextMarkLine(o: { started: boolean; nextPost: number; posts: readonly { name: string }[] }): string {
  if (!o.started) return "Run through the arch to start";
  if (o.nextPost >= o.posts.length) return "Home through the arch";
  return `Next: ${o.posts[o.nextPost].name}`;
}

/* ------------------------------------------------------------------ finishing */

/** The board as a lap closes: the server's answer to whether it was a best, in the child's words. */
export function lapLine(outcome: Pick<MergeOutcome, "best" | "first" | "record">, lapMs: number, mounted: boolean, depth: RecessDepth): RecessBoardLine {
  const t = formatLap(lapMs);
  const say = formatLapSpeech(lapMs);
  const held = mounted ? outcome.record.bestMountedLapMs : outcome.record.bestLapMs;
  const noun = mounted ? "ride" : "lap";
  const Noun = mounted ? "Ride" : "Lap";
  if (outcome.first) {
    return depth === "simple"
      ? { title: RING, text: `Your first ${noun}! That's the one to beat.`, speech: `Your first ${noun}! That's the one to beat.` }
      : { title: RING, text: `Your first ${noun} — ${t} s. That's the one to beat.`, speech: `Your first ${noun}. ${say}. That's the one to beat.` };
  }
  if (outcome.best) {
    return depth === "simple"
      ? { title: RING, text: mounted ? "A new best ride!" : "A new best!", speech: mounted ? "A new best ride!" : "A new best!" }
      : { title: RING, text: `New best ${noun} — ${t} s!`, speech: `New best ${noun}. ${say}.` };
  }
  if (depth === "simple") return { title: RING, text: `${Noun} done!`, speech: `${Noun} done!` };
  const bestText = held !== null ? ` Your best${mounted ? " ride" : ""} is ${formatLap(held)} s.` : "";
  const bestSpeech = held !== null ? ` Your best${mounted ? " ride" : ""} is ${formatLapSpeech(held)}.` : "";
  return { title: RING, text: `${Noun} done — ${t} s.${bestText}`, speech: `${Noun} done. ${say}.${bestSpeech}` };
}

/* ------------------------------------------------------------------ a lap that does not count */

export const VOIDED: RecessLine = {
  text: "You took the fast road, so this lap doesn't count. Start again at the arch.",
  speech: "You took the fast road, so this lap doesn't count. Start again at the arch.",
};
export const RECESS_OVER: RecessLine = { text: "Recess is over. Your gleams are kept.", speech: "Recess is over. Your gleams are kept." };
export const COURSE_CHANGED: RecessLine = {
  text: "The road through the village changed, so the course is new. Your gleams are safe — the lap times start again.",
  speech: "The road through the village changed, so the course is new. Your gleams are safe. The lap times start again.",
};
/** The last-minute banner during recess: it is recess that is ending, not necessarily the Realm. */
export const RECESS_LAST_MINUTE = "One minute left of recess.";
export const WRITE_FAILED = "Your lap couldn't be written down.";
export const WRITE_FAILED_AGAIN = "Your lap couldn't be written down. It will keep trying.";

/* ------------------------------------------------------------------ the arch */

/** The E prompt's verb and label at the arch, for whoever is standing there. */
export function archPrompt(o: { viewer: "child" | "parent"; heroName: string }): { verb: string; label: string } {
  return o.viewer === "parent" ? { verb: "See", label: `${o.heroName}'s laps` } : { verb: "Run", label: "the Ring" };
}

/** Under the Ring board's title, for a visiting grown-up: whose record it is and where they run it. */
export function parentArchLine(heroName: string): string {
  return `${heroName} runs the Ring here.`;
}

/** The how-to-play line (§3.3's help correction, moved to the island). There is no control called Ride. */
export function ringHelp(input: "keyboard" | "touch"): string {
  return input === "touch" ? "At the arch in the village, tap to run the Ring." : "At the arch in the village, press E to run the Ring.";
}

/* ------------------------------------------------------------------ the board */

export type BoardRow = {
  label: string;
  /** The words, or null where simple depth draws it instead (the jar, a ribbon, pips). */
  value: string | null;
  /** Simple depth: a gold ribbon for a best that exists. */
  ribbon?: boolean;
  /** Simple depth: this many pips, and a "+" past ten. */
  pips?: number;
  more?: boolean;
  /** The jar, 0..1 full: drawn at both depths (full depth also has the number). */
  jar?: number;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Today", "Yesterday", "3 March" — a child's calendar, not a timestamp. */
export function lastRunLabel(at: Date | null, now: Date): string {
  if (!at) return "—";
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(at)) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${at.getDate()} ${MONTHS[at.getMonth()]}`;
}

/**
 * The board's rows, in order: gleams, best on foot, laps, best riding, last run. `fewerChoices`
 * keeps two — the gleams, and the best on foot (or the ride, for a rider with no foot time yet).
 * A null record (not loaded, or failed) reads exactly as an empty one: never a claimed zero.
 */
export function boardRows(record: RecessRecord | null, depth: RecessDepth, fewerChoices: boolean, o: { mounted?: boolean; now?: Date } = {}): BoardRow[] {
  const r = record;
  const gleams = r?.totalGleams ?? 0;
  const foot = r?.bestLapMs ?? null;
  const ride = r?.bestMountedLapMs ?? null;
  const laps = r?.laps ?? 0;
  const simple = depth === "simple";
  const jar = Math.max(0, Math.min(1, gleams / 1000));
  const gleamRow: BoardRow = { label: "Gleams collected", value: simple ? null : String(gleams), jar };
  const best = (label: string, ms: number | null, none: string): BoardRow =>
    ms === null ? { label, value: none } : simple ? { label, value: null, ribbon: true } : { label, value: `${formatLap(ms)} s` };
  const footRow = best("Best lap on foot", foot, "No lap yet");
  const rideRow = best("Best lap riding", ride, "No ride yet");
  const lapRow: BoardRow = laps === 0 ? { label: "Laps run", value: "None yet" } : simple ? { label: "Laps run", value: null, pips: Math.min(10, laps), more: laps > 10 } : { label: "Laps run", value: String(laps) };
  const lastRow: BoardRow = { label: "Last run", value: lastRunLabel(r?.lastLapAt ?? null, o.now ?? new Date()) };
  if (fewerChoices) return [gleamRow, o.mounted && foot === null && ride !== null ? rideRow : footRow];
  return [gleamRow, footRow, lapRow, rideRow, lastRow];
}

/**
 * The lamp line under the board's rows (§3.3), full depth only: at simple depth the lamps light
 * in the world and the board draws them, with no number.
 */
export function lampLine(lit: number, total: number): string {
  if (lit >= total) return "Every lamp on the road is lit.";
  return `${lit} of ${total} lamps lit along the road.`;
}

/** Said the moment a gleam lights the next lamp on the road. No digit: it reads at both depths. */
export const LAMP_LIT: RecessLine = {
  text: "A gleam! A lamp on the road just lit up.",
  speech: "You found a gleam, and a lamp on the road just lit up.",
};
export const LAST_LAMP_LIT: RecessLine = {
  text: "A gleam! Every lamp on the road is lit.",
  speech: "You found a gleam, and now every lamp on the road is lit.",
};

/** The jar's caption. */
export function jarCaption(totalGleams: number): string {
  return totalGleams >= 1000 ? "The jar is full." : "Gleam jar";
}

/**
 * One sentence per hero for a family board, or null for a hero with no lap (the spec's Tavern
 * line). Used for the grown-up's view of the arch.
 */
export function recessTavernLine(name: string, record: RecessRecord | null): string | null {
  if (!record) return null;
  if (record.bestLapMs !== null) return `${name} ran the Ring in ${formatLap(record.bestLapMs)} s.`;
  if (record.bestMountedLapMs !== null) return `${name} ran the Ring riding in ${formatLap(record.bestMountedLapMs)} s.`;
  return null;
}
