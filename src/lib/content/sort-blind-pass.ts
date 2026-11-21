/**
 * The blind answer pass for sort pools. The same idea as `blind-pass.ts` (read that first for why
 * it exists): `validateSortPool` can see the shape of a pool but not whether "mushroom" belongs with
 * the living things. A second reader who has never seen the key places every item, and every
 * disagreement is looked at by a person and settled in writing.
 *
 * What differs from the drill pass, because a sort is not four-choice:
 *
 *   - A sheet is a list of sets. Each set names its two bins (0 and 1) and lists its items in a
 *     stable order that does not follow the key; the reviewer writes `0` or `1` after each.
 *   - The reviewer writes `both` when either bin could be defended (an ambiguity, as much a defect
 *     as a wrong key) and `?` when the item cannot be placed (unanswerable).
 *   - The sheet shows no item ids. An id such as `sta-a3` is harmless, but an author's id can lean
 *     on the answer, and a sheet's worth is the key it does not carry. Items are pinned by `#code`
 *     (a hash of the set's two bins and the label, never the key) within their set.
 *   - Resolutions use the drill pass's file and verdicts (`<poolId>.resolved.json`); `keyAt` holds
 *     the NAME of the bin the key put the item in.
 *
 * Files: `src/content/sorts/<poolId>.json` (the pool), `src/content/review/<poolId>.blind.md` (the
 * sheet) and `src/content/review/<poolId>.resolved.json`. A sort pool id starts with `sort-`, so
 * none of these collide with a drill pool's files in `review/`.
 *
 * Dev-time tooling: a script and a test import this, the app never does.
 */
import fs from "node:fs";
import path from "node:path";
import { seededRng, shuffle } from "../utils/drill-generators";
import { hash32, hex8 } from "./hash32";
import { REVIEW_DIR, loadResolutions, resolutionsPath, sheetPath, type Resolution } from "./blind-pass";
import { ANSWER_LINE, carryForwardByCode, closingLines, findResolution, flagLines, readAnswer, unresolvedOf } from "./sheet-kit";
import { SORT_POOL_PREFIX, formatSortProblems, normLabel, validateSortPool, type SortPool, type SortPoolItem, type SortSet } from "./sort-pools";

export { resolutionsPath };
export type { Resolution, ResolutionVerdict } from "./blind-pass";

// ---------------------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------------------

/**
 * A short fingerprint of exactly what the reviewer was shown for an item: the set's two bins in order,
 * and the label. It is how a comparison knows an answer still belongs to the item it was given for.
 * It deliberately does NOT cover the key, so correcting a wrong key leaves a finished sheet valid
 * (resolutions pin the key separately, through `keyAt`).
 */
export function itemCode(set: SortSet, item: SortPoolItem): string {
  return hex8(hash32([set.categories[0], set.categories[1], normLabel(item.label)].join("\u0000")));
}

export type SortSheetItem = { code: string; label: string };
export type SortSheetSet = { setId: string; categories: [string, string]; items: SortSheetItem[] };
export type SortSheet = { poolId: string; grade: string; sets: SortSheetSet[] };

/**
 * Every set as a key-free list. The order is a function of the labels and the set id alone: sorted
 * first, then shuffled with a seed, so it is stable between cuts, does not follow the pool's order
 * (which authors tend to write bin by bin), and does not move when a key is corrected.
 */
export function extractSortSheet(pool: SortPool): SortSheet {
  return {
    poolId: pool.poolId,
    grade: pool.grade,
    sets: pool.sets.map((set) => {
      const sorted = [...set.items].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
      const rng = seededRng(hash32(`${pool.poolId}/${set.id}`));
      return {
        setId: set.id,
        categories: [set.categories[0], set.categories[1]],
        items: shuffle(sorted, rng).map((item) => ({ code: itemCode(set, item), label: item.label })),
      };
    }),
  };
}

const SHEET_MARKER = "sort-blind-pass sheet v1";

