import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A hero carries one grade per strand. Every strand's grade must be reached through the
 * deed's OWN area — `gradeForDeed(hero, deed)`, or `hero.grades[someArea]` — never by
 * naming a strand outright.
 *
 * The failure this prevents: a call site reaches for `hero.grades.math` and every strand
 * is silently served at the math grade. A child whose grown-up moved reading two years
 * down would get reading at their math grade instead, and nothing would look wrong — the
 * page renders, the questions are real questions, and the whole suite stays green. That
 * exact mutation was applied to `startDeedRun` during review and survived 1267 tests,
 * because `startDeedRun` is an async server action with no seam a unit test can reach.
 *
 * So this checks the source instead. It is honest about what it can see: "does production
 * code name a strand when asking for a grade" is a property of the text, and the text is
 * what a future refactor would change.
 */

const ROOTS = [join(process.cwd(), "src/lib"), join(process.cwd(), "src/app")];
const STRANDS = ["math", "reading", "language", "science"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(name)) return [];
    // Tests may name a strand — that is exactly how they pin the mapping.
    if (/\.test\.tsx?$/.test(name)) return [];
    return [full];
  });
}

const files = ROOTS.flatMap(sourceFiles);

describe("no production call site asks for one strand's grade by name", () => {
  it("finds the source files to scan, so the rule below is not vacuous", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("never reads .grades.<strand> outside a test", () => {
    const offenders: string[] = [];
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      for (const strand of STRANDS) {
        // `.grades.math` and friends. `grades[deed.area]` is the correct form and is untouched.
        if (new RegExp(`\\.grades\\.${strand}\\b`).test(source)) {
          offenders.push(`${path.slice(process.cwd().length + 1)} reads .grades.${strand}`);
        }
      }
    }
    expect(offenders, offenders.join("; ")).toEqual([]);
  });
});
