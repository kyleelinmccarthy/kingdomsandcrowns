/**
 * The blind answer pass for trail pools. The same idea as `blind-pass.ts` (read that first for why
 * it exists): `validateTrailPool` can see the shape of a pool but not whether a clue really leads to
 * the mill and ONLY the mill. A second reader who has never seen the key answers every clue, and every
 * disagreement is looked at by a person and settled in writing.
 *
 * What differs from the other passes, because a trail is neither four-choice nor a sort:
 *
 *   - A sheet is a flat list of clues from the whole pool, shuffled. It never shows a trail id, which
 *     trail a clue belongs to, or its neighbours: a clue must be answerable from its own text alone,
 *     and the shuffle is what proves it.
 *   - The header lists the village's places (id, label, the always-true facts, which are near) and
 *     the pairs a clue must tell apart (`CONFUSABLE_ANCHORS`).
 *   - The reviewer writes a place id after `Answer:`. `both` (with the ids that also fit) means more
 *     than one place fits (an ambiguity, as much a defect as a wrong key) and `?` means no place fits.
 *   - Clues are pinned by `#code` (`clueCode`: a hash of the pool and the normalised text, never the
 *     key and never the identity hash), so an answer is trusted only for the text it was given for.
 *   - Resolutions use the drill pass's file and verdicts (`<poolId>.resolved.json`); `itemId` is
 *     `<trail id>/<clue number>` and `keyAt` is the answer's anchor id.
 *
 * Files: `src/content/trails/<poolId>.json` (the pool), `src/content/review/<poolId>.blind.md` (the
 * sheet) and `src/content/review/<poolId>.resolved.json`. A trail pool id starts with `trail-`, so
 * none of these collide with a drill pool's files in `review/`.
 *
 * Dev-time tooling: a script and a test import this, the app never does.
 */
import fs from "node:fs";
import path from "node:path";
import { ANCHORS, ANCHOR_IDS, nearAnchors, type AnchorId } from "../realm/anchors";
import { seededRng, shuffle } from "../utils/drill-generators";
import { REVIEW_DIR, loadResolutions, resolutionsPath, sheetPath, type Resolution } from "./blind-pass";
import { hash32 } from "./hash32";
import { answerSlots, carryForwardByCode, closingLines, findResolution, flagLines, readAnswer, unresolvedOf } from "./sheet-kit";
import { CONFUSABLE_ANCHORS, TRAIL_ANCHOR_FACTS } from "./trail-anchor-facts";
import { TRAIL_POOL_PREFIX, clueCode, clueRef, formatTrailProblems, validateTrailPool, type TrailPool } from "./trail-pools";

export { resolutionsPath };
export type { Resolution, ResolutionVerdict } from "./blind-pass";

// ---------------------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------------------

export type TrailSheetClue = { code: string; text: string };
export type TrailSheet = { poolId: string; band: string; clues: TrailSheetClue[] };

/**
 * Every clue of the pool as a key-free list. The order is a function of the texts and the pool id
 * alone: sorted first, then shuffled with a seed, so it is stable between cuts, does not follow the
 * pool's order (which is trail by trail), and does not move when a key is corrected.
 */
export function extractTrailSheet(pool: TrailPool): TrailSheet {
  const clues = pool.trails.flatMap((t) => t.clues.map((c) => ({ code: clueCode(pool.poolId, c), text: c.text })));
  const sorted = clues.sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return { poolId: pool.poolId, band: pool.band, clues: shuffle(sorted, seededRng(hash32(`${pool.poolId}/clues`))) };
}

const SHEET_MARKER = "trail-blind-pass sheet v1";

const anchorLine = (id: AnchorId): string => {
  const a = ANCHORS[id];
  const near = nearAnchors(id).map((n) => `\`${n}\``);
  return `- \`${id}\` — ${a.label}. ${TRAIL_ANCHOR_FACTS[id].join(" ")} Near: ${near.length ? near.join(", ") : "nothing close"}.`;
};

