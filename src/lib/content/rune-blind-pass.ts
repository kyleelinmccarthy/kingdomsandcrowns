/**
 * The blind answer pass for rune pools. The same idea as `blind-pass.ts` (read that first for why it
 * exists): `validateRunePool` can see that a word can be built from its tiles and that nothing shows
 * it, but not whether a reader given the prompt and the tiles builds THAT word, and no other word that
 * fits. A second reader who has never seen the key builds every entry, and every disagreement is
 * looked at by a person and settled in writing.
 *
 * What differs from the other passes, because a rune is built rather than chosen:
 *
 *   - A sheet is a flat list of the pool's entries, shuffled. Each line shows what the child is given:
 *     the object's picture (by effect), the line shown, the line heard (a dictation's `readAloud`, or a
 *     meaning's when it has one), and the tiles sorted A-Z. It never shows an entry id, the hint, `why`
 *     or the words, except where the child hears the word too: a dictation's `Heard:` part.
 *   - The reviewer writes the word they would build after `Answer:`; `both` and every word that fits
 *     and can be built, when more than one does (an ambiguity, as much a defect as a wrong key); or `?`
 *     when no word fits.
 *   - At k1 and g23 the word is dictated (R-I18), so the reader is told it. Their pass checks only
 *     that the heard word can be built from the tiles and that the shown line fits the picture; it
 *     cannot test ambiguity (RI-a / B4).
 *   - Entries are pinned by `#code` (`runeCode`: a hash of what is shown, never the words), so an
 *     answer is trusted only for the entry it was given for.
 *   - Resolutions use the drill pass's file and verdicts (`<poolId>.resolved.json`); `itemId` is the
 *     entry id and `keyAt` is the accepted words joined with commas.
 *
 * Files: `src/content/runes/<poolId>.json` (the pool), `src/content/review/<poolId>.blind.md` (the
 * sheet) and `src/content/review/<poolId>.resolved.json`. A rune pool id starts with `rune-`, so none
 * of these collide with another pool's files in `review/` (`NON_DRILL_SHEET_PREFIXES`).
 *
 * Dev-time tooling: a script and a test import this, the app never does.
 */
import fs from "node:fs";
import path from "node:path";
import type { RuneEffect } from "../realm/rune-objects";
import { runeTiling } from "../tasks/rune-tiles";
import { seededRng, shuffle } from "../utils/drill-generators";
import { REVIEW_DIR, loadResolutions, resolutionsPath, sheetPath, type Resolution } from "./blind-pass";
import { hash32 } from "./hash32";
import { LISTEN_BANDS, RUNE_POOL_PREFIX, fallbackTiles, formatRuneProblems, runeCode, validateRunePool, type RuneEntry, type RunePool } from "./rune-pools";
import { answerSlots, carryForwardByCode, closingLines, findResolution, flagLines, readAnswer, unresolvedOf } from "./sheet-kit";
import type { ContentBand } from "../utils/content-bands";

export { resolutionsPath };
export type { Resolution, ResolutionVerdict } from "./blind-pass";

// ---------------------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------------------

/** What the picture beside the stone shows, by effect: the object as the child finds it. */
export const RUNE_PICTURES: Readonly<Record<RuneEffect, string>> = {
  mend: "something broken",
  light: "something dark",
  water: "something dry",
  open: "something stuck",
  grow: "something wilted",
};

export type RuneSheetEntry = { code: string; effect: RuneEffect; prompt: string; heard?: string; tiles: string[] };
export type RuneSheet = { poolId: string; band: ContentBand; entries: RuneSheetEntry[] };

/**
 * Every entry of the pool as a key-free list. The order is a function of what is shown and the pool
 * id alone: sorted first, then shuffled with a seed, so it is stable between cuts, does not follow the
 * pool's order, and does not move when a key is corrected.
 */