export function renderSortSheet(sheet: SortSheet): string {
  const out: string[] = [];
  out.push(`# Blind sort pass — ${sheet.poolId} (grade ${sheet.grade})`);
  out.push("");
  out.push(`<!-- ${SHEET_MARKER} · pool: ${sheet.poolId} · sets: ${sheet.sets.length} -->`);
  out.push("");
  out.push(`**Do not open \`src/content/sorts/${sheet.poolId}.json\`** — not before you start, not to`);
  out.push("check yourself partway. This sheet is worth exactly as much as that rule is kept.");
  out.push("");
  out.push("Each set below is one sorting job: two bins, numbered 0 and 1, and a list of things to");
  out.push("sort. Answer as a careful reader at the grade above would. After `Answer:` on each line");
  out.push("write one of:");
  out.push("");
  out.push("- `0` or `1` — the bin the thing belongs in.");
  out.push("- `both` — a reasonable person could defend either bin. This is as much a defect as a");
  out.push("  wrong key, and it is the one a reader skips past when they are only hunting for");
  out.push("  mistakes, so use it whenever it is true.");
  out.push("- `?` — it does not belong in either bin, or you cannot place it from what is in front of you.");
  out.push("");
  out.push("Leave the `#` codes alone. They pin each answer to the thing you actually read, so that if");
  out.push("an item is edited afterwards the stale answer is reported rather than trusted.");
  out.push("");
  sheet.sets.forEach((set, index) => {
    out.push("---");
    out.push("");
    out.push(`## Set ${index + 1}. \`${set.setId}\``);
    out.push("");
    out.push(`Bin 0: ${set.categories[0]}`);
    out.push(`Bin 1: ${set.categories[1]}`);
    out.push("");
    for (const item of set.items) out.push(`- \`#${item.code}\` ${item.label} | Answer:`);
    out.push("");
  });
  return out.join("\n");
}

// ---------------------------------------------------------------------------------------
// Reading a filled-in sheet back
// ---------------------------------------------------------------------------------------

export type SortSheetAnswer = {
  setId: string;
  code: string;
  /** The bin the reviewer chose, or null when they wrote `both`, `?` or nothing. */
  choice: 0 | 1 | null;
  /** True when the reviewer wrote `?` (or something unreadable): answered, but "none of these". */
  refused: boolean;
  /** True when the reviewer wrote `both`: either bin is defensible. */
  both: boolean;
};

/**
 * Reads a rendered sheet back, however carefully or carelessly it was filled in: `1`, `1.`, `1)` and
 * the bin's own name all mean bin 1. A pass that rejects an honest answer over punctuation costs a
 * re-read and will quietly stop being run.
 */
