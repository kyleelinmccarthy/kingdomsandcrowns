/**
 * The blind answer pass — spec §6.5.2.
 *
 * Math items are generated, so a second derivation can recompute the answer and two
 * independent derivations agreeing is evidence. Reading, Language Arts and Science items are
 * *authored*: a person typed the question, the answer and the three wrong answers, and there
 * is nothing to recompute. `pool-validate.ts` checks the shape of an item — three distinct
 * distractors, the answer not among them, levels spread, no length tell. It cannot tell
 * whether the marked answer is the right one, whether two options are both defensible, or
 * whether the question means anything at all.
 *
 * This module is that check, and it is the only one in the program that sees meaning.
 *
 * The shape of it:
 *
 *   1. `renderSheet` emits every item as a prompt and four lettered choices with **no
 *      indication of which is keyed**, into `src/content/review/<poolId>.blind.md`.
 *   2. An independent reader — a person, or an agent that has not read the pool file —
 *      answers every question in that file and says, for every item, whether any *other*
 *      option is also defensible.
 *   3. `compareSheet` reads the filled-in sheet back and reports every item where the
 *      reviewer disagrees with the key, marked more than one option defensible, or could not
 *      answer at all.
 *   4. A person settles every flag and writes the settlement into
 *      `src/content/review/<poolId>.resolved.json`, which is what stops the same item being
 *      re-litigated on every run.
 *
 * A disagreement is NOT automatically a content bug. The reviewer can be wrong, and saying so
 * in the resolutions file is a legitimate outcome. What is not legitimate is a flag nobody
 * ever looked at.
 */

// ---------------------------------------------------------------------------------------
// The pool, as it sits on disk
// ---------------------------------------------------------------------------------------

export type PoolItem = {
  id: string;
  prompt: string;
  answer: string;
  distractors: string[];
  readAloud?: string;
  level?: number;
};

export type Pool = {
  poolId: string;
  grade: string;
  items: PoolItem[];
};

export const LETTERS = ["A", "B", "C", "D"] as const;

// ---------------------------------------------------------------------------------------
// Stable, key-free choice order
// ---------------------------------------------------------------------------------------

/** FNV-1a. Small, dependency-free, and good enough to spread item ids over a seed space. */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — a seeded PRNG, so a sheet re-run on unchanged content is byte-identical. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The four options in a stable order seeded by the item id.
 *
 * The options are **sorted before they are shuffled**, deliberately. If the raw
 * `[answer, ...distractors]` order were fed to the shuffle, the presented order would depend
 * on which option is keyed — so correcting a wrong key would re-letter the sheet and throw
 * away a reviewer's completed answers for a question whose text never changed, and the order
 * would in principle carry a trace of the key. Sorting first makes the order a function of
 * the *set* of options and the item id alone.
 */
export function choicesFor(item: PoolItem): string[] {
  const options = [item.answer, ...item.distractors];
  const sorted = [...options].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const rng = mulberry32(hash32(item.id));
  for (let i = sorted.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  }
  return sorted;
}

/**
 * A short code over exactly what the reviewer was shown: the prompt and the options in the
 * order they were presented. It is printed beside each question on the sheet and is how a
 * comparison knows whether an answer still belongs to the question it was given for. Change
 * the prompt or any option and the code changes, the old answer is reported stale, and the
 * item goes back for a fresh read — which is right, because it is now a different question.
 *
 * It deliberately does NOT cover the key, so that fixing a wrong key leaves a completed sheet
 * valid. Resolutions pin the key separately, through `keyAt`.
 */
export function questionCode(item: PoolItem): string {
  const shown = [item.prompt, ...choicesFor(item)].join("\u0000");
  return hash32(shown).toString(16).padStart(8, "0").slice(0, 6);
}

// ---------------------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------------------

export type SheetQuestion = {
  itemId: string;
  code: string;
  prompt: string;
  choices: string[];
  level?: number;
};

export type Sheet = {
  poolId: string;
  grade: string;
  questions: SheetQuestion[];
};

/**
 * Every item as a key-free question. Note what is *not* here: `answer`, `distractors` and
 * `readAloud`.
 *
 * `readAloud` is excluded on purpose and it is not a detail. In every pool that has one
 * today — the sight-word and spelling pools — `readAloud` holds the very word the question
 * is asking the child to pick, so emitting it would hand the reviewer the key and the whole
 * pass would turn into theatre. If a pool ever puts something a reader genuinely needs into
 * `readAloud` alone, the reviewer will be unable to answer and will mark the item `?`, which
 * this pass reports. That is the correct outcome: a question a person cannot answer from what
 * a child is shown is a broken question.
 */
