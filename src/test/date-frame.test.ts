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
 * Standalone maintenance scripts, run manually via `npx tsx <path>` and
 * imported by no application code — not part of any request path, so no
 * family's browser ever renders a date either one computes.
 *
 * - `src/lib/db/seed-demo.ts`: seeds local demo data. Its `isoDate()` helper
 *   is excluded rather than migrated to `addDays`/`todayInZone`.
 * - `src/lib/db/backfill-streaks.ts`: one-off streak repair. It documents
 *   in-file why UTC is deliberate here (a single snapshot for a whole-table
 *   sweep across every family in one run, not a per-family "today"), so this
 *   is a documented design choice, not a missed call site.
 */
const SCRIPT_EXCLUSIONS = ["src/lib/db/seed-demo.ts", "src/lib/db/backfill-streaks.ts"];

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

/** Strips comments so prose explaining a construct is not mistaken for using it. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<!:)\/\/.*$/gm, "");
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(resolve(process.cwd(), dir))) {
    const rel = join(dir, entry);
    if (statSync(resolve(process.cwd(), rel)).isDirectory()) {
      sourceFiles(rel, found);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(rel);
    }
  }
  return found;
}

describe("calendar dates are never derived from UTC", () => {
  const files = sourceFiles("src").filter(
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