export function parseSortSheet(markdown: string): { poolId: string | null; answers: SortSheetAnswer[] } {
  const poolId = markdown.match(/sort-blind-pass sheet v1 · pool: ([^\s·]+)/)?.[1] ?? null;
  const answers: SortSheetAnswer[] = [];
  for (const block of markdown.split(/^## /m).slice(1)) {
    const setId = block.split("\n", 1)[0].match(/`([^`]+)`/)?.[1]?.trim();
    if (!setId) continue;
    const bins = [block.match(/^Bin 0:\s*(.*)$/m)?.[1]?.trim() ?? "", block.match(/^Bin 1:\s*(.*)$/m)?.[1]?.trim() ?? ""];
    for (const line of block.split("\n")) {
      const m = ANSWER_LINE.exec(line);
      if (!m) continue;
      const read = readAnswer(m[2]);
      let choice: 0 | 1 | null = null;
      let refused = false;
      let both = false;
      if (read.kind === "both") {
        both = true;
      } else if (read.kind === "refused") {
        refused = true;
      } else if (read.kind === "value") {
        if (read.value === "0" || read.value === "1") {
          choice = read.value === "0" ? 0 : 1;
        } else {
          const named = bins.findIndex((b) => b !== "" && b.toLowerCase() === read.value);
          if (named === 0 || named === 1) choice = named;
          else refused = true; // something we cannot read is not an answer to trust
        }
      }
      // A blank stays blank: counted as missing.
      answers.push({ setId, code: m[1], choice, refused, both });
    }
  }
  return { poolId, answers };
}

// ---------------------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------------------

export type SortFlagKind =
  /** The reviewer picked the other bin. */
  | "disagreement"
  /** The reviewer said either bin could be defended. */
  | "ambiguity"
  /** The reviewer could not place it. */
  | "unanswerable";

export type SortFlag = {
  itemId: string;
  setId: string;
  label: string;
  kind: SortFlagKind;
  /** The name of the bin the reviewer picked; null for `ambiguity` and `unanswerable`. */
  reviewerChoice: string | null;
  /** The name of the bin the pool puts it in. */
  key: string;
  code: string;
  resolution?: Resolution;
};

export type SortBlindPassReport = {
  poolId: string;
  total: number;
  /** Items answered against a sheet that still matches the item. */
  checked: number;
  /** Of those, how many the reviewer placed in the keyed bin, with no second thoughts. */
  agreed: number;
  flags: SortFlag[];
  /** Flags with no settlement recorded for the item as it stands now. These block the pool. */
  unresolved: SortFlag[];
  /** Item ids with no answer on the sheet. */
  missing: string[];
  /** Answers (`set/#code`) that no longer match any item: edited after they were given. */
  stale: string[];
  /** Answers (`set/#code`) for a set the pool does not have. */
  unknown: string[];
  ok: boolean;
};

/**
 * Compares a filled-in sheet against the pool it was cut from. `ok` only when every item was answered
 * against the current item, every flag has a settlement, and nothing on the sheet is stale or
 * unrecognised. Silence is not agreement.
 */
export function compareSortSheet(pool: SortPool, answers: SortSheetAnswer[], resolutions: Resolution[] = []): SortBlindPassReport {
  const sets = new Map(pool.sets.map((s) => [s.id, s]));
  const answered = new Set<string>();
  const flags: SortFlag[] = [];
  const stale: string[] = [];
  const unknown: string[] = [];
  let checked = 0;
  let agreed = 0;

  for (const answer of answers) {
    const set = sets.get(answer.setId);
    if (!set) {
      unknown.push(`${answer.setId}/#${answer.code}`);
      continue;
    }
    const item = set.items.find((i) => itemCode(set, i) === answer.code);
    if (!item) {
      stale.push(`${answer.setId}/#${answer.code}`);
      continue;
    }
    if (answer.choice === null && !answer.refused && !answer.both) continue; // left blank: counted as missing
    answered.add(item.id);
    checked++;

    const keyName = set.categories[item.category];
    const settled = findResolution(resolutions, item.id, answer.code, keyName);
    const flag = (kind: SortFlagKind): void => {
      flags.push({
        itemId: item.id,
        setId: set.id,
        label: item.label,
        kind,
        reviewerChoice: answer.choice === null ? null : set.categories[answer.choice],
        key: keyName,
        code: answer.code,
        ...(settled ? { resolution: settled } : {}),
      });
    };

    if (answer.refused) flag("unanswerable");
    else if (answer.both) flag("ambiguity");
    else if (answer.choice !== item.category) flag("disagreement");
    else agreed++;
  }

  const missing = pool.sets.flatMap((s) => s.items.map((i) => i.id)).filter((id) => !answered.has(id));
  const unresolved = unresolvedOf(flags);
  return {
    poolId: pool.poolId,
    total: pool.sets.reduce((n, s) => n + s.items.length, 0),
    checked,
    agreed,
    flags,
    unresolved,
    missing,
    stale,
    unknown,
    ok: unresolved.length === 0 && missing.length === 0 && stale.length === 0 && unknown.length === 0,
  };
}

/** The report as something worth printing in a terminal or pasting into a task report. */
export function formatSortReport(report: SortBlindPassReport): string {
  const lines: string[] = [];
  lines.push(
    `${report.poolId}: ${report.checked}/${report.total} answered, ${report.agreed} agreed, ` +
      `${report.flags.length} flagged (${report.unresolved.length} unresolved)`,
  );
  for (const flag of report.flags) {
    const verdict =
      flag.kind === "disagreement"
        ? `key: ${flag.key}   reviewer: ${flag.reviewerChoice}`
        : flag.kind === "ambiguity"
          ? `key: ${flag.key}   reviewer: either bin is defensible`
          : `key: ${flag.key}   reviewer: could not place it`;
    lines.push(...flagLines(flag, [`"${flag.label}" in set ${flag.setId}  (#${flag.code})`, verdict]));
  }
  lines.push(...closingLines(report));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------
// Re-cutting a sheet that already has answers
// ---------------------------------------------------------------------------------------

/**
 * Fill a freshly rendered sheet with the answers an existing sheet already carries, but only for items
 * whose `#code` is unchanged: the code is a fingerprint of the item as the reviewer read it, so an
 * unchanged code means they answered exactly this item. An edited item comes back blank.
 */
export function carrySortForward(next: string, existing: string): string {
  const carried = new Map<string, string>();
  for (const a of parseSortSheet(existing).answers) {
    if (a.choice !== null || a.refused || a.both) carried.set(`${a.setId}/${a.code}`, a.both ? "both" : a.refused ? "?" : String(a.choice));
  }
  return carryForwardByCode(next, carried, /^## Set \d+\. `([^`]+)`/);
}

// ---------------------------------------------------------------------------------------
// Where the files live
// ---------------------------------------------------------------------------------------

export const SORTS_DIR = path.join(__dirname, "../../content/sorts");

export const sortPoolPath = (poolId: string): string => path.join(SORTS_DIR, `${poolId}.json`);
/** The sheet a reviewer answers: `src/content/review/<poolId>.blind.md`. */
export const sortSheetPath = (poolId: string): string => sheetPath(poolId);

export function loadSortPool(poolId: string): SortPool {
  return JSON.parse(fs.readFileSync(sortPoolPath(poolId), "utf8")) as SortPool;
}

/** Every sort pool file on disk, by id. */
export function allSortPoolIds(): string[] {
  if (!fs.existsSync(SORTS_DIR)) return [];
  return fs
    .readdirSync(SORTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/** Every sort pool that has a sheet on disk. */
export function sortPoolsWithSheets(): string[] {
  if (!fs.existsSync(REVIEW_DIR)) return [];
  return fs
    .readdirSync(REVIEW_DIR)
    .filter((f) => f.startsWith(SORT_POOL_PREFIX) && f.endsWith(".blind.md"))
    .map((f) => f.replace(/\.blind\.md$/, ""))
    .sort();
}

/**
 * Cut a sheet for a pool. Refuses a pool that fails `validateSortPool` (a sheet for a pool that will
 * change is wasted reading), and refuses to overwrite a sheet that already carries answers unless
 * `force` is passed; a forced re-cut carries over every answer whose item did not change.
 */
export function writeSortSheet(pool: SortPool, force = false): { path: string; written: boolean } {
  const problems = validateSortPool(pool);
  if (problems.length > 0) throw new Error(`${pool.poolId} does not validate, so no sheet was cut:\n${formatSortProblems(problems)}`);
  const file = sortSheetPath(pool.poolId);
  let next = renderSortSheet(extractSortSheet(pool));
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, "utf8");
    if (existing === next) return { path: file, written: false };
    const answered = parseSortSheet(existing).answers.some((a) => a.choice !== null || a.refused || a.both);
    if (answered && !force) {
      throw new Error(
        `${file} already has answers on it. Pass --force to replace it: answers to items that did not ` +
          `change are carried over, and every edited item comes back blank.`,
      );
    }
    if (answered) next = carrySortForward(next, existing);
  }
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
  fs.writeFileSync(file, next);
  return { path: file, written: true };
}

/** Compare the sheet on disk for a pool against the pool and its recorded settlements. */
export function runSortPool(poolId: string): SortBlindPassReport {
  const pool = loadSortPool(poolId);
  const file = sortSheetPath(poolId);
  const answers = fs.existsSync(file) ? parseSortSheet(fs.readFileSync(file, "utf8")).answers : [];
  return compareSortSheet(pool, answers, loadResolutions(poolId));
}