export function extractSheet(pool: Pool): Sheet {
  return {
    poolId: pool.poolId,
    grade: pool.grade,
    questions: pool.items.map((item) => ({
      itemId: item.id,
      code: questionCode(item),
      prompt: item.prompt,
      choices: choicesFor(item),
      level: item.level,
    })),
  };
}

const SHEET_MARKER = "blind-pass sheet v1";

/**
 * The sheet as markdown.
 *
 * Markdown rather than JSON because the thing on the other end of this file is a person
 * working through 45 questions in one sitting. A JSON sheet is answered by editing string
 * values inside a bracket soup, where losing your place costs a syntax error and a whole
 * re-read; a markdown sheet is answered by typing a letter on a blank line under the
 * question you just read. The two fill-in lines are a fixed, machine-parsed shape, so the
 * file is still read back exactly, and `parseSheet` is deliberately forgiving about how the
 * letter is written.
 */
export function renderSheet(sheet: Sheet): string {
  const out: string[] = [];
  out.push(`# Blind answer pass — ${sheet.poolId} (grade ${sheet.grade})`);
  out.push("");
  out.push(`<!-- ${SHEET_MARKER} · pool: ${sheet.poolId} · questions: ${sheet.questions.length} -->`);
  out.push("");
  out.push(
    `**Do not open \`src/content/drills/${sheet.poolId}.json\`** — not before you start, not to`,
  );
  out.push("check yourself partway. This sheet is worth exactly as much as that rule is kept.");
  out.push("");
  out.push("For every question, fill in both lines:");
  out.push("");
  out.push("- `Answer:` — one letter, A to D. Write `?` if you think none of them is right, or if");
  out.push("  the question cannot be answered from what is in front of you.");
  out.push("- `Also defensible:` — the letters of any **other** option a reasonable person could");
  out.push("  also defend as correct, separated by commas. Write `none` when there are none.");
  out.push("");
  out.push("The second line is not optional and is not a formality. A question with two defensible");
  out.push("options is as much a defect as a wrong key, and it is the one a reader skips past when");
  out.push("they are only hunting for mistakes. Answering it on every item is how it gets caught.");
  out.push("");
  out.push("Leave the `#` codes alone. They pin each answer to the question you actually read, so");
  out.push("that if the item is edited afterwards the stale answer is reported rather than trusted.");
  out.push("");
  sheet.questions.forEach((q, index) => {
    out.push("---");
    out.push("");
    const level = q.level === undefined ? "" : ` — level ${q.level}`;
    out.push(`## ${index + 1}. \`${q.itemId}\` \`#${q.code}\`${level}`);
    out.push("");
    out.push(q.prompt);
    out.push("");
    q.choices.forEach((choice, i) => out.push(`- ${LETTERS[i]}. ${choice}`));
    out.push("");
    out.push("Answer:");
    out.push("Also defensible:");
    out.push("");
  });
  return out.join("\n");
}

// ---------------------------------------------------------------------------------------
// Reading a filled-in sheet back
// ---------------------------------------------------------------------------------------

export type SheetAnswer = {
  itemId: string;
  code: string;
  /** The option text the reviewer picked, or null when they wrote `?` or left it blank. */
  choice: string | null;
  /** True when the reviewer wrote `?` — answered, but with "none of these". */
  refused: boolean;
  /** Option texts, other than their own answer, that the reviewer called also defensible. */
  alsoDefensible: string[];
  /** The options as the sheet presented them, so a comparison can check the reviewer saw the
   *  same four options the pool holds now. */
  choices: string[];
};

const LETTER_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

function letterToIndex(token: string): number | null {
  const letter = token.trim().replace(/[).:,]+$/, "").toUpperCase();
  return letter in LETTER_INDEX ? LETTER_INDEX[letter] : null;
}

const NO_SECOND_OPTION = new Set(["none", "no", "n/a", "na", "nil", "-", "--", "_", "", "n"]);

/**
 * Reads a rendered sheet back, however carefully or carelessly it was filled in.
 *
 * Forgiving on purpose: `B`, `b`, `B.`, `B)` and the option's own text all mean B, because a
 * pass that rejects a reviewer's honest answer over punctuation costs a re-read of 45 items
 * and will quietly stop being run.
 */