export function extractRuneSheet(pool: RunePool): RuneSheet {
  const entries = pool.entries.map(
    (e): RuneSheetEntry => ({ code: runeCode(pool.poolId, e), effect: e.effect, prompt: e.prompt, ...(e.readAloud !== undefined ? { heard: e.readAloud } : {}), tiles: fallbackTiles(e.tiles) }),
  );
  const sorted = entries.sort((a, b) => (a.prompt < b.prompt ? -1 : a.prompt > b.prompt ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return { poolId: pool.poolId, band: pool.band, entries: shuffle(sorted, seededRng(hash32(`${pool.poolId}/entries`))) };
}

const SHEET_MARKER = "rune-blind-pass sheet v1";

const entryLine = (e: RuneSheetEntry): string =>
  `- \`#${e.code}\` (a picture of ${RUNE_PICTURES[e.effect]}) Shown: "${e.prompt}"${e.heard !== undefined ? ` | Heard: "${e.heard}"` : ""} | Tiles: ${e.tiles.join(" · ")} | Answer:`;

export function renderRuneSheet(sheet: RuneSheet): string {
  const dictation = LISTEN_BANDS.includes(sheet.band);
  const out: string[] = [];
  out.push(`# Blind rune pass — ${sheet.poolId} (band ${sheet.band})`);
  out.push("");
  out.push(`<!-- ${SHEET_MARKER} · pool: ${sheet.poolId} · entries: ${sheet.entries.length} -->`);
  out.push("");
  out.push(`**Do not open \`src/content/runes/${sheet.poolId}.json\`** — not before you start, not to`);
  out.push("check yourself partway. This sheet is worth exactly as much as that rule is kept.");
  out.push("");
  out.push("Each line below is one rune stone. A child sees a picture of the thing that needs the rune, reads");
  out.push("the shown line, and builds a word by tapping tiles in order. Each tile is used at most once, and");
  out.push("not every tile is needed: some are decoys. The tiles are listed A-Z here; the child sees them");
  out.push("shuffled. Answer each line ON ITS OWN: the lines are shuffled and unrelated.");
  out.push("");
  if (dictation) {
    out.push("This is a **dictation** pool: the child HEARS the word (the `Heard:` line is spoken to them), so");
    out.push("you are told it too. For each line, check two things:");
    out.push("");
    out.push("- the heard word can be built from the tiles, each tile once;");
    out.push("- the shown line fits the picture (it is about the thing that needs the rune).");
    out.push("");
    out.push("If both hold, write the heard word after `Answer:`. If either fails, write `?`.");
    out.push("This pass cannot test whether another word would also fit, because the word is told: that is");
    out.push("the dictation's design.");
  } else {
    out.push("The child is given a meaning, not the word. Build the word the shown line (and the `Heard:` line,");
    out.push("where there is one) asks for, from the tiles alone. After `Answer:` on each line write one of:");
    out.push("");
    out.push("- one word — the word you would build.");
    out.push("- `both` and then every word that fits the line AND can be built from the tiles — when more than");
    out.push("  one does. This is as much a defect as a wrong key, and it is the one a reader skips past when");
    out.push("  they are only hunting for mistakes, so use it whenever it is true.");
    out.push("- `?` — no word fits, or you cannot tell from the line and the tiles.");
  }
  out.push("");
  out.push("Leave the `#` codes alone. They pin each answer to the line you actually read, so that if an entry");
  out.push("is edited afterwards the stale answer is reported rather than trusted.");
  out.push("");
  out.push("---");
  out.push("");
  out.push("## Runes");
  out.push("");
  for (const e of sheet.entries) out.push(entryLine(e));
  out.push("");
  return out.join("\n");
}

// ---------------------------------------------------------------------------------------
// Reading a filled-in sheet back
// ---------------------------------------------------------------------------------------

export type RuneSheetAnswer = {
  code: string;
  /** The word the reviewer built, or null when they wrote `both`, `?` or nothing. */
  word: string | null;
  /** True when the reviewer wrote `?` (or something unreadable): answered, but "no word fits". */
  refused: boolean;
  /** True when the reviewer wrote `both`: more than one word fits. */
  both: boolean;
  /** The words the reviewer said fit, after `both`. */
  fits: string[];
};

const LETTERS = /^[a-z]+$/;

/** One word as a reviewer wrote it, without quotes, backticks or trailing punctuation; null when it is not one word of letters. */
function readWord(raw: string): string | null {
  const w = raw.trim().replace(/^[`'"]+|[`'".,;:!)]+$/g, "").trim().toLowerCase();
  return LETTERS.test(w) ? w : null;
}

/** The words named after `both`: split at spaces, commas, "and", "+" and "&"; anything that is not a word is passed over. */
function wordsIn(rest: string): string[] {
  const found: string[] = [];
  for (const piece of rest.split(/\s*(?:[,;+&]|\band\b|\s)\s*/)) {
    const w = readWord(piece);
    if (w && !found.includes(w)) found.push(w);
  }
  return found;
}

/**
 * Reads a rendered sheet back, however carefully or carelessly it was filled in: case, quotes and
 * trailing punctuation do not matter. An answer that is not one word is unreadable, and something we
 * cannot read is not an answer to trust.
 */
export function parseRuneSheet(markdown: string): { poolId: string | null; answers: RuneSheetAnswer[] } {
  const poolId = markdown.match(/rune-blind-pass sheet v1 · pool: ([^\s·]+)/)?.[1] ?? null;
  const answers: RuneSheetAnswer[] = [];
  for (const { code, raw } of answerSlots(markdown)) {
    const read = readAnswer(raw);
    let word: string | null = null;
    let refused = false;
    let both = false;
    let fits: string[] = [];
    if (read.kind === "both") {
      both = true;
      fits = wordsIn(read.rest);
    } else if (read.kind === "refused") {
      refused = true;
    } else if (read.kind === "value") {
      word = readWord(read.value);
      if (word === null) refused = true;
    }
    answers.push({ code, word, refused, both, fits });
  }
  return { poolId, answers };
}

// ---------------------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------------------

export type RuneFlagKind =
  /** The reviewer built a different word that the tiles can build. */
  | "disagree"
  /** The reviewer wrote a word the tiles cannot build: the line led them to a word the stone cannot make. */
  | "not-buildable"
  /** The reviewer said more than one word fits, and named one the pool does not accept (or none). */
  | "ambiguous"
  /** The reviewer could not build a word, or (at a dictation) the line does not fit the picture. */
  | "unanswerable";

export type RuneFlag = {
  /** The entry id: the pool's own name for it, which a resolution uses. */
  itemId: string;
  prompt: string;
  kind: RuneFlagKind;
  /** The word the reviewer built; null for `ambiguous` and `unanswerable`. */
  reviewerWord: string | null;
  /** For `ambiguous`: the words the reviewer said fit. */
  fits: string[];
  /** The accepted words, joined with commas: the key a resolution pins (`keyAt`). */
  key: string;
  code: string;
  resolution?: Resolution;
};

export type RuneBlindPassReport = {
  poolId: string;
  total: number;
  /** Entries answered against a sheet that still matches the entry. */
  checked: number;
  /** Of those, how many the reviewer built an accepted word for, with no second thoughts. */
  agreed: number;
  flags: RuneFlag[];
  /** Flags with no settlement recorded for the entry as it stands now. These block the pool. */
  unresolved: RuneFlag[];
  /** Entries (by id) with no answer on the sheet. */
  missing: string[];
  /** Answers (`#code`) that no longer match any entry: given before the entry was edited. */
  stale: string[];
  ok: boolean;
};

/** The key a resolution pins: the accepted words, in the pool's order, joined with commas. */
export const runeKeyAt = (entry: Pick<RuneEntry, "words">): string => entry.words.join(",");

/**
 * Compares a filled-in sheet against the pool it was cut from. `ok` only when every entry was answered
 * against the current entry, every flag has a settlement, and nothing on the sheet is stale. Silence
 * is not agreement.
 */
export function compareRuneSheet(pool: RunePool, answers: RuneSheetAnswer[], resolutions: Resolution[] = []): RuneBlindPassReport {
  const byCode = new Map(pool.entries.map((e) => [runeCode(pool.poolId, e), e] as const));
  const answered = new Set<string>();
  const flags: RuneFlag[] = [];
  const stale: string[] = [];
  let checked = 0;
  let agreed = 0;

  for (const answer of answers) {
    const entry = byCode.get(answer.code);
    if (!entry) {
      stale.push(`#${answer.code}`);
      continue;
    }
    if (answer.word === null && !answer.refused && !answer.both) continue; // left blank: counted as missing
    answered.add(entry.id);
    checked++;

    const key = runeKeyAt(entry);
    const settled = findResolution(resolutions, entry.id, answer.code, key);
    const flag = (kind: RuneFlagKind): void => {
      flags.push({ itemId: entry.id, prompt: entry.prompt, kind, reviewerWord: answer.word, fits: answer.fits, key, code: answer.code, ...(settled ? { resolution: settled } : {}) });
    };
    const accepted = (w: string): boolean => entry.words.includes(w);

    if (answer.refused) flag("unanswerable");
    else if (answer.both) {
      if (answer.fits.length > 0 && answer.fits.every(accepted)) agreed++;
      else flag("ambiguous");
    } else if (accepted(answer.word!)) agreed++;
    else if (runeTiling(answer.word!, entry.tiles) === null) flag("not-buildable");
    else flag("disagree");
  }

  const missing = pool.entries.map((e) => e.id).filter((id) => !answered.has(id));
  const unresolved = unresolvedOf(flags);
  return { poolId: pool.poolId, total: pool.entries.length, checked, agreed, flags, unresolved, missing, stale, ok: unresolved.length === 0 && missing.length === 0 && stale.length === 0 };
}

/** The report as something worth printing in a terminal or pasting into a task report. */
export function formatRuneReport(report: RuneBlindPassReport): string {
  const lines: string[] = [];
  lines.push(`${report.poolId}: ${report.checked}/${report.total} answered, ${report.agreed} agreed, ${report.flags.length} flagged (${report.unresolved.length} unresolved)`);
  for (const flag of report.flags) {
    const verdict =
      flag.kind === "disagree"
        ? `key: ${flag.key}   reviewer built: ${flag.reviewerWord}`
        : flag.kind === "not-buildable"
          ? `key: ${flag.key}   reviewer wrote: ${flag.reviewerWord}, which the tiles cannot build`
          : flag.kind === "ambiguous"
            ? `key: ${flag.key}   reviewer: more than one word fits${flag.fits.length ? ` (${flag.fits.join(", ")})` : ""}`
            : `key: ${flag.key}   reviewer: no word fits`;
    lines.push(...flagLines(flag, [`"${flag.prompt}"  (#${flag.code})`, verdict]));
  }
  lines.push(...closingLines({ ...report, unknown: [] }));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------
// Re-cutting a sheet that already has answers
// ---------------------------------------------------------------------------------------

/**
 * Fills a freshly rendered sheet with the answers an existing sheet already carries, but only for
 * entries whose `#code` is unchanged: the code is a fingerprint of the entry as the reviewer saw it,
 * so an unchanged code means they answered exactly this entry (F-2). An edited entry comes back blank.
 */
export function carryRuneForward(next: string, existing: string): string {
  const carried = new Map<string, string>();
  for (const a of parseRuneSheet(existing).answers) {
    if (a.both) carried.set(a.code, a.fits.length ? `both ${a.fits.join(" ")}` : "both");
    else if (a.refused) carried.set(a.code, "?");
    else if (a.word !== null) carried.set(a.code, a.word);
  }
  return carryForwardByCode(next, carried);
}

// ---------------------------------------------------------------------------------------
// Where the files live
// ---------------------------------------------------------------------------------------

export const RUNES_DIR = path.join(__dirname, "../../content/runes");

export const runePoolPath = (poolId: string): string => path.join(RUNES_DIR, `${poolId}.json`);
/** The sheet a reviewer answers: `src/content/review/<poolId>.blind.md`. */
export const runeSheetPath = (poolId: string): string => sheetPath(poolId);

export function loadRunePool(poolId: string): RunePool {
  return JSON.parse(fs.readFileSync(runePoolPath(poolId), "utf8")) as RunePool;
}

/** Every rune pool file on disk, by id. */
export function allRunePoolIds(): string[] {
  if (!fs.existsSync(RUNES_DIR)) return [];
  return fs
    .readdirSync(RUNES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/** Every rune pool that has a sheet on disk. */
export function runePoolsWithSheets(dir: string = REVIEW_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(RUNE_POOL_PREFIX) && f.endsWith(".blind.md"))
    .map((f) => f.replace(/\.blind\.md$/, ""))
    .sort();
}

/**
 * Cut a sheet for a pool. Refuses a pool that fails `validateRunePool` (a sheet for a pool that will
 * change is wasted reading), and refuses to overwrite a sheet that already carries answers unless
 * `force` is passed; a forced re-cut carries over every answer whose entry did not change.
 */
export function writeRuneSheet(pool: RunePool, force = false): { path: string; written: boolean } {
  const problems = validateRunePool(pool);
  if (problems.length > 0) throw new Error(`${pool.poolId} does not validate, so no sheet was cut:\n${formatRuneProblems(problems)}`);
  const file = runeSheetPath(pool.poolId);
  let next = renderRuneSheet(extractRuneSheet(pool));
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, "utf8");
    if (existing === next) return { path: file, written: false };
    const answered = parseRuneSheet(existing).answers.some((a) => a.word !== null || a.refused || a.both);
    if (answered && !force) {
      throw new Error(
        `${file} already has answers on it. Pass --force to replace it: answers to entries that did not ` +
          `change are carried over, and every edited entry comes back blank.`,
      );
    }
    if (answered) next = carryRuneForward(next, existing);
  }
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
  fs.writeFileSync(file, next);
  return { path: file, written: true };
}

/** Compare the sheet on disk for a pool against the pool and its recorded settlements. */
export function runRunePool(poolId: string): RuneBlindPassReport {
  const pool = loadRunePool(poolId);
  const file = runeSheetPath(poolId);
  const answers = fs.existsSync(file) ? parseRuneSheet(fs.readFileSync(file, "utf8")).answers : [];
  return compareRuneSheet(pool, answers, loadResolutions(poolId));
}
