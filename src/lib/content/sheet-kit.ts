/**
 * The parts of a blind-pass sheet that do not depend on what is being answered, shared by the sort
 * sheets (`sort-blind-pass.ts`) and the trail sheets (`trail-blind-pass.ts`), so there is one copy
 * (F-12). What a sheet's items look like, and what counts as a valid answer, stay with each format.
 *
 * Every sheet line is `- \`#<code>\` <the thing shown> | Answer:<answer>`. The `#code` is a
 * fingerprint of exactly what the reviewer was shown, so an answer is only ever trusted for the
 * thing it was given for.
 *
 * Dev-time tooling: nothing the app serves imports this.
 */
import type { Resolution } from "./blind-pass";

// ---------------------------------------------------------------------------------------
// Reading an `Answer:` line
// ---------------------------------------------------------------------------------------

/** Words that mean "more than one answer can be defended": an ambiguity, as much a defect as a wrong key. */
export const BOTH_WORDS: ReadonlySet<string> = new Set(["both", "either"]);
/** Words that mean "none of them fits, or it cannot be answered": unanswerable. */
export const NEITHER_WORDS: ReadonlySet<string> = new Set(["?", "none", "neither", "n/a", "na", "unsure", "-", "--"]);

/** A sheet line with an answer slot, filled or not. Group 1 is the code, group 2 what follows `Answer:`. */
export const ANSWER_LINE = /^- `#([0-9a-f]+)` .*\| Answer:(.*)$/;
/** A sheet line whose answer slot is still empty. Group 1 is the code. */
export const BLANK_ANSWER_LINE = /^- `#([0-9a-f]+)` .*\| Answer:$/;

/** Every `{ code, raw }` answer slot in `markdown`, in order, `raw` being the text after `Answer:` (not yet interpreted). */
export function answerSlots(markdown: string): { code: string; raw: string }[] {
  const slots: { code: string; raw: string }[] = [];
  for (const line of markdown.split("\n")) {
    const m = ANSWER_LINE.exec(line);
    if (m) slots.push({ code: m[1], raw: m[2] });
  }
  return slots;
}

/** What a reviewer wrote, in the words every format shares. `value` and `rest` are lower-cased and trimmed. */
export type ReadAnswer =
  /** Left empty: counted as missing. */
  | { kind: "blank" }
  /** `both`, then (for a format that takes them) whatever else was written after it. */
  | { kind: "both"; rest: string }
  /** `?` and its synonyms. */
  | { kind: "refused" }
  /** Anything else: the format decides whether it is an answer it knows. */
  | { kind: "value"; value: string };

/**
 * Interprets the text after `Answer:`, however carefully or carelessly it was written: trailing
 * punctuation, case and spacing do not matter. A pass that rejects an honest answer over punctuation
 * costs a re-read and will quietly stop being run.
 */
export function readAnswer(text: string): ReadAnswer {
  const raw = text.trim().replace(/[).:,]+$/, "").trim().toLowerCase();
  if (raw === "") return { kind: "blank" };
  if (NEITHER_WORDS.has(raw)) return { kind: "refused" };
  if (BOTH_WORDS.has(raw)) return { kind: "both", rest: "" };
  const [first, ...others] = raw.split(/\s+/);
  const lead = first.replace(/[:,.]+$/, "");
  if (others.length > 0 && BOTH_WORDS.has(lead)) return { kind: "both", rest: others.join(" ") };
  return { kind: "value", value: raw };
}

// ---------------------------------------------------------------------------------------
// Re-cutting a sheet that already has answers
// ---------------------------------------------------------------------------------------

/**
 * Fills a freshly rendered sheet with answers an earlier sheet carried, keyed by `#code` (or, when the
 * sheet has sections whose heading matches `scope`, by `<section>/<code>`). Only blank slots are
 * filled, and only when the key is carried: an edited item has a new code, so it comes back blank.
 * `carried` maps each key to the answer text to write after `Answer:`.
 */
export function carryForwardByCode(next: string, carried: ReadonlyMap<string, string>, scope?: RegExp): string {
  if (carried.size === 0) return next;
  let section: string | null = null;
  return next
    .split("\n")
    .map((line) => {
      const heading = scope?.exec(line);
      if (heading) {
        section = heading[1];
        return line;
      }
      const m = BLANK_ANSWER_LINE.exec(line);
      if (!m) return line;
      const key = scope ? (section ? `${section}/${m[1]}` : null) : m[1];
      const text = key === null ? undefined : carried.get(key);
      return text === undefined ? line : `${line} ${text}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------------------
// Resolutions and the printed report
// ---------------------------------------------------------------------------------------

/** The settlement recorded for this item as it stands now: its id, its code and its key must all still match. */
export function findResolution(resolutions: readonly Resolution[], itemId: string, code: string, keyAt: string): Resolution | undefined {
  return resolutions.find((r) => r.itemId === itemId && r.code === code && r.keyAt === keyAt);
}

/** Flags with no settlement recorded. These block the pool. */
export function unresolvedOf<T extends { resolution?: Resolution }>(flags: readonly T[]): T[] {
  return flags.filter((f) => !f.resolution);
}

/** One flag as printed lines: its heading, the `detail` lines (indented), and the settlement's note when there is one. */
export function flagLines(flag: { kind: string; itemId: string; resolution?: Resolution }, detail: readonly string[]): string[] {
  const mark = flag.resolution ? `resolved: ${flag.resolution.verdict}` : "UNRESOLVED";
  const lines = [`  [${flag.kind}] ${flag.itemId} — ${mark}`, ...detail.map((d) => `      ${d}`)];
  if (flag.resolution) lines.push(`      ${flag.resolution.note} (${flag.resolution.resolvedBy})`);
  return lines;
}

/** The lines every report ends with: what was never answered, what went stale, what the pool does not have, and the verdict. */
export function closingLines(r: { missing: readonly string[]; stale: readonly string[]; unknown: readonly string[]; ok: boolean }): string[] {
  const lines: string[] = [];
  if (r.missing.length) lines.push(`  unanswered: ${r.missing.join(", ")}`);
  if (r.stale.length) lines.push(`  answered before the item changed: ${r.stale.join(", ")}`);
  if (r.unknown.length) lines.push(`  not in the pool: ${r.unknown.join(", ")}`);
  lines.push(r.ok ? "  PASS" : "  FAIL");
  return lines;
}
