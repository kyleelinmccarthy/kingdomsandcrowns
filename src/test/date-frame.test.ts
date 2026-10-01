import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * A calendar date must never be derived from UTC.
 *
 * This decays silently: nothing fails loudly when someone writes
 * `new Date().toISOString().slice(0, 10)` — a family in Denver just starts
 * seeing their evening work filed under tomorrow again. So it is checked
 * structurally.
 *
 * `src/lib/utils/dates.ts` is the one place allowed to do this, because that
 * is where the conversion is deliberately implemented and tested.
 */
const DATE_MODULE = "src/lib/utils/dates.ts";

/**
 * `src/lib/db/seed-demo.ts` is a standalone script, run manually via `npx tsx
 * src/lib/db/seed-demo.ts` and imported by no application code — it seeds
 * local demo data only, not part of any request path, so no family's browser
 * ever renders a date it computes. Its `isoDate()` helper is excluded rather
 * than migrated to `addDays`/`todayInZone` for that reason.
 *
 * `src/lib/db/backfill-streaks.ts` was considered for the same treatment and
 * rejected: it writes `current_streak`/`longest_streak`, which a family sees
 * directly, so a UTC snapshot there is the same bug this feature removes
 * everywhere else, just relocated into a maintenance script. It now resolves
 * each family's "today" via `todayInZone` and is not exempted here.
 *
 * `scripts/backfill-timezone-dates.ts` writes `activity_log.date` and
 * `child.last_active_date`, both family-visible, so it is not exempted
 * either — it resolves each row's date via `correctedDate`/`todayInZone`
 * rather than deriving one from UTC directly.
 */
const SCRIPT_EXCLUSIONS = ["src/lib/db/seed-demo.ts"];

/** Directories walked for forbidden UTC-date derivation. */
const SCAN_DIRS = ["src", "scripts"];

/**
 * Patterns that turn a value into a calendar date string.
 *
 * NOT forbidden: a bare `.toISOString()` serializing a timestamp for the
 * client. That is a real instant crossing the wire, not a calendar date —
 * `settings/page.tsx` and `parent-alerts.ts` both do it legitimately.
 */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/, why: "derives a calendar date from UTC" },
  { pattern: /toISOString\(\)\s*\.\s*split\(\s*["'`]T["'`]\s*\)\s*\[\s*0\s*\]/, why: "derives a calendar date from UTC" },
];

/**
 * Strips comments so prose explaining a construct is not mistaken for using
 * it. A `//` only starts a line comment when it opens the line or follows
 * whitespace — not when it's part of a URL, e.g. `https://x.com` (preceded
 * by `:`) or a protocol-relative/query-string one like `"//cdn.example.com"`
 * or `"?next=//example.com"` (preceded by a quote). Treating those as
 * comment starts would eat the rest of the line — including a real
 * violation later on that same line — which is the dangerous direction for
 * a guard to be wrong in.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(resolve(process.cwd(), dir))) {
    const rel = join(dir, entry);
    if (statSync(resolve(process.cwd(), rel)).isDirectory()) {
      sourceFiles(rel, found);
    } else if (/\.(m|c)?[jt]sx?$/.test(entry) && !/\.test\.(m|c)?[jt]sx?$/.test(entry)) {
      found.push(rel);
    }
  }
  return found;
}

describe("calendar dates are never derived from UTC", () => {
  const files = SCAN_DIRS.flatMap((dir) => sourceFiles(dir)).filter(
    (f) => f !== DATE_MODULE && !SCRIPT_EXCLUSIONS.includes(f)
  );

  it("finds source files to check", () => {
    // Guards against the walk silently matching nothing.
    expect(files.length).toBeGreaterThan(50);
  });

  it("no file outside the date module derives a calendar date from UTC", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(resolve(process.cwd(), file), "utf8"));
      for (const { pattern, why } of FORBIDDEN) {
        if (pattern.test(source)) offenders.push(`${file} — ${why}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("still allows serializing a timestamp for the client", () => {
    // A bare toISOString() on an instant is legitimate and must not be caught.
    const legitimate = "createdAt: alert.createdAt.toISOString(),";
    for (const { pattern } of FORBIDDEN) {
      expect(pattern.test(legitimate)).toBe(false);
    }
  });
});