export function parseSheet(markdown: string): { poolId: string | null; answers: SheetAnswer[] } {
  const poolId = markdown.match(/blind-pass sheet v1 · pool: ([^\s·]+)/)?.[1] ?? null;
  const blocks = markdown.split(/^## /m).slice(1);
  const answers: SheetAnswer[] = [];

  for (const block of blocks) {
    const heading = block.split("\n", 1)[0];
    const itemId = heading.match(/`([^`#][^`]*)`/)?.[1]?.trim();
    const code = heading.match(/`#([0-9a-f]+)`/)?.[1] ?? "";
    if (!itemId) continue;

    const choices: string[] = [];
    for (const line of block.split("\n")) {
      const option = line.match(/^- ([A-D])\.\s+(.*)$/);
      if (option) choices[LETTER_INDEX[option[1]]] = option[2].trim();
    }

    const answerLine = block.match(/^Answer:(.*)$/m)?.[1]?.trim() ?? "";
    const defensibleLine = block.match(/^Also defensible:(.*)$/m)?.[1]?.trim() ?? "";

    let choice: string | null = null;
    let refused = false;
    if (answerLine === "?" || /^none/i.test(answerLine)) {
      refused = true;
    } else if (answerLine.length > 0) {
      const index = letterToIndex(answerLine);
      if (index !== null && choices[index] !== undefined) {
        choice = choices[index];
      } else {
        // A reviewer who wrote the option out in full rather than its letter.
        const written = choices.find((c) => c.toLowerCase() === answerLine.toLowerCase());
        choice = written ?? null;
        if (!written) refused = true;
      }
    }

    const alsoDefensible: string[] = [];
    if (!NO_SECOND_OPTION.has(defensibleLine.toLowerCase())) {
      for (const token of defensibleLine.split(/[,;/]|\band\b/i)) {
        const index = letterToIndex(token);
        if (index === null || choices[index] === undefined) continue;
        const text = choices[index];
        if (text !== choice && !alsoDefensible.includes(text)) alsoDefensible.push(text);
      }
    }

    answers.push({ itemId, code, choice, refused, alsoDefensible, choices });
  }

  return { poolId, answers };
}

// ---------------------------------------------------------------------------------------
// Resolutions — how a flag gets settled, once
// ---------------------------------------------------------------------------------------

/**
 * What a person decided about a flag.
 *
 * - `key-was-wrong` — the reviewer was right and the item's answer has been corrected.
 * - `reviewer-was-wrong` — the key stands. This is a real and common outcome; recording it is
 *   what keeps the item from being argued about again on every run.
 * - `item-rewritten` — the question itself was the problem and has been rewritten.
 * - `ambiguity-accepted` — a second option was called defensible and, on a person's reading,
 *   is not. The key stands.
 *
 * Two of these change the item, and changing the item changes its `code`, so the resolution
 * stops applying and the item goes back for a fresh blind read. That is intended: a rewritten
 * question has never been blind-checked.
 */
export type ResolutionVerdict =
  | "key-was-wrong"
  | "reviewer-was-wrong"
  | "item-rewritten"
  | "ambiguity-accepted";

export type Resolution = {
  itemId: string;
  /** The `#code` of the question as it stood when this was settled. */
  code: string;
  /** The item's answer as it stood when this was settled. */
  keyAt: string;
  verdict: ResolutionVerdict;
  /** Why. One or two sentences, for the person who reads this in six months. */
  note: string;
  resolvedBy: string;
  /** ISO date, `YYYY-MM-DD`. */
  resolvedAt: string;
};

export type ResolutionFile = {
  poolId: string;
  resolutions: Resolution[];
};

// ---------------------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------------------

export type FlagKind =
  /** The reviewer picked an option that is not the key. */
  | "disagreement"
  /** The reviewer agreed with the key but called another option defensible too. */
  | "ambiguity"
  /** The reviewer said none of the four is right, or could not answer at all. */
  | "unanswerable";

export type Flag = {
  itemId: string;
  kind: FlagKind;
  /** What the reviewer picked; null for `unanswerable`. */
  reviewerChoice: string | null;
  /** What the pool says the answer is. */
  key: string;
  /** Other options the reviewer called defensible. */
  alsoDefensible: string[];
  prompt: string;
  code: string;
  /** The settlement, when one applies to the item as it stands now. */
  resolution?: Resolution;
};

export type BlindPassReport = {
  poolId: string;
  /** Items in the pool. */
  total: number;
  /** Items answered against a sheet that still matches the item. */
  checked: number;
  /** Of those, how many the reviewer answered exactly as the key says, with no second option. */
  agreed: number;
  flags: Flag[];
  /** Flags with no settlement recorded for the item as it stands. These block the pool. */
  unresolved: Flag[];
  /** Items in the pool with no answer on the sheet at all. */
  missing: string[];
  /** Answers whose `#code` no longer matches the item: the question was edited after it was
   *  answered, so the answer is about a question that no longer exists. */
  stale: string[];
  /** Answers on the sheet for item ids the pool does not have. */
  unknown: string[];
  ok: boolean;
};

/**
 * Compares a filled-in sheet against the pool it was cut from.
 *
 * `ok` is true only when every item was answered against the current question, every
 * disagreement and every ambiguity has a recorded settlement, and nothing on the sheet is
 * stale or unrecognised. Silence is not the same as agreement: an unanswered item counts
 * against the pool, because the cheapest way to pass a blind pass is not to do it.
 */
export function compareSheet(
  pool: Pool,
  answers: SheetAnswer[],
  resolutions: Resolution[] = [],
): BlindPassReport {
  const byId = new Map(pool.items.map((item) => [item.id, item]));
  const answered = new Set<string>();
  const flags: Flag[] = [];
  const stale: string[] = [];
  const unknown: string[] = [];
  let checked = 0;
  let agreed = 0;

  for (const answer of answers) {
    const item = byId.get(answer.itemId);
    if (!item) {
      unknown.push(answer.itemId);
      continue;
    }
    const code = questionCode(item);
    if (answer.code !== code) {
      stale.push(answer.itemId);
      continue;
    }
    if (answer.choice === null && !answer.refused) continue; // left blank — counted as missing
    answered.add(answer.itemId);
    checked++;

    const settled = resolutions.find(
      (r) => r.itemId === item.id && r.code === code && r.keyAt === item.answer,
    );
    const flag = (kind: FlagKind): void => {
      flags.push({
        itemId: item.id,
        kind,
        reviewerChoice: answer.choice,
        key: item.answer,
        alsoDefensible: answer.alsoDefensible,
        prompt: item.prompt,
        code,
        ...(settled ? { resolution: settled } : {}),
      });
    };

    if (answer.refused || answer.choice === null) {
      flag("unanswerable");
    } else if (answer.choice !== item.answer) {
      flag("disagreement");
    } else if (answer.alsoDefensible.length > 0) {
      flag("ambiguity");
    } else {
      agreed++;
    }
  }

  const missing = pool.items.map((i) => i.id).filter((id) => !answered.has(id) && !stale.includes(id));
  const unresolved = flags.filter((f) => !f.resolution);

  return {
    poolId: pool.poolId,
    total: pool.items.length,
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
export function formatReport(report: BlindPassReport): string {
  const lines: string[] = [];
  lines.push(
    `${report.poolId}: ${report.checked}/${report.total} answered, ${report.agreed} agreed, ` +
      `${report.flags.length} flagged (${report.unresolved.length} unresolved)`,
  );
  for (const flag of report.flags) {
    const mark = flag.resolution ? `resolved: ${flag.resolution.verdict}` : "UNRESOLVED";
    lines.push(`  [${flag.kind}] ${flag.itemId} — ${mark}`);
    lines.push(`      ${flag.prompt}`);
    if (flag.kind === "disagreement") {
      lines.push(`      key: ${flag.key}   reviewer: ${flag.reviewerChoice}`);
    } else if (flag.kind === "ambiguity") {
      lines.push(`      key: ${flag.key}   also defensible: ${flag.alsoDefensible.join(", ")}`);
    } else {
      lines.push(`      key: ${flag.key}   reviewer: none of these`);
    }
    if (flag.resolution) lines.push(`      ${flag.resolution.note} (${flag.resolution.resolvedBy})`);
  }
  if (report.missing.length) lines.push(`  unanswered: ${report.missing.join(", ")}`);
  if (report.stale.length) lines.push(`  answered before the item changed: ${report.stale.join(", ")}`);
  if (report.unknown.length) lines.push(`  not in the pool: ${report.unknown.join(", ")}`);
  lines.push(report.ok ? "  PASS" : "  FAIL");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------
// Where the files live, and how to drive the whole thing over one pool
//
// This module is dev-time tooling — a script and a test import it, the app never does — so it
// is allowed to touch the filesystem.
// ---------------------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";

export const DRILLS_DIR = path.join(__dirname, "../../content/drills");
export const REVIEW_DIR = path.join(__dirname, "../../content/review");

export const poolPath = (poolId: string): string => path.join(DRILLS_DIR, `${poolId}.json`);
/** The sheet a reviewer answers. One per pool. */
export const sheetPath = (poolId: string): string => path.join(REVIEW_DIR, `${poolId}.blind.md`);
/** Where every flag's settlement is written down. One per pool. */
export const resolutionsPath = (poolId: string): string =>
  path.join(REVIEW_DIR, `${poolId}.resolved.json`);

export function loadPool(poolId: string): Pool {
  return JSON.parse(fs.readFileSync(poolPath(poolId), "utf8")) as Pool;
}

export function loadResolutions(poolId: string): Resolution[] {
  const file = resolutionsPath(poolId);
  if (!fs.existsSync(file)) return [];
  return (JSON.parse(fs.readFileSync(file, "utf8")) as ResolutionFile).resolutions ?? [];
}

/** Every pool that has a sheet on disk. */
export function poolsWithSheets(): string[] {
  if (!fs.existsSync(REVIEW_DIR)) return [];
  return fs
    .readdirSync(REVIEW_DIR)
    .filter((f) => f.endsWith(".blind.md"))
    .map((f) => f.replace(/\.blind\.md$/, ""))
    .sort();
}

/**
 * Cut a sheet for a pool. Refuses to overwrite a sheet that already carries answers unless
 * `force` is passed — a regenerated sheet is byte-identical when nothing changed, so an
 * overwrite can only ever destroy a reviewer's work.
 */
/**
 * Fill a freshly rendered sheet with the answers an existing sheet already carries, but ONLY
 * for questions whose `#code` is unchanged.
 *
 * The code is a fingerprint of the question as the reviewer read it — its prompt and its four
 * options — so an unchanged code means the reviewer answered exactly this question. Editing
 * one item used to blank the whole sheet: 224 valid answers were thrown away to re-ask three
 * questions, and re-reading 224 questions nobody touched is how a reviewer stops reading
 * carefully.
 *
 * An edited item's code changes, so its answer is dropped and the item comes back blank — which
 * is the behaviour that matters and is not weakened here.
 */
export function carryForward(next: string, existing: string): string {
  const byCode = new Map<string, SheetAnswer>();
  for (const a of parseSheet(existing).answers) {
    if (a.choice !== null || a.refused) byCode.set(a.code, a);
  }
  if (byCode.size === 0) return next;

  const lines = next.split("\n");
  let code: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const heading = /^## \d+\. `[^`]+` `#([0-9a-f]+)`/.exec(lines[i]);
    if (heading) {
      code = heading[1];
      continue;
    }
    const carried = code ? byCode.get(code) : undefined;
    if (!carried) continue;
    if (lines[i] === "Answer:") {
      const letter = carried.refused ? "?" : LETTERS[carried.choices.indexOf(carried.choice!)];
      // A carried answer whose option is no longer on the sheet is dropped, not guessed at.
      if (letter !== undefined) lines[i] = `Answer: ${letter}`;
    } else if (lines[i] === "Also defensible:") {
      const letters = carried.alsoDefensible
        .map((text) => LETTERS[carried.choices.indexOf(text)])
        .filter((l): l is (typeof LETTERS)[number] => l !== undefined);
      lines[i] = `Also defensible: ${letters.length ? letters.join(", ") : "none"}`;
    }
  }
  return lines.join("\n");
}

export function writeSheet(pool: Pool, force = false): { path: string; written: boolean } {
  const file = sheetPath(pool.poolId);
  let next = renderSheet(extractSheet(pool));
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, "utf8");
    if (existing === next) return { path: file, written: false };
    const answered = parseSheet(existing).answers.some((a) => a.choice !== null || a.refused);
    if (answered && !force) {
      throw new Error(
        `${file} already has answers on it. Pass force to replace it: answers to questions that ` +
          `did not change are carried over, and every edited question comes back blank.`,
      );
    }
    if (answered) next = carryForward(next, existing);
  }
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
  fs.writeFileSync(file, next);
  return { path: file, written: true };
}

/** Compare the sheet on disk for a pool against the pool and its recorded settlements. */
export function runPool(poolId: string): BlindPassReport {
  const pool = loadPool(poolId);
  const file = sheetPath(poolId);
  const answers = fs.existsSync(file) ? parseSheet(fs.readFileSync(file, "utf8")).answers : [];
  return compareSheet(pool, answers, loadResolutions(poolId));
}