export function renderTrailSheet(sheet: TrailSheet): string {
  const out: string[] = [];
  out.push(`# Blind trail pass — ${sheet.poolId} (band ${sheet.band})`);
  out.push("");
  out.push(`<!-- ${SHEET_MARKER} · pool: ${sheet.poolId} · clues: ${sheet.clues.length} -->`);
  out.push("");
  out.push(`**Do not open \`src/content/trails/${sheet.poolId}.json\`** — not before you start, not to`);
  out.push("check yourself partway. This sheet is worth exactly as much as that rule is kept.");
  out.push("");
  out.push("Each clue below is a note in a village. A hero reads it and walks to the one place it tells of.");
  out.push("Answer each clue ON ITS OWN, as a careful reader at the level of its words would: the clues are");
  out.push("shuffled and unrelated, and a clue never leans on the one above it. After `Answer:` on each line");
  out.push("write one of:");
  out.push("");
  out.push("- a place id from the list below, such as `landmark:mill` — the one place the clue tells of.");
  out.push("- `both` and then the ids that also fit, such as `both landmark:well object:water-trough` — more");
  out.push("  than one place fits. This is as much a defect as a wrong key, and it is the one a reader skips");
  out.push("  past when they are only hunting for mistakes, so use it whenever it is true.");
  out.push("- `?` — no place fits, or you cannot tell from the clue alone.");
  out.push("");
  out.push("Leave the `#` codes alone. They pin each answer to the clue you actually read, so that if a clue");
  out.push("is edited afterwards the stale answer is reported rather than trusted.");
  out.push("");
  out.push("---");
  out.push("");
  out.push("## The places");
  out.push("");
  out.push("Every one is in the village, and looks the same to every hero. These facts are always true.");
  out.push("");
  for (const id of ANCHOR_IDS) out.push(anchorLine(id));
  out.push("");
  out.push("## Places a clue must tell apart");
  out.push("");
  for (const pair of CONFUSABLE_ANCHORS) {
    const [a, b] = pair.anchors;
    out.push(`- ${ANCHORS[a].label} (\`${a}\`) and ${ANCHORS[b].label} (\`${b}\`)`);
  }
  out.push("");
  out.push("---");
  out.push("");
  out.push("## Clues");
  out.push("");
  for (const clue of sheet.clues) out.push(`- \`#${clue.code}\` ${clue.text} | Answer:`);
  out.push("");
  return out.join("\n");
}

// ---------------------------------------------------------------------------------------
// Reading a filled-in sheet back
// ---------------------------------------------------------------------------------------

export type TrailSheetAnswer = {
  code: string;
  /** The place the reviewer chose, or null when they wrote `both`, `?` or nothing. */
  choice: AnchorId | null;
  /** True when the reviewer wrote `?` (or something unreadable): answered, but "no place fits". */
  refused: boolean;
  /** True when the reviewer wrote `both`: more than one place fits. */
  both: boolean;
  /** The places the reviewer said also fit, after `both`. */
  fits: AnchorId[];
};

/** How a place may be written: its id, the id without its prefix, or its label with or without "the". */
const ANCHOR_WORDS: ReadonlyMap<string, AnchorId> = new Map(
  ANCHOR_IDS.flatMap((id) => {
    const label = ANCHORS[id].label.toLowerCase();
    return [[id, id], [id.split(":")[1], id], [label, id], [label.replace(/^the\s+/, ""), id]] as [string, AnchorId][];
  }),
);

