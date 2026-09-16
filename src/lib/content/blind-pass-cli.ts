/**
 * Driving the blind answer pass (§6.5.2) from a terminal.
 *
 *   npx tsx src/lib/content/blind-pass-cli.ts extract <poolId...|--all> [--force]
 *   npx tsx src/lib/content/blind-pass-cli.ts compare <poolId...|--all>
 *
 * `extract` cuts `src/content/review/<poolId>.blind.md`, a key-free sheet. An independent
 * reader — a person, or an agent that has not read the pool file — answers every question on
 * it. `compare` reads the filled-in sheet back and reports every disagreement, every item the
 * reviewer called ambiguous, and every item nobody answered. It exits non-zero while anything
 * is outstanding, so it can gate a commit.
 *
 * A flag is settled by adding an entry to `src/content/review/<poolId>.resolved.json`; see the
 * `Resolution` type in `blind-pass.ts` for the fields and what each verdict means.
 *
 * `npx vitest run src/lib/content/blind-pass.test.ts` runs `compare` over every sheet on disk,
 * so an unsettled flag fails the suite as well as this command.
 */
import fs from "node:fs";
import {
  DRILLS_DIR,
  formatReport,
  loadPool,
  runPool,
  writeSheet,
} from "./blind-pass";

const USAGE = `usage:
  npx tsx src/lib/content/blind-pass-cli.ts extract <poolId...|--all> [--force]
  npx tsx src/lib/content/blind-pass-cli.ts compare <poolId...|--all>`;

function allPoolIds(): string[] {
  return fs
    .readdirSync(DRILLS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function main(): number {
  const args = process.argv.slice(2);
  const command = args[0];
  const force = args.includes("--force");
  const named = args.slice(1).filter((a) => !a.startsWith("--"));
  const poolIds = args.includes("--all") ? allPoolIds() : named;

  if ((command !== "extract" && command !== "compare") || poolIds.length === 0) {
    console.error(USAGE);
    return 2;
  }

  if (command === "extract") {
    for (const poolId of poolIds) {
      const { path: file, written } = writeSheet(loadPool(poolId), force);
      console.log(written ? `wrote ${file}` : `unchanged ${file}`);
    }
    console.log("\nAnswer every question on these sheets WITHOUT opening src/content/drills.");
    return 0;
  }

  let failed = 0;
  for (const poolId of poolIds) {
    const report = runPool(poolId);
    console.log(formatReport(report));
    if (!report.ok) failed++;
  }
  if (failed > 0) console.log(`\n${failed} pool(s) with something outstanding.`);
  return failed > 0 ? 1 : 0;
}

process.exit(main());