/** The place a reviewer's word names, or null. Own entries only: "toString" names nothing. */
export function readPlace(word: string): AnchorId | null {
  const w = word.trim().replace(/^[`'"]+|[`'".,;)]+$/g, "").trim().toLowerCase();
  return ANCHOR_WORDS.get(w) ?? null;
}

/**
 * The places named after `both`: split at commas, "and", "+" and "&" first (so "the water trough" stays
 * one place), and a piece that is no place on its own is read word by word ("landmark:well object:hay-cart").
 */
function placesIn(rest: string): AnchorId[] {
  const found: AnchorId[] = [];
  for (const piece of rest.split(/\s*(?:[,;+&]|\band\b)\s*/)) {
    const whole = readPlace(piece);
    for (const place of whole ? [whole] : piece.split(/\s+/).map(readPlace)) if (place && !found.includes(place)) found.push(place);
  }
  return found;
}

/**
 * Reads a rendered sheet back, however carefully or carelessly it was filled in: the id, the id
 * without its prefix and the place's name all mean the same place. An answer that names no place is
 * unreadable, and something we cannot read is not an answer to trust.
 */
export function parseTrailSheet(markdown: string): { poolId: string | null; answers: TrailSheetAnswer[] } {
  const poolId = markdown.match(/trail-blind-pass sheet v1 · pool: ([^\s·]+)/)?.[1] ?? null;
  const answers: TrailSheetAnswer[] = [];
  for (const { code, raw } of answerSlots(markdown)) {
    const read = readAnswer(raw);
    let choice: AnchorId | null = null;
    let refused = false;
    let both = false;
    let fits: AnchorId[] = [];
    if (read.kind === "both") {
      both = true;
      fits = placesIn(read.rest);
    } else if (read.kind === "refused") {
      refused = true;
    } else if (read.kind === "value") {
      choice = readPlace(read.value);
      if (choice === null) refused = true;
    }
    answers.push({ code, choice, refused, both, fits });
  }
  return { poolId, answers };
}

// ---------------------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------------------

export type TrailFlagKind =
  /** The reviewer picked a different place. */
  | "disagreement"
  /** The reviewer said more than one place fits. */
  | "ambiguity"
  /** The reviewer could not place it. */
  | "unanswerable";

export type TrailFlag = {
  /** `<trail id>/<clue number>`: the pool's own name for the clue, which a resolution uses. */
  itemId: string;
  text: string;
  kind: TrailFlagKind;
  /** The place the reviewer picked; null for `ambiguity` and `unanswerable`. */
  reviewerChoice: AnchorId | null;
  /** For `ambiguity`: the places the reviewer said also fit. */
  fits: AnchorId[];
  /** The place the pool says the clue leads to. */
  key: string;
  code: string;
  resolution?: Resolution;
};

export type TrailBlindPassReport = {
  poolId: string;
  total: number;
  /** Clues answered against a sheet that still matches the clue. */
  checked: number;
  /** Of those, how many the reviewer sent to the keyed place, with no second thoughts. */
  agreed: number;
  flags: TrailFlag[];
  /** Flags with no settlement recorded for the clue as it stands now. These block the pool. */
  unresolved: TrailFlag[];
  /** Clues (`<trail id>/<clue number>`) with no answer on the sheet. */
  missing: string[];
  /** Answers (`#code`) that no longer match any clue: given before the clue was edited. */
  stale: string[];
  ok: boolean;
};

/**
 * Compares a filled-in sheet against the pool it was cut from. `ok` only when every clue was answered
 * against the current clue, every flag has a settlement, and nothing on the sheet is stale. Silence is
 * not agreement.
 */
export function compareTrailSheet(pool: TrailPool, answers: TrailSheetAnswer[], resolutions: Resolution[] = []): TrailBlindPassReport {
  const byCode = new Map<string, { ref: string; text: string; key: string }>();
  for (const trail of pool.trails) {
    trail.clues.forEach((clue, i) => byCode.set(clueCode(pool.poolId, clue), { ref: clueRef(trail.id, i), text: clue.text, key: clue.answer }));
  }
  const answered = new Set<string>();
  const flags: TrailFlag[] = [];
  const stale: string[] = [];
  let checked = 0;
  let agreed = 0;

  for (const answer of answers) {
    const clue = byCode.get(answer.code);
    if (!clue) {
      stale.push(`#${answer.code}`);
      continue;
    }
    if (answer.choice === null && !answer.refused && !answer.both) continue; // left blank: counted as missing
    answered.add(clue.ref);
    checked++;

    const settled = findResolution(resolutions, clue.ref, answer.code, clue.key);
    const flag = (kind: TrailFlagKind): void => {
      flags.push({
        itemId: clue.ref,
        text: clue.text,
        kind,
        reviewerChoice: answer.choice,
        fits: answer.fits,
        key: clue.key,
        code: answer.code,
        ...(settled ? { resolution: settled } : {}),
      });
    };

    if (answer.refused) flag("unanswerable");
    else if (answer.both) flag("ambiguity");
    else if (answer.choice !== clue.key) flag("disagreement");
    else agreed++;
  }

  const total = pool.trails.reduce((n, t) => n + t.clues.length, 0);
  const missing = pool.trails.flatMap((t) => t.clues.map((_, i) => clueRef(t.id, i))).filter((ref) => !answered.has(ref));
  const unresolved = unresolvedOf(flags);
  return { poolId: pool.poolId, total, checked, agreed, flags, unresolved, missing, stale, ok: unresolved.length === 0 && missing.length === 0 && stale.length === 0 };
}

/** The report as something worth printing in a terminal or pasting into a task report. */
export function formatTrailReport(report: TrailBlindPassReport): string {
  const lines: string[] = [];
  lines.push(`${report.poolId}: ${report.checked}/${report.total} answered, ${report.agreed} agreed, ${report.flags.length} flagged (${report.unresolved.length} unresolved)`);
  for (const flag of report.flags) {
    const verdict =
      flag.kind === "disagreement"
        ? `key: ${flag.key}   reviewer: ${flag.reviewerChoice}`
        : flag.kind === "ambiguity"
          ? `key: ${flag.key}   reviewer: more than one place fits${flag.fits.length ? ` (also: ${flag.fits.join(", ")})` : ""}`
          : `key: ${flag.key}   reviewer: no place fits`;
    lines.push(...flagLines(flag, [`"${flag.text}"  (#${flag.code})`, verdict]));
  }
  lines.push(...closingLines({ ...report, unknown: [] }));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------
// Re-cutting a sheet that already has answers
// ---------------------------------------------------------------------------------------

/**
 * Fills a freshly rendered sheet with the answers an existing sheet already carries, but only for
 * clues whose `#code` is unchanged: the code is a fingerprint of the clue as the reviewer read it, so
 * an unchanged code means they answered exactly this clue (F-2). An edited clue comes back blank.
 */
export function carryTrailForward(next: string, existing: string): string {
  const carried = new Map<string, string>();
  for (const a of parseTrailSheet(existing).answers) {
    if (a.both) carried.set(a.code, a.fits.length ? `both ${a.fits.join(" ")}` : "both");
    else if (a.refused) carried.set(a.code, "?");
    else if (a.choice !== null) carried.set(a.code, a.choice);
  }
  return carryForwardByCode(next, carried);
}

// ---------------------------------------------------------------------------------------
// Where the files live
// ---------------------------------------------------------------------------------------

export const TRAILS_DIR = path.join(__dirname, "../../content/trails");

export const trailPoolPath = (poolId: string): string => path.join(TRAILS_DIR, `${poolId}.json`);
/** The sheet a reviewer answers: `src/content/review/<poolId>.blind.md`. */
export const trailSheetPath = (poolId: string): string => sheetPath(poolId);

export function loadTrailPool(poolId: string): TrailPool {
  return JSON.parse(fs.readFileSync(trailPoolPath(poolId), "utf8")) as TrailPool;
}

/** Every trail pool file on disk, by id. */
export function allTrailPoolIds(): string[] {
  if (!fs.existsSync(TRAILS_DIR)) return [];
  return fs
    .readdirSync(TRAILS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/** Every trail pool that has a sheet on disk. */
export function trailPoolsWithSheets(dir: string = REVIEW_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(TRAIL_POOL_PREFIX) && f.endsWith(".blind.md"))
    .map((f) => f.replace(/\.blind\.md$/, ""))
    .sort();
}

/**
 * Cut a sheet for a pool. Refuses a pool that fails `validateTrailPool` (a sheet for a pool that will
 * change is wasted reading), and refuses to overwrite a sheet that already carries answers unless
 * `force` is passed; a forced re-cut carries over every answer whose clue did not change.
 */
export function writeTrailSheet(pool: TrailPool, force = false): { path: string; written: boolean } {
  const problems = validateTrailPool(pool);
  if (problems.length > 0) throw new Error(`${pool.poolId} does not validate, so no sheet was cut:\n${formatTrailProblems(problems)}`);
  const file = trailSheetPath(pool.poolId);
  let next = renderTrailSheet(extractTrailSheet(pool));
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, "utf8");
    if (existing === next) return { path: file, written: false };
    const answered = parseTrailSheet(existing).answers.some((a) => a.choice !== null || a.refused || a.both);
    if (answered && !force) {
      throw new Error(
        `${file} already has answers on it. Pass --force to replace it: answers to clues that did not ` +
          `change are carried over, and every edited clue comes back blank.`,
      );
    }
    if (answered) next = carryTrailForward(next, existing);
  }
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
  fs.writeFileSync(file, next);
  return { path: file, written: true };
}

/** Compare the sheet on disk for a pool against the pool and its recorded settlements. */
export function runTrailPool(poolId: string): TrailBlindPassReport {
  const pool = loadTrailPool(poolId);
  const file = trailSheetPath(poolId);
  const answers = fs.existsSync(file) ? parseTrailSheet(fs.readFileSync(file, "utf8")).answers : [];
  return compareTrailSheet(pool, answers, loadResolutions(poolId));
}
